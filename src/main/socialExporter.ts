/**
 * Social Package Exporter
 *
 * Exports a set of Instagram posts to a folder:
 *  - Single posts: resized/cropped to 1080×1080 JPEG
 *  - Carousel posts: subfolder with numbered slides (1080×1080)
 *  - Split tiles: each tile cropped from the source image → 1080×1080
 *
 * File naming: post_01.jpg, post_02.jpg, post_03_carousel/1.jpg, …
 * Posting order: reversed (post_N.jpg first → appears in bottom-right of grid)
 */

import { spawn } from 'child_process'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { BrowserWindow } from 'electron'

const execFileAsync = promisify(execFile)

// ── FFmpeg / sips ──────────────────────────────────────────────────────────────

function getFFmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null
    if (p) return p
  } catch { /* fall through */ }
  return 'ffmpeg'
}

const FFMPEG = getFFmpegPath()

// macOS system font for drawtext — present on all macOS versions.
// Required because ffmpeg-static ships without fontconfig configuration,
// causing drawtext to crash (SIGSEGV / exit null) when no fontfile is specified.
const MACOS_FONT = '/System/Library/Fonts/Helvetica.ttc'

// Instagram feed post dimensions (4:5 portrait, mandatory)
const OUT_W = 1080
const OUT_H = 1350

// ── Types (mirrored from renderer types) ──────────────────────────────────────

type SocialPostType = 'single' | 'carousel' | 'split-tile'
type SplitLayout = '2h' | '3h' | '2v' | '4' | '6' | '9'

export interface SocialExportScene {
  postNumber: number
  type: SocialPostType
  imagePaths: string[]
  splitLayout?: SplitLayout
  splitTileIndex?: number
  isCarousel?: boolean
  cropState?: { panX: number; panY: number; zoom: number }
  imageDims?: { width: number; height: number }
}

// ── Logging ────────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[SocialExporter] ${new Date().toISOString()} ${msg}`)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function convertHeicIfNeeded(srcPath: string, tmpDir: string): Promise<string> {
  const ext = path.extname(srcPath).toLowerCase()
  if (ext !== '.heic' && ext !== '.heif') return srcPath
  const outName = path.basename(srcPath, ext) + '_conv.jpg'
  const outPath = path.join(tmpDir, outName)
  await execFileAsync('sips', ['-s', 'format', 'jpeg', srcPath, '--out', outPath])
  return outPath
}

interface ImageDims { width: number; height: number }

async function probeImage(imagePath: string): Promise<ImageDims> {
  const { stdout } = await execFileAsync('sips', ['--getProperty', 'pixelWidth', '--getProperty', 'pixelHeight', imagePath])
  const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/)
  const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/)
  return {
    width: widthMatch ? parseInt(widthMatch[1]) : 1080,
    height: heightMatch ? parseInt(heightMatch[1]) : 1080
  }
}

const LAYOUT_DIMS: Record<SplitLayout, [number, number]> = {
  '2h': [2, 1], '3h': [3, 1], '2v': [1, 2],
  '4': [2, 2], '6': [3, 2], '9': [3, 3]
}

/**
 * Compute the exact crop rectangle for one tile of a split post.
 *
 * Step 1 — Frame: center-crop the source image to the canvas aspect ratio (cols:rows).
 *   This is the same framing that CSS object-fit:cover uses when rendering the full canvas.
 * Step 2 — Tile: divide the frame into cols×rows equal pieces.
 *   Each resulting tile is square (tileW === tileH) because frameW/frameH === cols/rows.
 */
