# CueVue macOS Signing and Notarization Prep

CueVue is configured for unsigned local `.app` and `.dmg` builds today. Do not commit Apple credentials, app-specific passwords, keychains, certificates, provisioning profiles, or API keys.

## Direct Developer ID Distribution

Required outside the repository:

- Apple Developer Program membership.
- Developer ID Application certificate installed in the build keychain.
- Apple notarization credentials supplied through CI secrets or local environment variables.
- Hardened runtime enabled in `package.json`.
- Entitlements reviewed in `buildResources/entitlements.mac.plist`.
- Notarization hook configured at `scripts/notarize.js`.

Recommended CI secret names for future automation:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Local signed/notarized build requirements:

```bash
export APPLE_ID="apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID12345"
npm run build
```

Unsigned local beta build:

```bash
npm run build:unsigned
```

## Future Mac App Store Review

The Mac App Store path will require the MAS Electron build, App Sandbox entitlements, provisioning profiles, and a separate MAS packaging target. CueVue currently uses screen capture, app launching, AppleScript automation, persistent webviews, enterprise authentication sessions, and local credential storage; those workflows must be tested against App Store sandbox requirements before submission.

Likely MAS risk areas:

- Screen Recording and `desktopCapturer` workflows.
- QuickTime/iPhone setup automation through AppleScript and launching external apps.
- Persistent enterprise-auth webviews and long-running SSO sessions.
- Local credential storage and cross-session webview partitions.
- Workspace files that preserve absolute local asset paths.

Recommended first release path: Developer ID signed and notarized direct DMG distribution. Treat Mac App Store submission as a separate compatibility project after the direct-distribution build is stable with real customer demos.
