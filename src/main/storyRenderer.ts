/**
 * Story Video Renderer
 *
 * Pipeline:
 *  1. Convert any HEIC images to JPEG (via macOS `sips`)
 *  2. Probe dimensions (via `sips`)
 *  3. Group images into scenes by orientation
 *  4. Render each scene to a temp MP4 (FFmpeg filter_complex)
 *  5. Concatenate scenes with per-pair xfade transitions (flow-matched)
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
export type StoryMotionType = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'drift-up' | 'drift-down'

export interface StorySceneInternal {
  type: SceneType
  images: StoryImageInfo[]
  duration: number
  motionType: StoryMotionType
}

export interface StoryOptions {
  totalDuration: number
  transitionStyle?: 'clean' | 'cinematic' | 'energetic'
  colorMatch?: 'off' | 'subtle' | 'strong'
  motionMode?: 'none' | 'subtle' | 'dynamic'
}

// ── Motion configuration ──────────────────────────────────────────────────────

// Target zoom amounts per motionMode (portrait / landscape)
const PORTRAIT_ZOOM:  Record<string, number> = { none: 1.0, subtle: 1.06, dynamic: 1.10 }
const LANDSCAPE_ZOOM: Record<string, number> = { none: 1.0, subtle: 1.03, dynamic: 1.05 }

// Deterministic motion sequences — assigned by sceneIndex % seq.length
const PORTRAIT_MOTION_SEQ:  StoryMotionType[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left', 'drift-up', 'drift-down']
const LANDSCAPE_MOTION_SEQ: StoryMotionType[] = ['zoom-in', 'pan-left', 'pan-right', 'zoom-out']

const PAN_ZOOM = 1.04  // fixed zoom used for pan-left / pan-right motions
const DRIFT_PX = 60    // y-drift pixels at 2× working res (= 30px at final 1080p)

// Working resolution: 2× output resolution.
// Zoompan integer-pixel rounding creates 1px jumps at working res.
// Processing at 2× then scaling down makes those jumps 0.5px → sub-pixel invisible.
const WORK_W = 2160
const WORK_H = 3840

// ── Motion type assignment ────────────────────────────────────────────────────

function assignMotionType(sceneIndex: number, isPortrait: boolean, motionMode: string): StoryMotionType {
  if (motionMode === 'none') return 'zoom-in'  // endZoom = 1.0 = no motion
  const seq = isPortrait ? PORTRAIT_MOTION_SEQ : LANDSCAPE_MOTION_SEQ
  return seq[sceneIndex % seq.length]
}

// ── Motion filter builder ─────────────────────────────────────────────────────

/**
 * Build a zoompan filter chain for a scene.
 * Input: WORK_W×WORK_H composite. Output: 1080×1920 (downscaled).
 * Does NOT include setsar=1 — callers append that (+ optional color match).
 */
function buildMotionFilter(
  motionType: StoryMotionType,
  frames: number,
  motionMode: string,
  isPortrait: boolean
): string {
  const zoomTable = isPortrait ? PORTRAIT_ZOOM : LANDSCAPE_ZOOM
  const endZoom = zoomTable[motionMode] ?? zoomTable.subtle
  const sz = `${WORK_W}x${WORK_H}`
  const scale = 'scale=1080:1920:flags=lanczos'

  if (endZoom <= 1.0) return scale

  const rate = ((endZoom - 1.0) / frames).toFixed(8)
  const denom = Math.max(1, frames - 1)

  switch (motionType) {
    case 'zoom-in':
      return `zoompan=z='min(1+on*${rate},${endZoom})':x='(iw*zoom-iw)/2':y='(ih*zoom-ih)/2':d=${frames}:s=${sz},${scale}`
    case 'zoom-out':
      return `zoompan=z='max(1,${endZoom}-(on-1)*${rate})':x='(iw*zoom-iw)/2':y='(ih*zoom-ih)/2':d=${frames}:s=${sz},${scale}`
    case 'pan-right':
      return `zoompan=z='${PAN_ZOOM}':x='(iw*zoom-iw)*(on-1)/${denom}':y='(ih*zoom-ih)/2':d=${frames}:s=${sz},${scale}`
    case 'pan-left':
      return `zoompan=z='${PAN_ZOOM}':x='(iw*zoom-iw)*(${denom}-(on-1))/${denom}':y='(ih*zoom-ih)/2':d=${frames}:s=${sz},${scale}`
    case 'drift-up':
      return `zoompan=z='min(1+on*${rate},${endZoom})':x='(iw*zoom-iw)/2':y='max(0,(ih*zoom-ih)/2-${DRIFT_PX}*(on-1)/${denom})':d=${frames}:s=${sz},${scale}`
    case 'drift-down':
      return `zoompan=z='min(1+on*${rate},${endZoom})':x='(iw*zoom-iw)/2':y='min(ih*zoom-ih,(ih*zoom-ih)/2+${DRIFT_PX}*(on-1)/${denom})':d=${frames}:s=${sz},${scale}`
  }
}