function computeTileCrop(
  layout: SplitLayout,
  tileIndex: number,
  imgW: number,
  imgH: number
): { x: number; y: number; w: number; h: number } {
  const [cols, rows] = LAYOUT_DIMS[layout]

  const sourceRatio = imgW / imgH
  const targetRatio = cols / rows
  let frameX: number, frameY: number, frameW: number, frameH: number
  if (sourceRatio > targetRatio) {
    frameH = imgH
    frameW = imgH * targetRatio
    frameX = (imgW - frameW) / 2
    frameY = 0
  } else {
    frameW = imgW
    frameH = imgW / targetRatio
    frameX = 0
    frameY = (imgH - frameH) / 2
  }

  const tileW = frameW / cols
  const tileH = frameH / rows
  const col = tileIndex % cols
  const row = Math.floor(tileIndex / cols)

  return {
    x: Math.round(frameX + col * tileW),
    y: Math.round(frameY + row * tileH),
    w: Math.round(tileW),
    h: Math.round(tileH),
  }
}

/**
 * Run FFmpeg and reject with a meaningful error (includes stderr + signal info).
 */
function runFFmpeg(args: string[], tag: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (buf: Buffer) => { stderr += buf.toString() })
    proc.on('error', (err) => reject(new Error(`${tag}: failed to spawn FFmpeg — ${err.message}`)))
    proc.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        const reason = signal ? `killed by signal ${signal}` : `exit code ${code}`
        reject(new Error(`${tag}: FFmpeg ${reason}\n${stderr.slice(-1500)}`))
      }
    })
  })
}

// Render image to OUT_W × OUT_H (1080×1350, 4:5 portrait).
// Default: scale to fit, pad remainder with black (no stretching, no cropping).
// With cropState: scale to cover, apply user pan/zoom, then crop to exact output size.
async function renderPortrait(
  srcPath: string,
  outPath: string,
  cropState?: { panX: number; panY: number; zoom: number },
  srcDims?: { width: number; height: number }
): Promise<void> {
  let vf: string
  if (cropState && (cropState.zoom !== 1.0 || cropState.panX !== 0 || cropState.panY !== 0)) {
    const dims = srcDims ?? await probeImage(srcPath)
    const { width: W, height: H } = dims
    log(`  renderPortrait crop: src=${W}x${H} → ${OUT_W}x${OUT_H}`)

    // Scale to cover OUT_W × OUT_H, apply user zoom on top
    const baseFitScale = Math.max(OUT_W / W, OUT_H / H)
    const userZoom = cropState.zoom ?? 1.0
    const finalScale = baseFitScale * userZoom

    const scaledW = Math.round(W * finalScale)
    const scaledH = Math.round(H * finalScale)

    // Display cell in SocialMode is approximately 300×375 (4:5)
    const displayCoverScale = Math.max(300 / W, 375 / H)
    const cssToExportRatio = baseFitScale / displayCoverScale

    const panX_export = (cropState.panX ?? 0) * cssToExportRatio
    const panY_export = (cropState.panY ?? 0) * cssToExportRatio

    const cropX = Math.round(Math.max(0, Math.min(scaledW - OUT_W, (scaledW - OUT_W) / 2 - panX_export)))
    const cropY = Math.round(Math.max(0, Math.min(scaledH - OUT_H, (scaledH - OUT_H) / 2 - panY_export)))

    vf = `scale=${scaledW}:${scaledH},crop=${OUT_W}:${OUT_H}:${cropX}:${cropY}`
  } else {
    // Scale to fit within OUT_W × OUT_H, pad to exact size with black
    vf = `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,` +
         `pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2:black`
  }

  await runFFmpeg([
    '-i', srcPath,
    '-vf', vf,
    '-q:v', '2',
    '-frames:v', '1',
    outPath
  ], `renderPortrait(${path.basename(srcPath)})`)
}

// Crop a tile from image and scale to OUT_W × OUT_H (1080×1350) with padding
async function renderTile(
  srcPath: string,
  crop: { x: number; y: number; w: number; h: number },
  outPath: string
): Promise<void> {
  const { x, y, w, h } = crop
  const vf = `crop=${w}:${h}:${x}:${y},` +
             `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,` +
             `pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2:black`
  await runFFmpeg([
    '-i', srcPath,
    '-vf', vf,
    '-q:v', '2',
    '-frames:v', '1',
    outPath
  ], `renderTile(${path.basename(srcPath)})`)
}

