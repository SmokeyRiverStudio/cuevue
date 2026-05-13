# CueVue

CueVue is a pure Electron live production and demo scene controller. It provides an operator workspace for switching between flow scenes, live webview scenes, iPhone mirroring, presenter notes, and fullscreen presentation output without introducing a frontend framework runtime.

## Current Features

- Flow scene management for structured demos and training sessions
- Live webview scenes with persistent Electron webview support
- iPhone mirroring scene support for QuickTime/window capture workflows
- Presenter notes backend with local note persistence
- Scene management for creating, editing, and presenting demo flows
- Fullscreen presentation mode for live output
- Splash screen startup experience
- macOS build configuration through electron-builder

## Tech Stack

- Electron 41
- Plain HTML, CSS, and JavaScript
- `main.js` Electron main process
- `preload.js` context-isolated bridge for renderer IPC
- `index.html` application UI
- `splash.html` startup splash screen
- No React, Next.js, Vite, or Tailwind runtime

## Install

```bash
npm install
```

## Start

```bash
npm start
```

## Build

```bash
npm run build
```

The default build creates unsigned macOS `.app` and `.dmg` artifacts in `dist/`.

Additional build commands:

```bash
npm run build:mac-dir
npm run build:dmg
```

The build output is written to `dist/` and should not be committed.

## Installing the Unsigned macOS Beta

CueVue beta builds are unsigned until Developer ID signing and notarization are enabled. macOS may block the first launch on a work MacBook.

1. Download the latest `.dmg` from GitHub Releases.
2. Open the `.dmg` and drag `CueVue.app` into `Applications`.
3. If macOS says the app cannot be opened, open `System Settings` > `Privacy & Security`.
4. In the security warning for CueVue, choose `Open Anyway`.
5. Launch CueVue again from `Applications`.

This is expected for unsigned beta testing. Do not bypass company security policy on managed devices without approval.

## GitHub Release Builds

Tagged releases build an unsigned Apple Silicon DMG automatically:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow uploads the generated DMG to the GitHub Releases page.

## Release Prep

- macOS build resources live in `buildResources/`.
- `buildResources/icon-source.svg` and `buildResources/icon-source.png` are the editable/source icon assets.
- `buildResources/icon.icns` is referenced by electron-builder.
- Signing and notarization guidance lives in `NOTARIZATION.md`.

## Source Control Notes

Do not commit generated dependencies, packaged builds, app binaries, logs, or local operating system files. The repository is intended to track only the source files and package metadata required to install, run, and build CueVue.

## Recommended Branch Strategy

- `main`: stable baseline and production-ready checkpoints
- `feature/webview-refresh-recovery`: recovery work for frozen or authenticated webviews
- `feature/fullscreen-escape`: ESC-key fullscreen exit behavior
- `feature/workspaces`: workspace save, open, and import system
- `feature/presenter-notes-ui`: presenter notes UI visibility and polish
