const { notarize } = require('@electron/notarize')

/**
 * Called by electron-builder after signing.
 * Skipped automatically if APPLE_ID env var is not set (e.g. local dev builds).
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  if (electronPlatformName !== 'darwin') return
  if (!process.env.APPLE_ID) {
    console.log('  • notarize skipped (APPLE_ID not set)')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  console.log(`  • notarizing ${appPath}`)

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
}