async function addNumberOverlay(srcPath: string, outPath: string, label: string): Promise<void> {
  const vf = [
    'drawbox=x=0:y=ih-90:w=iw:h=90:color=black@0.55:t=fill',
    `drawtext=fontfile='${MACOS_FONT}':text='${label}':fontsize=40:fontcolor=white:x=(w-tw)/2:y=h-65:shadowcolor=black:shadowx=2:shadowy=2`
  ].join(',')
  await runFFmpeg([
    '-i', srcPath,
    '-vf', vf,
    '-q:v', '2',
    '-frames:v', '1',
    outPath
  ], `addNumberOverlay(${path.basename(srcPath)})`)
}

/**
 * Build one page of the posting guide as a JPEG image.
 * `pagePaths` is a slice of the full posting-order array for this page.
 * `pageOffset` is the 0-based index of the first post on this page (for numbering).
 * `totalPosts` is the grand total (for FIRST/LAST labels).
 */
async function generateGuidePage(
  pagePaths: string[],
  pageOffset: number,
  totalPosts: number,
  outputPath: string
): Promise<void> {
  // Thumbnails at 4:5 ratio to match feed posts (1080×1350 → 270×338)
  const THUMB_W = 270
  const THUMB_H = 338
  const MAX_COLS = 3
  const COLS = Math.min(MAX_COLS, pagePaths.length)
  const ROWS = Math.ceil(pagePaths.length / COLS)
  const FULL_ROW_W = MAX_COLS * THUMB_W  // 810px — all rows padded to this width

  const inputArgs = pagePaths.flatMap(p => ['-i', p])
  const filterParts: string[] = []

  // Per-image thumbnail with label
  // scale+pad to exact THUMB_W × THUMB_H → guarantees identical dimensions for hstack
  pagePaths.forEach((_, i) => {
    const globalStep = pageOffset + i + 1
    const suffix = globalStep === 1 ? ' FIRST' : globalStep === totalPosts ? ' LAST' : ''
    const label = `POST ${globalStep}${suffix}`
    filterParts.push(
      `[${i}:v]` +
      `scale=${THUMB_W}:${THUMB_H}:force_original_aspect_ratio=decrease,` +
      `pad=${THUMB_W}:${THUMB_H}:(ow-iw)/2:(oh-ih)/2:black,` +
      `drawbox=x=0:y=${THUMB_H - 56}:w=${THUMB_W}:h=56:color=black@0.75:t=fill,` +
      `drawtext=fontfile='${MACOS_FONT}':text='${label}':fontsize=26:fontcolor=white:x=(w-tw)/2:y=${THUMB_H - 42}:shadowcolor=black:shadowx=1:shadowy=1` +
      `[t${i}]`
    )
  })

  // Build rows — partial rows are padded to FULL_ROW_W so vstack never sees mismatched widths
  const rowLabels: string[] = []
  for (let r = 0; r < ROWS; r++) {
    const rowItems: string[] = []
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      if (idx < pagePaths.length) rowItems.push(`[t${idx}]`)
    }
    if (rowItems.length === 0) continue

    const rowLabel = `[row${r}]`
    const isPartial = rowItems.length < MAX_COLS
    const tempLabel = `[rowraw${r}]`

    if (rowItems.length === 1) {
      // Single item — pad directly to full row width
      filterParts.push(`${rowItems[0]}pad=${FULL_ROW_W}:${THUMB_H}:0:0:black${rowLabel}`)
    } else if (isPartial) {
      // Partial row: hstack first, then pad to full row width
      filterParts.push(`${rowItems.join('')}hstack=inputs=${rowItems.length}${tempLabel}`)
      filterParts.push(`${tempLabel}pad=${FULL_ROW_W}:${THUMB_H}:0:0:black${rowLabel}`)
    } else {
      // Full row
      filterParts.push(`${rowItems.join('')}hstack=inputs=${rowItems.length}${rowLabel}`)
    }

    rowLabels.push(rowLabel)
  }

  if (rowLabels.length === 1) {
    const last = filterParts.length - 1
    filterParts[last] = filterParts[last].replace('[row0]', '[out]')
  } else {
    filterParts.push(`${rowLabels.join('')}vstack=inputs=${rowLabels.length}[out]`)
  }

  await runFFmpeg([
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-q:v', '2',
    '-frames:v', '1',
    outputPath
  ], `generateGuidePage(${path.basename(outputPath)})`)

  log(`Guide page written: ${outputPath}`)
}

