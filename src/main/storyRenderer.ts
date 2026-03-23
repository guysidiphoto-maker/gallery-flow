/**
 * Story Video Renderer
 *
 * Pipeline:
 *  1. Convert any HEIC images to JPEG (via macOS `sips`)
 *  2. Probe dimensions (via `sips`)
 *  3. Group images into scenes by orientation
 *  4. Render each scene to a temp MP4 (FFmpeg filter_complex)
 *  5. Concatenate scenes with xfade transitions
 *  6. Clean up temp files on success
 */

import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { BrowserWindow } from 'electron'

const execFileAsync = promisify(execFile)

// ── FFmpeg binary ─────────────────────────────────────────────────────────────

function getFFmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null
    if (p) return p
  } catch { /* fall through */ }
  return 'ffmpeg'  // hope it's in PATH
}

const FFMPEG = getFFmpegPath()

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoryImageInfo {
  processedPath: string  // absolute path, HEIC already converted
  originalPath: string
  width: number
  height: number
}

export type SceneType = 'portrait' | 'landscape-3' | 'landscape-2' | 'landscape-1'

export interface StorySceneInternal {
  type: SceneType
  images: StoryImageInfo[]
  duration: number  // seconds
}

export interface StoryOptions {
  transition: 'fade' | 'slide' | 'zoom'
  totalDuration: number
  style?: string
  motionMode?: 'none' | 'subtle' | 'dynamic'
}

// Target zoom amounts per mode (portrait / landscape)
const PORTRAIT_ZOOM:  Record<string, number> = { none: 1.0, subtle: 1.06, dynamic: 1.10 }
const LANDSCAPE_ZOOM: Record<string, number> = { none: 1.0, subtle: 1.03, dynamic: 1.05 }
const LANDSCAPE3_PAN = 20  // pixels of horizontal drift for landscape-3 scenes

/**
 * Build a zoompan z= expression that zooms from 1.0 to `endZoom` over `frames` frames.
 * Rate is computed per-frame so the full zoom range is always consumed.
 */
function zoomExpr(endZoom: number, frames: number): string {
  if (endZoom <= 1.0) return `z='1'`
  const rate = ((endZoom - 1.0) / frames).toFixed(8)
  return `z='min(1+on*${rate},${endZoom})'`
}

/** Full zoompan filter string for a portrait scene */
function portraitZoompan(frames: number, motionMode?: string): string {
  const endZoom = PORTRAIT_ZOOM[motionMode ?? 'subtle'] ?? PORTRAIT_ZOOM.subtle
  const z = zoomExpr(endZoom, frames)
  return `zoompan=${z}:x='(iw*zoom-iw)/2':y='(ih*zoom-ih)/2':d=${frames}:s=1080x1920`
}

/** Full zoompan filter string for a landscape scene (optional horizontal pan) */
function landscapeZoompan(frames: number, motionMode?: string, withPan = false): string {
  const endZoom = LANDSCAPE_ZOOM[motionMode ?? 'subtle'] ?? LANDSCAPE_ZOOM.subtle
  const z = zoomExpr(endZoom, frames)
  if (!withPan || endZoom <= 1.0) {
    return `zoompan=${z}:x='(iw*zoom-iw)/2':y='(ih*zoom-ih)/2':d=${frames}:s=1080x1920`
  }
  const pan = LANDSCAPE3_PAN
  const xExpr = `x='max(0,(iw*zoom-iw)/2-${pan}+${(pan / frames).toFixed(4)}*on)'`
  return `zoompan=${z}:${xExpr}:y='(ih*zoom-ih)/2':d=${frames}:s=1080x1920`
}

export interface BuildScenesResult {
  scenes: Array<{
    id: string
    type: SceneType
    imagePaths: string[]
    imageUrls: string[]
    duration: number
    widths: number[]
    heights: number[]
  }>
  totalDuration: number
  sceneCount: number
}

// ── Image probing via sips (macOS built-in) ────────────────────────────────────

async function getImageDimensions(imgPath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imgPath])
  const w = stdout.match(/pixelWidth:\s*(\d+)/)
  const h = stdout.match(/pixelHeight:\s*(\d+)/)
  if (!w || !h) throw new Error(`Could not read dimensions for ${imgPath}`)
  return { width: parseInt(w[1]), height: parseInt(h[1]) }
}