// ── Color match filter ────────────────────────────────────────────────────────

function buildColorMatchFilter(colorMatch?: string): string | null {
  switch (colorMatch) {
    case 'subtle': return "curves=all='0/0.025 1/0.975',eq=saturation=0.92"
    case 'strong': return "curves=all='0/0.06 0.25/0.265 0.75/0.735 1/0.94',eq=saturation=0.84:contrast=0.95"
    default: return null
  }
}

// ── Flow transition selection ─────────────────────────────────────────────────

/**
 * Select an xfade transition whose direction matches the outgoing scene's motion.
 */
function selectTransition(outgoingMotion: StoryMotionType, transitionStyle?: string): string {
  if (transitionStyle === 'cinematic') {
    switch (outgoingMotion) {
      case 'pan-right':  return 'slideleft'
      case 'pan-left':   return 'slideright'
      case 'drift-up':   return 'slideup'
      case 'drift-down': return 'slidedown'
      case 'zoom-in':    return 'zoomin'
      default:           return 'fade'
    }
  }
  if (transitionStyle === 'energetic') {
    switch (outgoingMotion) {
      case 'pan-right':  return 'slideleft'
      case 'pan-left':   return 'slideright'
      case 'drift-up':   return 'wipeleft'
      case 'drift-down': return 'wiperight'
      default:           return 'zoomin'
    }
  }
  return 'fade'  // 'clean' or default
}

// ── Build scenes result ───────────────────────────────────────────────────────