async function generatePostingGuide(
  exportedPaths: string[],   // ordered from posting step 1 to N (reverse grid order)
  outputDir: string
): Promise<string[]> {
  if (exportedPaths.length === 0) {
    throw new Error('generatePostingGuide: no images provided')
  }

  log(`Generating posting guide: ${exportedPaths.length} images`)

  // Validate all input files exist before starting
  for (const p of exportedPaths) {
    try {
      await fs.access(p)
    } catch {
      throw new Error(`generatePostingGuide: input file not found: ${p}`)
    }
  }

  const PAGE_SIZE = 9  // 3×3 grid per page — readable on phone
  const pageCount = Math.ceil(exportedPaths.length / PAGE_SIZE)
  const outputPaths: string[] = []

  for (let page = 0; page < pageCount; page++) {
    const slice = exportedPaths.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const filename = pageCount === 1
      ? '00_POSTING_GUIDE.jpg'
      : `00_POSTING_GUIDE_${String(page + 1).padStart(2, '0')}.jpg`
    const outputPath = path.join(outputDir, filename)
    await generateGuidePage(slice, page * PAGE_SIZE, exportedPaths.length, outputPath)
    outputPaths.push(outputPath)
  }

  return outputPaths
}

// ── Input validation ───────────────────────────────────────────────────────────

function validateScenes(scenes: SocialExportScene[]): string | null {
  if (!scenes || scenes.length === 0) return 'No scenes to export'
  for (const scene of scenes) {
    if (!scene.imagePaths || scene.imagePaths.length === 0) {
      return `Post ${scene.postNumber} has no images`
    }
    for (const p of scene.imagePaths) {
      if (!p || typeof p !== 'string') {
        return `Post ${scene.postNumber} has an invalid image path`
      }
    }
    if (scene.type === 'split-tile') {
      if (scene.splitLayout === undefined || scene.splitTileIndex === undefined) {
        return `Post ${scene.postNumber} (split-tile) is missing layout or tile index`
      }
    }
  }
  return null
}

// ── Main export function ───────────────────────────────────────────────────────

