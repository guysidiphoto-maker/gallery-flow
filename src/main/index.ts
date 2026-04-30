import { app, BrowserWindow, ipcMain, dialog, protocol, shell, Menu } from 'electron'
import { join, dirname } from 'path'
import { readdir, stat, rename, readFile, mkdir, copyFile } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as os from 'os'
import { buildStoryScenes, renderStory } from './storyRenderer'
import { exportSocialPackage, type SocialExportScene } from './socialExporter'
import { exportGallery } from './exportGallery'
import { initAutoUpdater } from './updater'
import { initSentryMain } from './sentry'

// Init Sentry before anything else so we capture early crashes.
initSentryMain()

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Suppress EPIPE errors from console writes to closed pipes
process.stdout?.on('error', () => {})
process.stderr?.on('error', () => {})

// Supported image formats
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'])

// Preferences file path
const prefsPath = join(app.getPath('userData'), 'preferences.json')

const BACKUP_PATH = prefsPath + '.backup'
const BACKUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
let lastBackupTime = 0

function loadPrefs(): Record<string, unknown> {
  // Try main file first
  try {
    if (existsSync(prefsPath)) {
      const raw = readFileSync(prefsPath, 'utf-8')
      if (raw.trim().length > 2) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return parsed
      }
    }
  } catch (err) {
    console.error('[prefs] main file corrupt:', err)
  }

  // Fallback to backup
  try {
    if (existsSync(BACKUP_PATH)) {
      console.warn('[prefs] loading from backup file')
      const raw = readFileSync(BACKUP_PATH, 'utf-8')
      if (raw.trim().length > 2) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          // Restore main file from backup
          try { writeFileSync(prefsPath, raw) } catch { /* best effort */ }
          return parsed
        }
      }
    }
  } catch (err) {
    console.error('[prefs] backup file also corrupt:', err)
  }

  return {}
}

