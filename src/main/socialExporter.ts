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

import { execFile, spawn } from 'child_process'
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

  // Step 1: frame — center-crop to cols:rows aspect ratio
  const sourceRatio = imgW / imgH
  const targetRatio = cols / rows
  let frameX: number, frameY: number, frameW: number, frameH: number
  if (sourceRatio > targetRatio) {
    // Source is wider: fill by height
    frameH = imgH
    frameW = imgH * targetRatio
    frameX = (imgW - frameW) / 2
    frameY = 0
  } else {
    // Source is taller (or equal): fill by width
    frameW = imgW
    frameH = imgW / targetRatio
    frameX = 0
    frameY = (imgH - frameH) / 2
  }

  // Step 2: tile — divide frame into cols×rows equal squares
  const tileW = frameW / cols
  const tileH = frameH / rows  // equals tileW since frameW/frameH === cols/rows
  const col = tileIndex % cols
  const row = Math.floor(tileIndex / cols)

  return {
    x: Math.round(frameX + col * tileW),
    y: Math.round(frameY + row * tileH),
    w: Math.round(tileW),
    h: Math.round(tileH),
  }
}

// Resize/crop image to 1080×1080, optionally applying custom crop state
async function renderSquare(
  srcPath: string,
  outPath: string,
  cropState?: { panX: number; panY: number; zoom: number },
  srcDims?: { width: number; height: number }
): Promise<void> {
  let vf: string
  if (cropState && (cropState.zoom !== 1.0 || cropState.panX !== 0 || cropState.panY !== 0)) {
    // Get image dimensions if not provided
    const dims = srcDims ?? await probeImage(srcPath)
    const { width: W, height: H } = dims

    // Base cover scale for 1080×1080
    const baseFitScale = Math.max(1080 / W, 1080 / H)
    const userZoom = cropState.zoom ?? 1.0
    const finalScale = baseFitScale * userZoom

    const scaledW = Math.round(W * finalScale)
    const scaledH = Math.round(H * finalScale)

    // CSS display scale (360px frame)
    const displayCoverScale = Math.max(360 / W, 360 / H)
    const cssToExportRatio = (baseFitScale * userZoom) / (displayCoverScale * userZoom)
    // = baseFitScale / displayCoverScale = 1080/360 = 3.0 exactly

    const panX_export = (cropState.panX ?? 0) * cssToExportRatio
    const panY_export = (cropState.panY ?? 0) * cssToExportRatio

    const cropX = Math.round(Math.max(0, Math.min(scaledW - 1080, (scaledW - 1080) / 2 - panX_export)))
    const cropY = Math.round(Math.max(0, Math.min(scaledH - 1080, (scaledH - 1080) / 2 - panY_export)))

    vf = `scale=${scaledW}:${scaledH},crop=1080:1080:${cropX}:${cropY}`
  } else {
    vf = 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080'
  }

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y', '-i', srcPath,
      '-vf', vf,
      '-q:v', '2',
      '-frames:v', '1',
      outPath
    ]
    const proc = spawn(FFMPEG, args, { stdio: 'pipe' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
    proc.on('error', reject)
  })
}

// Crop a tile from image and resize to 1080×1080
async function renderTile(
  srcPath: string,
  crop: { x: number; y: number; w: number; h: number },
  outPath: string
): Promise<void> {
  const { x, y, w, h } = crop
  // Tile is always square (computeTileCrop guarantees w === h), so no extra crop needed
  const vf = `crop=${w}:${h}:${x}:${y},scale=1080:1080`
  await new Promise<void>((resolve, reject) => {
    const args = ['-y', '-i', srcPath, '-vf', vf, '-q:v', '2', '-frames:v', '1', outPath]
    const proc = spawn(FFMPEG, args, { stdio: 'pipe' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
    proc.on('error', reject)
  })
}

async function addNumberOverlay(srcPath: string, outPath: string, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-y', '-i', srcPath,
      '-vf', `drawbox=x=0:y=ih-90:w=iw:h=90:color=black@0.55:t=fill,drawtext=text='${label}':fontsize=40:fontcolor=white:x=(w-tw)/2:y=h-65:shadowcolor=black:shadowx=2:shadowy=2`,
      '-q:v', '2', '-frames:v', '1',
      outPath
    ]
    const proc = spawn(FFMPEG, args, { stdio: 'pipe' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`overlay failed: exit ${code}`)))
    proc.on('error', reject)
  })
}

