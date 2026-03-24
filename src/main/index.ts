import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron'
import { join, dirname } from 'path'
import { readdir, stat, rename, readFile, mkdir, copyFile } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as os from 'os'
import { buildStoryScenes, renderStory } from './storyRenderer'
import { exportSocialPackage, type SocialExportScene } from './socialExporter'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Supported image formats
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'])

// Preferences file path
const prefsPath = join(app.getPath('userData'), 'preferences.json')

function loadPrefs(): Record<string, unknown> {
  try {
    if (existsSync(prefsPath)) {
      return JSON.parse(readFileSync(prefsPath, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function savePrefs(prefs: Record<string, unknown>): void {
  try {
    const dir = dirname(prefsPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))
  } catch { /* ignore */ }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#141414',
    vibrancy: 'under-window',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Register custom protocol for serving local files securely
  // (registered in app.whenReady)

  mainWindow = win
  win.on('closed', () => { mainWindow = null })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Register localfile:// protocol to serve local images
  protocol.registerFileProtocol('localfile', (request, callback) => {
    try {
      const url = new URL(request.url)
      // Reconstruct full path: localfile:///Users/foo/bar.jpg → /Users/foo/bar.jpg
      const filePath = decodeURIComponent(url.pathname)
      callback({ path: filePath })
    } catch {
      callback({ error: -2 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Open folder dialog
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Image Folder'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Scan folder for images
ipcMain.handle('scan-folder', async (_e, folderPath: string) => {
  const entries = await readdir(folderPath)
  const images = []

  for (const name of entries) {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue
    if (name.startsWith('.')) continue

    try {
      const fullPath = join(folderPath, name)
      const info = await stat(fullPath)
      images.push({
        filename: name,
        path: fullPath,
        folderPath,
        ext,
        size: info.size,
        mtimeMs: info.mtimeMs,
        birthtimeMs: info.birthtimeMs
      })
    } catch { /* skip unreadable files */ }
  }

  return images
})

// Rename a single file safely
ipcMain.handle('rename-file', async (_e, oldPath: string, newPath: string) => {
  try {
    // Safety: never overwrite an existing file
    if (existsSync(newPath) && oldPath.toLowerCase() !== newPath.toLowerCase()) {
      return { success: false, error: `Target file already exists: ${newPath}` }
    }
    await rename(oldPath, newPath)
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

// Batch rename: performs two-phase rename to avoid collisions
// Phase 1: rename all to temp names, Phase 2: rename to final names
ipcMain.handle('batch-rename', async (_e, operations: Array<{ oldPath: string; newPath: string }>) => {
  const tempOps: Array<{ from: string; to: string }> = []
  const finalOps: Array<{ from: string; to: string }> = []

  try {
    // Build temp paths
    for (const op of operations) {
      const dir = dirname(op.oldPath)
      const ext = op.newPath.slice(op.newPath.lastIndexOf('.'))
      const tempPath = join(dir, `__gf_temp_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`)
      tempOps.push({ from: op.oldPath, to: tempPath })
      finalOps.push({ from: tempPath, to: op.newPath })
    }

    // Phase 1: to temp names
    for (const op of tempOps) {
      await rename(op.from, op.to)
    }

    // Phase 2: to final names
    for (const op of finalOps) {
      await rename(op.from, op.to)
    }

    return { success: true }
  } catch (err: unknown) {
    // Attempt rollback
    for (const op of tempOps) {
      try {
        if (existsSync(op.to)) await rename(op.to, op.from)
      } catch { /* best effort */ }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

// Delete a file (moves to trash)
ipcMain.handle('delete-file', async (_e, filePath: string) => {
  try {
    await shell.trashItem(filePath)
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

// Reveal file in Finder
ipcMain.handle('reveal-in-finder', async (_e, filePath: string) => {
  shell.showItemInFolder(filePath)
})

// Read image as base64 for EXIF parsing (renderer exifr needs the buffer)
ipcMain.handle('read-file-buffer', async (_e, filePath: string) => {
  try {
    const buf = await readFile(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  } catch {
    return null
  }
})

// Preferences
ipcMain.handle('get-pref', (_e, key: string) => {
  return loadPrefs()[key] ?? null
})

ipcMain.handle('set-pref', (_e, key: string, value: unknown) => {
  const prefs = loadPrefs()
  prefs[key] = value
  savePrefs(prefs)
})

// ─── Story Video IPC ──────────────────────────────────────────────────────────

// Probe images and build scene layout (no rendering)
ipcMain.handle('build-story-scenes', async (_e, imagePaths: string[], totalDuration: number) => {
  try {
    const tmpDir = join(os.tmpdir(), `gf-story-probe-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    const result = await buildStoryScenes(imagePaths, totalDuration, tmpDir)
    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg, scenes: [], totalDuration: 0, sceneCount: 0 }
  }
})

// Show save dialog for output path
ipcMain.handle('choose-export-path', async (_e, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    title: 'Save Story Video',
    defaultPath: join(app.getPath('desktop'), defaultName),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  })
  return result.canceled ? null : result.filePath
})

// Full render
ipcMain.handle('render-story', async (_e, scenes: unknown[], options: unknown, outputPath: string) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  try {
    await renderStory(
      { scenes: scenes as Parameters<typeof renderStory>[0]['scenes'], options: options as Parameters<typeof renderStory>[0]['options'], outputPath },
      mainWindow
    )
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

// ─── Social / Instagram Mode IPC ──────────────────────────────────────────────

ipcMain.handle('choose-social-export-dir', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Export Folder',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

ipcMain.handle('export-social-package', async (_e, scenes: SocialExportScene[], outputDir: string, options: { includeOrderOverlay: boolean }) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  try {
    await exportSocialPackage(scenes, outputDir, mainWindow, options ?? { includeOrderOverlay: true })
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

// ─── Sections / Publish ───────────────────────────────────────────────────────

ipcMain.handle('choose-publish-dir', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Publish Folder',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})

ipcMain.handle('publish-sections', async (_e, params: {
  outputDir: string
  sections: Array<{ name: string; images: Array<{ srcPath: string; destName: string }> }>
}) => {
  try {
    await mkdir(params.outputDir, { recursive: true })

    // Copy each section's images to its own subfolder
    for (const section of params.sections) {
      if (section.images.length === 0) continue
      const subDir = join(params.outputDir, section.name)
      await mkdir(subDir, { recursive: true })
      for (const img of section.images) {
        await copyFile(img.srcPath, join(subDir, img.destName))
      }
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})
