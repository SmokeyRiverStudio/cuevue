#!/bin/bash
# CueVue — Source Launch Script
# Double-click this file in Finder to install and launch CueVue.
# Requires: macOS, Node.js (https://nodejs.org), internet for first install.

cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     CueVue — Source Runtime Launch       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Verify Node.js ───────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js not found."
  echo "    Install the LTS version from https://nodejs.org and try again."
  echo ""
  read -rp "Press Enter to close this window..."
  exit 1
fi
echo "✓  Node.js $(node --version)"

# ── 2. Install dependencies ─────────────────────────────────────────────────
echo ""
echo "→  Running npm install (first run downloads Electron ~100 MB)..."
echo ""
if ! npm install; then
  echo ""
  echo "❌  npm install failed."
  echo "    Check your internet connection and try again."
  echo ""
  read -rp "Press Enter to close this window..."
  exit 1
fi
echo ""
echo "✓  Dependencies ready."

# ── 3. Clear macOS quarantine from the Electron binary ──────────────────────
#    Downloaded binaries are quarantined by macOS. This lets the signed
#    npm Electron runtime launch without Gatekeeper prompts.
ELECTRON_APP="node_modules/electron/dist/Electron.app"
if [ -d "$ELECTRON_APP" ]; then
  echo "→  Clearing macOS quarantine from Electron runtime..."
  xattr -cr "$ELECTRON_APP" 2>/dev/null && echo "✓  Quarantine cleared." || echo "⚠  xattr failed (may not be needed)."
fi

# ── 4. Launch CueVue ────────────────────────────────────────────────────────
echo ""
echo "→  Launching CueVue..."
echo ""

if ! npm run start; then
  echo ""
  echo "❌  CueVue failed to launch."
  echo ""
  echo "    Common fixes:"
  echo "    • If you see 'app can't be opened' — MDM may be blocking the Electron"
  echo "      runtime. Ask your IT admin to allow unsigned developer tools, or run:"
  echo "        xattr -cr node_modules/electron/dist/Electron.app"
  echo "    • If you see a missing-module error — delete node_modules/ and re-run"
  echo "      this script to reinstall."
  echo ""
  read -rp "Press Enter to close this window..."
  exit 1
fi
