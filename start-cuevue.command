#!/bin/bash
# CueVue — launch from authoritative WIP runtime
set -e

REPO_DIR="/Users/jennburk/Documents/# Side Hustles/#CueVue/WIP/cuevue"

cd "$REPO_DIR"

if [ ! -d node_modules ] || [ ! -f node_modules/.bin/electron ]; then
  echo "[CueVue] Installing dependencies..."
  npm install
fi

echo "[CueVue] Starting runtime from: $REPO_DIR"
npm start
