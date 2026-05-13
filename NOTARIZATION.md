# CueVue macOS Signing and Notarization Prep

CueVue is configured for unsigned local `.app` and `.dmg` builds today. Do not commit Apple credentials, app-specific passwords, keychains, certificates, provisioning profiles, or API keys.

## Direct Developer ID Distribution

Required outside the repository:

- Apple Developer Program membership.
- Developer ID Application certificate installed in the build keychain.
- Apple notarization credentials supplied through CI secrets or local environment variables.
- Hardened runtime enabled in `package.json`.
- Entitlements reviewed in `buildResources/entitlements.mac.plist`.

Recommended CI secret names for future automation:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

## Future Mac App Store Review

The Mac App Store path will require additional sandboxing and entitlement review. CueVue currently uses screen capture, app launching, AppleScript automation, persistent webviews, and local credential storage; those workflows must be tested against App Store sandbox requirements before submission.
