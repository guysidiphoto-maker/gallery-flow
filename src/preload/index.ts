import { contextBridge, ipcRenderer } from 'electron'

export type ScanResult = {
  filename: string
  path: string
  folderPath: string
  ext: string
  size: number
  mtimeMs: number
  birthtimeMs: number
}

export type RenameOp = {
  oldPath: string
  newPath: string
}

const api = {
  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('open-folder-dialog'),

  scanFolder: (folderPath: string): Promise<ScanResult[]> =>
    ipcRenderer.invoke('scan-folder', folderPath),

  renameFile: (oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('rename-file', oldPath, newPath),

  batchRename: (ops: RenameOp[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('batch-rename', ops),

  deleteFile: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-file', filePath),

  revealInFinder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('reveal-in-finder', filePath),

  readFileBuffer: (filePath: string): Promise<ArrayBuffer | null> =>
    ipcRenderer.invoke('read-file-buffer', filePath),

  compressImageForUpload: (filePath: string): Promise<{
    web: ArrayBuffer
    thumb: ArrayBuffer
    originalSize: number
    webSize: number
    thumbSize: number
    width: number
    height: number
  } | null> =>
    ipcRenderer.invoke('compress-image-for-upload', filePath),

  getFileSize: (filePath: string): Promise<number | null> =>
    ipcRenderer.invoke('get-file-size', filePath),

  getPref: (key: string): Promise<unknown> =>
    ipcRenderer.invoke('get-pref', key),

  setPref: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('set-pref', key, value),

  // ── Story Video ────────────────────────────────────────────────────────
  buildStoryScenes: (imagePaths: string[], totalDuration: number, motionMode?: string): Promise<unknown> =>
    ipcRenderer.invoke('build-story-scenes', imagePaths, totalDuration, motionMode),

  chooseExportPath: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('choose-export-path', defaultName),

  renderStory: (scenes: unknown[], options: unknown, outputPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('render-story', scenes, options, outputPath),

  onStoryProgress: (cb: (data: { percent: number; stage: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { percent: number; stage: string }) => cb(data)
    ipcRenderer.on('story-progress', handler)
    return () => ipcRenderer.removeListener('story-progress', handler)
  },

  // ── Social / Instagram Mode ────────────────────────────────────────────────
  chooseSocialExportDir: (): Promise<string | null> =>
    ipcRenderer.invoke('choose-social-export-dir'),

  exportSocialPackage: (scenes: unknown[], outputDir: string, options: { includeOrderOverlay: boolean }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export-social-package', scenes, outputDir, options),

  onSocialExportProgress: (cb: (data: { percent: number; stage: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: { percent: number; stage: string }) => cb(data)
    ipcRenderer.on('social-export-progress', handler)
    return () => ipcRenderer.removeListener('social-export-progress', handler)
  },

  // ── Sections / Publish ────────────────────────────────────────────────────
  choosePublishDir: (): Promise<string | null> =>
    ipcRenderer.invoke('choose-publish-dir'),

  publishSections: (params: {
    outputDir: string
    sections: Array<{ name: string; images: Array<{ srcPath: string; destName: string }> }>
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('publish-sections', params),

  // ── Client Gallery Export ────────────────────────────────────────────────
  chooseExportDir: (): Promise<string | null> =>
    ipcRenderer.invoke('choose-export-dir'),

  exportGallery: (projectName: string, clientName: string, imagePaths: string[], destDir: string, topPickPaths: string[], settings?: { studioName?: string; logoPath?: string | null; allowDownloads?: boolean; autoGenerateStories?: boolean }): Promise<{ success: boolean; error?: string; galleryDir?: string }> =>
    ipcRenderer.invoke('export-gallery', projectName, clientName, imagePaths, destDir, topPickPaths, settings),

  chooseLogoFile: (): Promise<string | null> =>
    ipcRenderer.invoke('choose-logo-file'),

  getTempDir: (): Promise<string> =>
    ipcRenderer.invoke('get-temp-dir'),

  createFolder: (folderPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('create-folder', folderPath),

  getSystemUsername: (): Promise<string | null> =>
    ipcRenderer.invoke('get-system-username'),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),

  // ── Auth ─────────────────────────────────────────────────────────────────
  getSystemBootTime: (): Promise<number | null> =>
    ipcRenderer.invoke('get-system-boot-time'),

  googleOAuth: (authUrl: string, redirectMatch: string): Promise<{ access_token?: string; refresh_token?: string; code?: string; error?: string }> =>
    ipcRenderer.invoke('google-oauth', authUrl, redirectMatch),

  // ── File relink ──────────────────────────────────────────────────────────
  checkPathsExist: (paths: string[]): Promise<string[]> =>
    ipcRenderer.invoke('check-paths-exist', paths),

  findFilesByName: (folderPath: string, basenames: string[]): Promise<Record<string, string>> =>
    ipcRenderer.invoke('find-files-by-name', folderPath, basenames),

  // ── File picker ────────────────────────────────────────────────────────
  selectFile: (options: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> =>
    ipcRenderer.invoke('select-file', options),

  // ── Sign out (triggered from Mac app menu) ─────────────────────────────
  onSignOut: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('sign-out', handler)
    return () => ipcRenderer.removeListener('sign-out', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