async function convertHeicToJpeg(srcPath: string, outDir: string): Promise<string> {
  const base = path.basename(srcPath, path.extname(srcPath))
  const outPath = path.join(outDir, `${base}_converted.jpg`)
  await execFileAsync('sips', ['-s', 'format', 'jpeg', srcPath, '--out', outPath])
  return outPath
}

// ── Scene building ─────────────────────────────────────────────────────────────

const TRANSITION_DURATION = 0.4   // seconds
const MIN_SCENE_DURATION   = 2.0  // seconds
const MAX_SCENE_DURATION   = 8.0  // seconds

function buildSceneGroups(images: StoryImageInfo[], totalDuration: number): StorySceneInternal[] {
  const groups: StorySceneInternal[] = []
  let i = 0

  while (i < images.length) {
    const img = images[i]
    if (img.height > img.width) {
      // Portrait → one full-screen scene
      groups.push({ type: 'portrait', images: [img], duration: 0 })
      i++
    } else {
      // Landscape — collect consecutive landscape images
      const chunk: StoryImageInfo[] = []
      while (i < images.length && images[i].width >= images[i].height) {
        chunk.push(images[i])
        i++
      }
      // Group into chunks of up to 3
      for (let j = 0; j < chunk.length; j += 3) {
        const slice = chunk.slice(j, j + 3)
        const type: SceneType =
          slice.length === 3 ? 'landscape-3' :
          slice.length === 2 ? 'landscape-2' : 'landscape-1'
        groups.push({ type, images: slice, duration: 0 })
      }
    }
  }

  // Distribute time across scenes
  const n = groups.length
  if (n === 0) return []

  const usableDuration = totalDuration - Math.max(0, n - 1) * TRANSITION_DURATION
  const rawPerScene = usableDuration / n
  const clamped = Math.max(MIN_SCENE_DURATION, Math.min(rawPerScene, MAX_SCENE_DURATION))

  return groups.map(g => ({ ...g, duration: clamped }))
}

// ── Public: probe images and build scene definitions (no rendering) ────────────

export async function buildStoryScenes(
  imagePaths: string[],
  totalDuration: number,
  tmpDir: string
): Promise<BuildScenesResult> {
  const imageInfos: StoryImageInfo[] = []

  for (const origPath of imagePaths) {
    const ext = path.extname(origPath).toLowerCase()
    const processedPath = (ext === '.heic' || ext === '.heif')
      ? await convertHeicToJpeg(origPath, tmpDir)
      : origPath
    const dims = await getImageDimensions(processedPath)
    imageInfos.push({ processedPath, originalPath: origPath, ...dims })
  }

  const scenes = buildSceneGroups(imageInfos, totalDuration)
  const actualDuration = scenes.reduce((s, sc) => s + sc.duration, 0) +
    Math.max(0, scenes.length - 1) * TRANSITION_DURATION

  return {
    scenes: scenes.map((sc, idx) => ({
      id: `scene_${idx}`,
      type: sc.type,
      imagePaths: sc.images.map(i => i.processedPath),
      imageUrls: sc.images.map(i => `localfile://${encodeURIComponent(i.processedPath).replace(/%2F/g, '/')}`),
      duration: sc.duration,
      widths:  sc.images.map(i => i.width),
      heights: sc.images.map(i => i.height)
    })),
    totalDuration: Math.round(actualDuration * 10) / 10,
    sceneCount: scenes.length
  }
}

// ── FFmpeg helpers ─────────────────────────────────────────────────────────────

