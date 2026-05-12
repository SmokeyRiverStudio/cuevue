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

The build output is written to `dist/` and should not be committed.

## Source Control Notes

Do not commit generated dependencies, packaged builds, app binaries, logs, or local operating system files. The repository is intended to track only the source files and package metadata required to install, run, and build CueVue.

## Recommended Branch Strategy

- `main`: stable baseline and production-ready checkpoints
- `feature/webview-refresh-recovery`: recovery work for frozen or authenticated webviews
- `feature/fullscreen-escape`: ESC-key fullscreen exit behavior
- `feature/workspaces`: workspace save, open, and import system
- `feature/presenter-notes-ui`: presenter notes UI visibility and polish