function savePrefs(prefs: Record<string, unknown>): void {
  try {
    const dir = dirname(prefsPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const json = JSON.stringify(prefs, null, 2)

    // Sanity check: never write empty/tiny data if existing file is large
    if (existsSync(prefsPath)) {
      try {
        const existing = readFileSync(prefsPath, 'utf-8')
        if (existing.length > 500 && json.length < 100) {
          console.error('[prefs] BLOCKED write: new data suspiciously small', json.length, 'vs existing', existing.length)
          return
        }
      } catch { /* can't read existing — proceed with write */ }
    }

    // Atomic write: temp file → rename
    const tmpPath = prefsPath + '.tmp'
    writeFileSync(tmpPath, json)
    const { renameSync } = require('fs')
    renameSync(tmpPath, prefsPath)

    // Periodic backup (every 5 minutes, only if data looks healthy)
    const now = Date.now()
    const projectCount = Array.isArray(prefs.projects) ? prefs.projects.length : 0
    const registryCount = prefs.imageRegistry ? Object.keys(prefs.imageRegistry as object).length : 0
    if (now - lastBackupTime > BACKUP_INTERVAL_MS && (projectCount > 0 || registryCount > 0)) {
      try {
        writeFileSync(BACKUP_PATH, json)
        lastBackupTime = now
      } catch { /* best effort */ }
    }
  } catch (err) {
    console.error('[prefs] save failed:', err)
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    fullscreen: !isDev,
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

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'bottom' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setAboutPanelOptions({
  applicationName: 'Pixflow',
  applicationVersion: app.getVersion(),
  copyright: '\u00A9 2026 Pixflow',
  website: 'https://pixflow-ai.com',
})

app.whenReady().then(() => {
  // Create initial backup on startup if prefs file has real data
  try {
    if (existsSync(prefsPath)) {
      const raw = readFileSync(prefsPath, 'utf-8')
      if (raw.length > 500) {
        writeFileSync(BACKUP_PATH, raw)
        lastBackupTime = Date.now()
      }
    }
  } catch { /* best effort */ }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { label: 'About Pixflow', role: 'about' },
        { type: 'separator' },
        {
          label: 'Sign Out',
          click: () => {
            mainWindow?.webContents.send('sign-out')
          },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
  initAutoUpdater()

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
// List immediate subfolders of a directory (for bulk import)
ipcMain.handle('list-subfolders', async (_e, parentPath: string) => {
  const entries = await readdir(parentPath)
  const folders: Array<{ name: string; path: string }> = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    try {
      const fullPath = join(parentPath, name)
      const info = await stat(fullPath)
      if (info.isDirectory()) folders.push({ name, path: fullPath })
    } catch { /* skip */ }
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name))
})

ipcMain.handle('scan-folder', async (_e, folderPath: string) => {
  const entries = await readdir(folderPath)
  const images: Array<{
    filename: string
    path: string
    folderPath: string
    ext: string
    size: number
    mtimeMs: number
    birthtimeMs: number
  }> = []

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

  // Natural sort like macOS Finder: "img2.jpg" before "img10.jpg".
  // Applied here so every import path (drag-drop, project create, "import
  // into current") gets the same Finder-matching order without each call
  // site having to remember to sort.
  images.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }))

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

// Create a folder (used when a section is created)
ipcMain.handle('create-folder', async (_e, folderPath: string) => {
  try {
    await mkdir(folderPath, { recursive: true })
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
})

// Check which of the supplied absolute file paths no longer exist on disk.
// Used by the renderer to spot "missing" images after a folder rename/move
// without rendering N broken <img> tags.
ipcMain.handle('check-paths-exist', async (_e, paths: string[]) => {
  const missing: string[] = []
  await Promise.all(paths.map(async p => {
    try {
      await stat(p)
    } catch {
      missing.push(p)
    }
  }))
  return missing
})

// Recursively walk a folder looking for files whose basename appears in the
// supplied set. Returns a map { basename → absolutePath } using the FIRST
// match encountered (deterministic enough for relink). The walk is depth-
// first but limited to common image extensions and skips hidden directories.
ipcMain.handle('find-files-by-name', async (_e, folderPath: string, basenames: string[]) => {
  const wanted = new Set(basenames)
  const found: Record<string, string> = {}

  async function walk(dir: string) {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      if (wanted.size === 0) return
      const full = join(dir, name)
      let info
      try { info = await stat(full) } catch { continue }
      if (info.isDirectory()) {
        await walk(full)
      } else if (info.isFile()) {
        if (wanted.has(name) && !(name in found)) {
          const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
          if (IMAGE_EXTS.has(ext)) {
            found[name] = full
            wanted.delete(name)
          }
        }
      }
    }
  }

  await walk(folderPath)
  return found
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Returns the approximate timestamp (ms) when the system was last booted.
// Used by the renderer to invalidate the auth session after a reboot
// while still persisting it across normal app restarts.
ipcMain.handle('get-system-boot-time', () => {
  try {
    return Math.floor(Date.now() - os.uptime() * 1000)
  } catch {
    return null
  }
})

// ─── Google OAuth (Electron) ──────────────────────────────────────────────────
// Opens a child BrowserWindow that walks the user through the Supabase
// implicit-grant Google flow, then captures the access/refresh tokens from
// the redirect URL fragment and returns them to the renderer.
ipcMain.handle('google-oauth', async (_e, authUrl: string, redirectMatch: string) => {
  return new Promise<{ access_token?: string; refresh_token?: string; code?: string; error?: string }>((resolve) => {
    // Use a dedicated session partition so the auth window can't pollute the
    // main app's localStorage with a half-completed OAuth session, and so we
    // can attach a webRequest filter scoped to just this flow.
    const partition = `auth-${Date.now()}`
    const authSession = require('electron').session.fromPartition(partition)

    const authWin = new BrowserWindow({
      width: 500,
      height: 680,
      title: 'Sign in with Google',
      backgroundColor: '#ffffff',
      parent: mainWindow ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition,
      }
    })

    let settled = false
    const finish = (result: { access_token?: string; refresh_token?: string; code?: string; error?: string }) => {
      if (settled) return
      settled = true
      try { authWin.destroy() } catch { /* noop */ }
      resolve(result)
    }

    const tryParseUrl = (url: string): boolean => {
      if (!url.startsWith(redirectMatch)) return false
      try {
        const u = new URL(url)
        // PKCE flow → ?code=...
        const code = u.searchParams.get('code') ?? undefined
        const qErr = u.searchParams.get('error_description') ?? u.searchParams.get('error') ?? undefined
        if (code) {
          finish({ code })
          return true
        }
        // Implicit flow → #access_token=...
        const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash
        if (hash) {
          const params = new URLSearchParams(hash)
          const access_token = params.get('access_token') ?? undefined
          const refresh_token = params.get('refresh_token') ?? undefined
          const hErr = params.get('error_description') ?? params.get('error') ?? undefined
          if (access_token) {
            finish({ access_token, refresh_token })
            return true
          }
          if (hErr) {
            finish({ error: hErr })
            return true
          }
        }
        if (qErr) {
          finish({ error: qErr })
          return true
        }
      } catch { /* not a parseable URL */ }
      return false
    }

    // PRIMARY interception: kill any HTTP request that targets our redirect URL
    // before it can hit the dev server. We use <all_urls> because Chromium
    // match patterns don't accept ports in the host, so a more specific
    // pattern like http://localhost:5173/auth/callback* would silently fail.
    try {
      authSession.webRequest.onBeforeRequest(
        { urls: ['<all_urls>'] },
        (details, callback) => {
          if (details.url.startsWith(redirectMatch)) {
            const handled = tryParseUrl(details.url)
            callback({ cancel: handled })
            return
          }
          callback({ cancel: false })
        }
      )
    } catch (err) {
      console.error('[google-oauth] failed to attach webRequest filter:', err)
    }

    // Belt-and-braces: also listen on navigation events in case the redirect
    // somehow happens client-side without an HTTP request.
    authWin.webContents.on('will-redirect', (event, url) => {
      if (tryParseUrl(url)) event.preventDefault()
    })
    authWin.webContents.on('will-navigate', (event, url) => {
      if (tryParseUrl(url)) event.preventDefault()
    })
    authWin.webContents.on('did-navigate', (_event, url) => { tryParseUrl(url) })
    authWin.webContents.on('did-navigate-in-page', (_event, url) => { tryParseUrl(url) })
    authWin.webContents.on('render-process-gone', (_event, details) => {
      console.error('[google-oauth] auth window renderer gone:', details.reason)
      finish({ error: `auth window crashed: ${details.reason}` })
    })
    authWin.on('closed', () => { finish({ error: 'cancelled' }) })

    authWin.loadURL(authUrl).catch((err: unknown) => {
      console.error('[google-oauth] loadURL failed:', err)
      finish({ error: err instanceof Error ? err.message : String(err) })
    })
  })
})

ipcMain.handle('get-system-username', () => {
  try {
    const raw = os.userInfo().username ?? ''
    // Take the first alphabetic segment (e.g. "guysidi" → "Guy", "guy_sidi" → "Guy")
    const name = raw.split(/[._\-\d0-9]/)[0]
    if (name.length > 0) return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  } catch { /* ignore */ }
  try {
    // Fallback: parse hostname "Guys-MacBook-Pro" → "Guys" or "MacBook-Pro-of-Guy" → "Guy"
    const hostname = os.hostname().replace(/\.local$/, '')
    const macwords = new Set(['MacBook', 'Pro', 'Air', 'iMac', 'Mac', 'Mini', 'Studio', 'of', 'the', 's', 'de'])
    const parts = hostname.split('-')
    const name = parts.find(p => p.length > 1 && !macwords.has(p) && /^[A-Za-z]+$/.test(p))
    if (name) return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  } catch { /* ignore */ }
  return null
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

// Compress image for cloud upload using nativeImage
// Returns { web, thumb, originalSize, webSize, thumbSize, width, height }
ipcMain.handle('compress-image-for-upload', async (_e, filePath: string) => {
  try {
    const { nativeImage } = await import('electron')
    const rawBuf = await readFile(filePath)
    const originalSize = rawBuf.byteLength

    const img = nativeImage.createFromPath(filePath)
    const size = img.getSize()
    if (size.width === 0 || size.height === 0) return null

    // Web version: max 1600px on longest side, JPEG quality 78
    const maxWeb = 1600
    let webImg = img
    if (size.width > maxWeb || size.height > maxWeb) {
      if (size.width >= size.height) {
        webImg = img.resize({ width: maxWeb, quality: 'good' })
      } else {
        webImg = img.resize({ height: maxWeb, quality: 'good' })
      }
    }
    const webJpeg = webImg.toJPEG(78)

    // Thumbnail: max 800px wide, JPEG quality 78 — matches industry-standard
    // grid sizes (Pixieset / Pic-Time / SmugMug all sit in the 600–800
    // range at q75-80). 800/q78 keeps Retina-class grid tiles sharp without
    // ballooning per-page weight.
    let thumbImg = img
    if (size.width > 800) {
      thumbImg = img.resize({ width: 800, quality: 'good' })
    }
    const thumbJpeg = thumbImg.toJPEG(78)

    return {
      web: webJpeg.buffer.slice(webJpeg.byteOffset, webJpeg.byteOffset + webJpeg.byteLength),
      thumb: thumbJpeg.buffer.slice(thumbJpeg.byteOffset, thumbJpeg.byteOffset + thumbJpeg.byteLength),
      originalSize,
      webSize: webJpeg.byteLength,
      thumbSize: thumbJpeg.byteLength,
      width: size.width,
      height: size.height,
    }
  } catch {
    return null
  }
})

// Get file size without reading the whole file
ipcMain.handle('get-file-size', async (_e, filePath: string) => {
  try {
    const info = await stat(filePath)
    return info.size
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
ipcMain.handle('build-story-scenes', async (_e, imagePaths: string[], totalDuration: number, motionMode?: string) => {
  try {
    const tmpDir = join(os.tmpdir(), `gf-story-probe-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    const result = await buildStoryScenes(imagePaths, totalDuration, tmpDir, motionMode)
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
    console.error('[Export] failed:', msg)
    return { success: false, error: 'Export failed. Please try again.' }
  }
})

ipcMain.handle('select-file', async (_e, options: { filters?: Array<{ name: string; extensions: string[] }> }) => {
  const result = await dialog.showOpenDialog({
    title: 'Choose File',
    properties: ['openFile'],
    filters: options?.filters,
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
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

// ─── Client Gallery Export ────────────────────────────────────────────────────

ipcMain.handle('choose-export-dir', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Export Destination',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('export-gallery', async (_e, projectName: string, clientName: string, imagePaths: string[], destDir: string, topPickPaths: string[], settings?: { studioName?: string; logoPath?: string | null; allowDownloads?: boolean; autoGenerateStories?: boolean }) => {
  return exportGallery(projectName, clientName, imagePaths, destDir, topPickPaths || [], settings)
})

ipcMain.handle('get-temp-dir', () => {
  const dir = join(app.getPath('temp'), 'pixflow-stories')
  mkdirSync(dir, { recursive: true })
  return dir
})

ipcMain.handle('choose-logo-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Logo Image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
})