function runFFmpeg(
  args: string[],
  expectedDurationSec: number,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-y', ...args])
    let stderr = ''

    proc.stderr.on('data', (buf: Buffer) => {
      const chunk = buf.toString()
      stderr += chunk
      // Parse time= from FFmpeg progress output
      const m = chunk.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
      if (m) {
        const elapsed = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100
        onProgress(Math.min(99, (elapsed / expectedDurationSec) * 100))
      }
    })

    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg failed (exit ${code}):\n${stderr.slice(-2000)}`))
    })
  })
}

// ── Scene renderers ────────────────────────────────────────────────────────────

async function renderPortraitScene(
  img: StoryImageInfo,
  duration: number,
  outPath: string,
  onProgress: (p: number) => void,
  motionMode?: string
): Promise<void> {
  const d = Math.round(duration * 30)  // frame count
  const args = [
    '-loop', '1', '-framerate', '30', '-i', img.processedPath,
    '-vf',
    [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      portraitZoompan(d, motionMode),
      'setsar=1'
    ].join(','),
    '-vframes', String(d),
    '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-g', '15',
    outPath
  ]
  await runFFmpeg(args, duration, onProgress)
}

async function renderLandscape3Scene(
  imgs: StoryImageInfo[],
  duration: number,
  outPath: string,
  onProgress: (p: number) => void,
  motionMode?: string
): Promise<void> {
  const d = Math.round(duration * 30)
  const inputArgs = imgs.flatMap(i => ['-loop', '1', '-framerate', '30', '-i', i.processedPath])
  const filter = [
    '[0:v]scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640[a]',
    '[1:v]scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640[b]',
    '[2:v]scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640[c]',
    '[a][b]vstack=inputs=2[ab]',
    '[ab][c]vstack=inputs=2[stacked]',
    `[stacked]${landscapeZoompan(d, motionMode, true)},setsar=1[out]`
  ].join(';')
  const args = [
    ...inputArgs,
    '-filter_complex', filter,
    '-map', '[out]',
    '-vframes', String(d),
    '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-g', '15',
    outPath
  ]
  await runFFmpeg(args, duration, onProgress)
}

async function renderLandscape2Scene(
  imgs: StoryImageInfo[],
  duration: number,
  outPath: string,
  onProgress: (p: number) => void,
  motionMode?: string
): Promise<void> {
  const d = Math.round(duration * 30)
  const inputArgs = imgs.flatMap(i => ['-loop', '1', '-framerate', '30', '-i', i.processedPath])
  const filter = [
    '[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[a]',
    '[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[b]',
    '[a][b]vstack=inputs=2[stacked]',
    `[stacked]${landscapeZoompan(d, motionMode)},setsar=1[out]`
  ].join(';')
  const args = [
    ...inputArgs,
    '-filter_complex', filter,
    '-map', '[out]',
    '-vframes', String(d),
    '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-g', '15',
    outPath
  ]
  await runFFmpeg(args, duration, onProgress)
}

async function renderLandscape1Scene(
  img: StoryImageInfo,
  duration: number,
  outPath: string,
  onProgress: (p: number) => void,
  motionMode?: string
): Promise<void> {
  const d = Math.round(duration * 30)
  const filter = [
    // Background: fill 1080x1920, heavy blur + darken
    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=luma_radius=22:luma_power=2,colorlevels=rimax=0.55:gimax=0.55:bimax=0.55[bg]',
    // Foreground: scale to 1080 wide, maintain aspect
    '[0:v]scale=1080:-2[fg]',
    // Composite
    '[bg][fg]overlay=x=0:y=(H-h)/2[composed]',
    `[composed]${landscapeZoompan(d, motionMode)},setsar=1[out]`
  ].join(';')
  const args = [
    '-loop', '1', '-framerate', '30', '-i', img.processedPath,
    '-filter_complex', filter,
    '-map', '[out]',
    '-vframes', String(d),
    '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-b:v', '2500k', '-pix_fmt', 'yuv420p', '-g', '15',
    outPath
  ]
  await runFFmpeg(args, duration, onProgress)
}

// ── Concatenation with xfade ──────────────────────────────────────────────────

const XFADE_TRANSITION: Record<string, string> = {
  fade:  'fade',
  slide: 'slideleft',
  zoom:  'zoomin'
}

async function concatenateScenes(
  scenePaths: string[],
  durations: number[],
  transition: string,
  outputPath: string,
  onProgress: (p: number) => void
): Promise<void> {
  const xfade = XFADE_TRANSITION[transition] ?? 'fade'
  const totalDuration = durations.reduce((s, d) => s + d, 0) -
    Math.max(0, scenePaths.length - 1) * TRANSITION_DURATION

  if (scenePaths.length === 1) {
    // Single scene — just re-encode for final quality
    const args = [
      '-i', scenePaths[0],
      '-c:v', 'libx264', '-preset', 'medium', '-b:v', '4500k',
      '-maxrate', '5500k', '-bufsize', '10000k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath
    ]
    await runFFmpeg(args, durations[0], onProgress)
    return
  }

  // Build chained xfade filter
  const inputArgs = scenePaths.flatMap(p => ['-i', p])
  const filterParts: string[] = []
  let offset = 0
  let prevLabel = '[0:v]'

  for (let i = 1; i < scenePaths.length; i++) {
    offset += durations[i - 1] - TRANSITION_DURATION
    const outLabel = i === scenePaths.length - 1 ? '[out]' : `[v${i}]`
    filterParts.push(
      `${prevLabel}[${i}:v]xfade=transition=${xfade}:duration=${TRANSITION_DURATION}:offset=${offset.toFixed(3)}${outLabel}`
    )
    prevLabel = outLabel
  }

  const args = [
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-b:v', '4500k',
    '-maxrate', '5500k', '-bufsize', '10000k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath
  ]
  await runFFmpeg(args, totalDuration, onProgress)
}

// ── Main export function ───────────────────────────────────────────────────────

export interface RenderStoryParams {
  scenes: Array<{
    type: SceneType
    imagePaths: string[]
    duration: number
  }>
  options: StoryOptions
  outputPath: string
}

export async function renderStory(
  params: RenderStoryParams,
  win: BrowserWindow
): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), `gf-story-${Date.now()}`)
  await fs.mkdir(tmpDir, { recursive: true })

  const sendProgress = (percent: number, stage: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send('story-progress', { percent: Math.round(percent), stage })
    }
  }

  const scenePaths: string[] = []
  const sceneDurations: number[] = []

  try {
    // ── Phase 1: render individual scenes ─────────────────────────────────
    for (let i = 0; i < params.scenes.length; i++) {
      const scene = params.scenes[i]
      const sceneOut = path.join(tmpDir, `scene_${i}.mp4`)
      const sceneBaseProgress = (i / params.scenes.length) * 75

      sendProgress(sceneBaseProgress, `Rendering scene ${i + 1} of ${params.scenes.length}…`)

      const onSceneProgress = (pct: number) => {
        sendProgress(sceneBaseProgress + (pct / 100) * (75 / params.scenes.length), `Rendering scene ${i + 1}…`)
      }

      // Convert any remaining HEIC paths (in case buildStoryScenes wasn't called first)
      const imgs: StoryImageInfo[] = await Promise.all(
        scene.imagePaths.map(async imgPath => {
          const ext = path.extname(imgPath).toLowerCase()
          const processedPath = (ext === '.heic' || ext === '.heif')
            ? await convertHeicToJpeg(imgPath, tmpDir)
            : imgPath
          const dims = await getImageDimensions(processedPath)
          return { processedPath, originalPath: imgPath, ...dims }
        })
      )

      const motionMode = params.options.motionMode

      switch (scene.type) {
        case 'portrait':
          await renderPortraitScene(imgs[0], scene.duration, sceneOut, onSceneProgress, motionMode)
          break
        case 'landscape-3':
          await renderLandscape3Scene(imgs, scene.duration, sceneOut, onSceneProgress, motionMode)
          break
        case 'landscape-2':
          await renderLandscape2Scene(imgs, scene.duration, sceneOut, onSceneProgress, motionMode)
          break
        case 'landscape-1':
          await renderLandscape1Scene(imgs[0], scene.duration, sceneOut, onSceneProgress, motionMode)
          break
      }

      scenePaths.push(sceneOut)
      sceneDurations.push(scene.duration)
    }

    // ── Phase 2: concatenate ───────────────────────────────────────────────
    sendProgress(78, 'Concatenating scenes…')
    await concatenateScenes(
      scenePaths,
      sceneDurations,
      params.options.transition,
      params.outputPath,
      (pct) => sendProgress(78 + pct * 0.2, 'Finalizing video…')
    )

    sendProgress(100, 'Done!')

    // ── Cleanup ────────────────────────────────────────────────────────────
    await fs.rm(tmpDir, { recursive: true, force: true })

  } catch (err) {
    // Keep tmpDir for debugging — don't clean up on failure
    throw err
  }
}
