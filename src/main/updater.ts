// Auto-updater skeleton. Currently checks for updates but won't find any
// until we configure a release channel (GitHub Releases or S3).
// This is safe to ship — it gracefully handles "no update server" by
// logging and doing nothing.

import { autoUpdater } from 'electron-updater'
import { app } from 'electron'

export function initAutoUpdater(): void {
  // Don't check in dev mode
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)
    // TODO: show notification to user
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error checking for updates:', err.message)
  })

  // Check for updates 5 seconds after launch, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}
