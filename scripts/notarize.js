const { notarize } = require('@electron/notarize');

exports.default = async function notarizeMacBuild(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const appBundleId = packager.appInfo.appId;
  const appName = `${packager.appInfo.productFilename}.app`;
  const appPath = `${appOutDir}/${appName}`;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping macOS notarization: credentials not available (no Apple Developer ID yet).');
    return;
  }

  await notarize({
    appBundleId,
    appPath,
    appleId,
    appleIdPassword,
    teamId
  });
};