async function generatePostingGuide(
  exportedPaths: string[],   // ordered from posting step 1 to N (reverse grid order)
  outputPath: string
): Promise<void> {
  const THUMB = 320  // thumbnail size
  const COLS = Math.min(3, exportedPaths.length)
  const ROWS = Math.ceil(exportedPaths.length / COLS)

  const inputArgs = exportedPaths.flatMap(p => ['-i', p])
  const filterParts: string[] = []

  // Process each thumbnail
  exportedPaths.forEach((_, i) => {
    const stepNum = i + 1
    const isFirst = i === 0
    const isLast = i === exportedPaths.length - 1
    const label = isFirst ? `POST ${stepNum}\\nFIRST` : isLast ? `POST ${stepNum}\\nLAST` : `POST ${stepNum}`
    filterParts.push(
      `[${i}]scale=${THUMB}:${THUMB}:force_original_aspect_ratio=increase,crop=${THUMB}:${THUMB},` +
      `drawbox=x=0:y=${THUMB-70}:w=${THUMB}:h=70:color=black@0.7:t=fill,` +
      `drawtext=text='${label}':fontsize=32:fontcolor=white:x=(w-tw)/2:y=${THUMB-58}:shadowcolor=black:shadowx=1:shadowy=1[t${i}]`
    )
  })

  // Arrange into rows
  const rowLabels: string[] = []
  for (let r = 0; r < ROWS; r++) {
    const rowItems = []
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c
      if (idx < exportedPaths.length) rowItems.push(`[t${idx}]`)
    }
    if (rowItems.length > 0) {
      const rowLabel = `[row${r}]`
      filterParts.push(`${rowItems.join('')}hstack=inputs=${rowItems.length}${rowLabel}`)
      rowLabels.push(rowLabel)
    }
  }

  // Stack rows vertically
  if (rowLabels.length === 1) {
    filterParts[filterParts.length - 1] = filterParts[filterParts.length - 1].replace(`[row0]`, `[out]`)
  } else {
    filterParts.push(`${rowLabels.join('')}vstack=inputs=${rowLabels.length}[out]`)
  }

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-q:v', '2',
    outputPath
  ]

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: 'pipe' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`posting guide failed: exit ${code}`)))
    proc.on('error', reject)
  })
}

// ── Main export function ───────────────────────────────────────────────────────

export async function exportSocialPackage(
  scenes: SocialExportScene[],
  outputDir: string,
  win: BrowserWindow,
  options: { includeOrderOverlay: boolean } = { includeOrderOverlay: true }
): Promise<void> {
  const tmpDir = path.join(outputDir, '_tmp_gf')
  await fs.mkdir(tmpDir, { recursive: true })

  const total = scenes.reduce((acc, s) => {
    if (s.type === 'carousel') return acc + s.imagePaths.length
    return acc + 1
  }, 0)
  let done = 0

  const progress = (stage: string) => {
    const percent = Math.round((done / total) * 100)
    win.webContents.send('social-export-progress', { percent, stage })
  }

  // Track exported file paths in grid order (post_01 first) for posting guide
  const postExportedPaths: string[] = []

  try {
    // Process each scene
    for (const scene of scenes) {
      const numStr = String(scene.postNumber).padStart(2, '0')
      progress(`Processing post ${scene.postNumber}/${scenes.length}…`)

      if (scene.type === 'single') {
        const srcPath = await convertHeicIfNeeded(scene.imagePaths[0], tmpDir)
        const outPath = path.join(outputDir, `post_${numStr}.jpg`)
        await renderSquare(srcPath, outPath, scene.cropState, scene.imageDims)
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
          await renderSquare(srcPath, outPath, i === 0 ? scene.cropState : undefined, i === 0 ? scene.imageDims : undefined)
          done++
          progress(`Carousel post ${scene.postNumber}: slide ${i + 1}/${scene.imagePaths.length}`)
          if (i === 0) firstSlidePath = outPath
        }
        // Use first slide for posting guide thumbnail
        postExportedPaths.push(firstSlidePath)

      } else if (scene.type === 'split-tile') {
        if (scene.splitLayout === undefined || scene.splitTileIndex === undefined) continue
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

      progress(`Post ${scene.postNumber} done`)
    }

    // Generate posting guide
    if (postExportedPaths.length > 0) {
      progress('Generating posting guide…')
      // Posting order is reverse of grid order
      const exportedFilePaths = [...postExportedPaths].reverse()
      await generatePostingGuide(exportedFilePaths, path.join(outputDir, '00_POSTING_GUIDE.jpg'))
    }

    progress('Cleaning up…')
  } finally {
    // Clean up temp dir
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }

  win.webContents.send('social-export-progress', { percent: 100, stage: 'Done' })
}