export async function exportSocialPackage(
  scenes: SocialExportScene[],
  outputDir: string,
  win: BrowserWindow,
  options: { includeOrderOverlay: boolean } = { includeOrderOverlay: true }
): Promise<void> {
  log(`Export start — ${scenes.length} scenes → ${outputDir}`)

  // Validate inputs before doing any work
  const validationError = validateScenes(scenes)
  if (validationError) throw new Error(`Export validation failed: ${validationError}`)

  if (!outputDir) throw new Error('No output directory specified')

  // Ensure output dir exists
  await fs.mkdir(outputDir, { recursive: true })

  const tmpDir = path.join(outputDir, '_tmp_gf')
  await fs.mkdir(tmpDir, { recursive: true })

  const total = scenes.reduce((acc, s) => {
    if (s.type === 'carousel') return acc + s.imagePaths.length
    return acc + 1
  }, 0)
  let done = 0

  const progress = (stage: string) => {
    const percent = Math.round((done / Math.max(1, total)) * 100)
    if (!win.isDestroyed()) {
      win.webContents.send('social-export-progress', { percent, stage })
    }
  }

  // Track exported file paths in grid order for posting guide
  const postExportedPaths: string[] = []

  try {
    for (const scene of scenes) {
      const numStr = String(scene.postNumber).padStart(2, '0')
      log(`Processing post ${scene.postNumber}/${scenes.length} (${scene.type}) → ${OUT_W}x${OUT_H}`)
      progress(`Processing post ${scene.postNumber}/${scenes.length}…`)

      if (scene.type === 'single') {
        const srcPath = await convertHeicIfNeeded(scene.imagePaths[0], tmpDir)
        const dims = await probeImage(srcPath)
        log(`  input: ${dims.width}x${dims.height}`)
        const outPath = path.join(outputDir, `post_${numStr}.jpg`)
        await renderPortrait(srcPath, outPath, scene.cropState, dims)
        done++

        if (options.includeOrderOverlay) {
          const postingStep = scenes.length - scene.postNumber + 1
          const tempPath = outPath.replace('.jpg', '_tmp.jpg')
          await fs.rename(outPath, tempPath)
          const label = `POST ${postingStep} OF ${scenes.length}`
          await addNumberOverlay(tempPath, outPath, label)
          await fs.unlink(tempPath).catch(() => {})
        }

        postExportedPaths.push(outPath)

      } else if (scene.type === 'carousel') {
        const subdir = path.join(outputDir, `post_${numStr}_carousel`)
        await fs.mkdir(subdir, { recursive: true })
        let firstSlidePath = ''
        for (let i = 0; i < scene.imagePaths.length; i++) {
          const srcPath = await convertHeicIfNeeded(scene.imagePaths[i], tmpDir)
          const outPath = path.join(subdir, `${i + 1}.jpg`)
          await renderPortrait(srcPath, outPath, i === 0 ? scene.cropState : undefined, i === 0 ? scene.imageDims : undefined)
          done++
          progress(`Carousel post ${scene.postNumber}: slide ${i + 1}/${scene.imagePaths.length}`)
          if (i === 0) firstSlidePath = outPath
        }
        if (!firstSlidePath) throw new Error(`Post ${scene.postNumber} carousel produced no slides`)
        postExportedPaths.push(firstSlidePath)

      } else if (scene.type === 'split-tile') {
        if (scene.splitLayout === undefined || scene.splitTileIndex === undefined) {
          throw new Error(`Post ${scene.postNumber}: split-tile missing layout or tileIndex`)
        }
        const srcPath = await convertHeicIfNeeded(scene.imagePaths[0], tmpDir)
        const dims = await probeImage(srcPath)
        const crop = computeTileCrop(scene.splitLayout, scene.splitTileIndex, dims.width, dims.height)
        const outPath = path.join(outputDir, `post_${numStr}.jpg`)
        await renderTile(srcPath, crop, outPath)
        done++

        if (options.includeOrderOverlay) {
          const postingStep = scenes.length - scene.postNumber + 1
          const tempPath = outPath.replace('.jpg', '_tmp.jpg')
          await fs.rename(outPath, tempPath)
          const label = `POST ${postingStep} OF ${scenes.length}`
          await addNumberOverlay(tempPath, outPath, label)
          await fs.unlink(tempPath).catch(() => {})
        }

        postExportedPaths.push(outPath)
      }

      log(`Post ${scene.postNumber} done`)
      progress(`Post ${scene.postNumber} done`)
    }

    // Generate posting guide
    if (postExportedPaths.length > 0) {
      log(`Generating posting guide for ${postExportedPaths.length} posts…`)
      progress('Generating posting guide…')
      // Posting order is reverse of grid order (last grid post = first to post)
      const postingOrder = [...postExportedPaths].reverse()
      await generatePostingGuide(postingOrder, outputDir)
    }

    log('Export complete')

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }

  if (!win.isDestroyed()) {
    win.webContents.send('social-export-progress', { percent: 100, stage: 'Done' })
  }
}