export interface BuildScenesResult {
  scenes: Array<{
    id: string
    type: SceneType
    motionType: StoryMotionType
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

function buildSceneGroups(images: StoryImageInfo[], totalDuration: number, motionMode: string): StorySceneInternal[] {
  const groups: Array<Omit<StorySceneInternal, 'motionType'>> = []
  let i = 0

  while (i < images.length) {
    const img = images[i]
    if (img.height > img.width) {
      groups.push({ type: 'portrait', images: [img], duration: 0 })
      i++
    } else {
      const chunk: StoryImageInfo[] = []
      while (i < images.length && images[i].width >= images[i].height) {
        chunk.push(images[i])
        i++
      }
      for (let j = 0; j < chunk.length; j += 3) {
        const slice = chunk.slice(j, j + 3)
        const type: SceneType =
          slice.length === 3 ? 'landscape-3' :
          slice.length === 2 ? 'landscape-2' : 'landscape-1'
        groups.push({ type, images: slice, duration: 0 })
      }
    }
  }

  const n = groups.length
  if (n === 0) return []

  const usableDuration = totalDuration - Math.max(0, n - 1) * TRANSITION_DURATION
  const rawPerScene = usableDuration / n
  const clamped = Math.max(MIN_SCENE_DURATION, Math.min(rawPerScene, MAX_SCENE_DURATION))

  return groups.map((g, idx) => ({
    ...g,
    duration: clamped,
    motionType: assignMotionType(idx, g.type === 'portrait', motionMode)
  }))
}

// ── Public: probe images and build scene definitions (no rendering) ────────────

export async function buildStoryScenes(
  imagePaths: string[],
  totalDuration: number,
  tmpDir: string,
  motionMode = 'subtle'
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

  const scenes = buildSceneGroups(imageInfos, totalDuration, motionMode)
  const actualDuration = scenes.reduce((s, sc) => s + sc.duration, 0) +
    Math.max(0, scenes.length - 1) * TRANSITION_DURATION

  return {
    scenes: scenes.map((sc, idx) => ({
      id: `scene_${idx}`,
      type: sc.type,
      motionType: sc.motionType,
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

function sceneFilterTail(colorMatchFilter: string | null): string {
  return colorMatchFilter ? `,${colorMatchFilter},setsar=1` : ',setsar=1'
}

async function renderPortraitScene(
  img: StoryImageInfo,
  duration: number,
  outPath: string,
  onProgress: (p: number) => void,
  motionType: StoryMotionType,
  motionMode: string,
  colorMatchFilter: string | null
): Promise<void> {
  const d = Math.round(duration * 30)
  const motion = buildMotionFilter(motionType, d, motionMode, true)
  const args = [
    '-loop', '1', '-framerate', '30', '-i', img.processedPath,
    '-vf',
    [
      `scale=${WORK_W}:${WORK_H}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${WORK_W}:${WORK_H}`,
      motion + sceneFilterTail(colorMatchFilter)
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
  motionType: StoryMotionType,
  motionMode: string,
  colorMatchFilter: string | null
): Promise<void> {
  const d = Math.round(duration * 30)
  const inputArgs = imgs.flatMap(i => ['-loop', '1', '-framerate', '30', '-i', i.processedPath])
  const rowH = WORK_H / 3
  const motion = buildMotionFilter(motionType, d, motionMode, false)
  const filter = [
    `[0:v]scale=${WORK_W}:${rowH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WORK_W}:${rowH}[a]`,
    `[1:v]scale=${WORK_W}:${rowH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WORK_W}:${rowH}[b]`,
    `[2:v]scale=${WORK_W}:${rowH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WORK_W}:${rowH}[c]`,
    '[a][b]vstack=inputs=2[ab]',
    '[ab][c]vstack=inputs=2[stacked]',
    `[stacked]${motion}${sceneFilterTail(colorMatchFilter)}[out]`
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
  motionType: StoryMotionType,
  motionMode: string,
  colorMatchFilter: string | null
): Promise<void> {
  const d = Math.round(duration * 30)
  const inputArgs = imgs.flatMap(i => ['-loop', '1', '-framerate', '30', '-i', i.processedPath])
  const rowH = WORK_H / 2
  const motion = buildMotionFilter(motionType, d, motionMode, false)
  const filter = [
    `[0:v]scale=${WORK_W}:${rowH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WORK_W}:${rowH}[a]`,
    `[1:v]scale=${WORK_W}:${rowH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WORK_W}:${rowH}[b]`,
    '[a][b]vstack=inputs=2[stacked]',
    `[stacked]${motion}${sceneFilterTail(colorMatchFilter)}[out]`
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
  motionType: StoryMotionType,
  motionMode: string,
  colorMatchFilter: string | null
): Promise<void> {
  const d = Math.round(duration * 30)
  const motion = buildMotionFilter(motionType, d, motionMode, false)
  const filter = [
    `[0:v]scale=${WORK_W}:${WORK_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WORK_W}:${WORK_H},boxblur=luma_radius=44:luma_power=2,colorlevels=rimax=0.55:gimax=0.55:bimax=0.55[bg]`,
    `[0:v]scale=${WORK_W}:-2:flags=lanczos[fg]`,
    '[bg][fg]overlay=x=0:y=(H-h)/2[composed]',
    `[composed]${motion}${sceneFilterTail(colorMatchFilter)}[out]`
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

// ── Concatenation with flow-matched xfade ─────────────────────────────────────

async function concatenateScenes(
  scenePaths: string[],
  durations: number[],
  sceneMotions: StoryMotionType[],
  transitionStyle: string,
  outputPath: string,
  onProgress: (p: number) => void
): Promise<void> {
  const totalDuration = durations.reduce((s, d) => s + d, 0) -
    Math.max(0, scenePaths.length - 1) * TRANSITION_DURATION

  if (scenePaths.length === 1) {
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

  const inputArgs = scenePaths.flatMap(p => ['-i', p])
  const filterParts: string[] = []
  let offset = 0
  let prevLabel = '[0:v]'

  for (let i = 1; i < scenePaths.length; i++) {
    offset += durations[i - 1] - TRANSITION_DURATION
    const xfade = selectTransition(sceneMotions[i - 1], transitionStyle)
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
    motionType: StoryMotionType
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

  const motionMode = params.options.motionMode ?? 'subtle'
  const colorMatchFilter = buildColorMatchFilter(params.options.colorMatch)
  const scenePaths: string[] = []
  const sceneDurations: number[] = []
  const sceneMotions: StoryMotionType[] = []

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

      const motionType = scene.motionType

      switch (scene.type) {
        case 'portrait':
          await renderPortraitScene(imgs[0], scene.duration, sceneOut, onSceneProgress, motionType, motionMode, colorMatchFilter)
          break
        case 'landscape-3':
          await renderLandscape3Scene(imgs, scene.duration, sceneOut, onSceneProgress, motionType, motionMode, colorMatchFilter)
          break
        case 'landscape-2':
          await renderLandscape2Scene(imgs, scene.duration, sceneOut, onSceneProgress, motionType, motionMode, colorMatchFilter)
          break
        case 'landscape-1':
          await renderLandscape1Scene(imgs[0], scene.duration, sceneOut, onSceneProgress, motionType, motionMode, colorMatchFilter)
          break
      }

      scenePaths.push(sceneOut)
      sceneDurations.push(scene.duration)
      sceneMotions.push(motionType)
    }

    // ── Phase 2: concatenate ───────────────────────────────────────────────
    sendProgress(78, 'Concatenating scenes…')
    await concatenateScenes(
      scenePaths,
      sceneDurations,
      sceneMotions,
      params.options.transitionStyle ?? 'clean',
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
