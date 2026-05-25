const { app, BrowserWindow, ipcMain, desktopCapturer, shell, systemPreferences, safeStorage, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

app.setName('CueVue');
app.enableSandbox();

let splashWindow = null;
let mainWindow = null;
let notesWindow = null;
let lastNotesContext = null;
let notesWindowStateSaveTimer = null;

const bgExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const slideImageExtensions = ['.png', '.jpg', '.jpeg'];
const powerPointExtensions = ['.ppt', '.pptx', '.pps', '.ppsx'];

function appFile(fileName) {
  return path.join(__dirname, fileName);
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    show: true,
    alwaysOnTop: true,
    title: 'CueVue',
    backgroundColor: '#101317',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  splashWindow.loadFile(appFile('splash.html')).catch(() => {});
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'CueVue',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: appFile('preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile(appFile('index.html')).catch(() => {});

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !mainWindow || mainWindow.isDestroyed()) return;

    const key = String(input.key || '').toLowerCase();
    const isFullscreenShortcut = (key === 'f' && input.meta && input.control) || input.key === 'F11';
    if (isFullscreenShortcut) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return;
    }

    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  mainWindow.once('ready-to-show', async () => {
    try {
      await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      });
    } catch (_) {
      // Screen Recording permission may not be granted yet. Startup must continue.
    }

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function notesFile() {
  return path.join(app.getPath('userData'), 'presenter-notes.json');
}

function readNotes() {
  try {
    const filePath = notesFile();
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeNotes(notes) {
  fs.writeFileSync(notesFile(), JSON.stringify(notes || {}, null, 2));
}

function notesWindowStateFile() {
  return path.join(app.getPath('userData'), 'notebook-window.json');
}

function readNotesWindowState() {
  try {
    const filePath = notesWindowStateFile();
    if (!fs.existsSync(filePath)) return {};
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return state && typeof state === 'object' ? state : {};
  } catch (_) {
    return {};
  }
}

function writeNotesWindowState(state) {
  try {
    fs.writeFileSync(notesWindowStateFile(), JSON.stringify(state || {}, null, 2));
  } catch (_) {}
}

function captureNotesWindowState() {
  if (!notesWindow || notesWindow.isDestroyed()) return null;
  const bounds = notesWindow.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function scheduleNotesWindowStateSave() {
  if (notesWindowStateSaveTimer) clearTimeout(notesWindowStateSaveTimer);
  notesWindowStateSaveTimer = setTimeout(() => {
    const state = captureNotesWindowState();
    if (state) writeNotesWindowState(state);
  }, 250);
}

function workspaceStateFile() {
  return path.join(app.getPath('userData'), 'workspace-state.json');
}

function readWorkspaceState() {
  try {
    const filePath = workspaceStateFile();
    if (!fs.existsSync(filePath)) return { currentWorkspace: '', recentWorkspaces: [] };
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      currentWorkspace: state.currentWorkspace || '',
      recentWorkspaces: Array.isArray(state.recentWorkspaces) ? state.recentWorkspaces.filter(Boolean).slice(0, 10) : []
    };
  } catch (_) {
    return { currentWorkspace: '', recentWorkspaces: [] };
  }
}

function writeWorkspaceState(state) {
  fs.writeFileSync(workspaceStateFile(), JSON.stringify({
    currentWorkspace: state.currentWorkspace || '',
    recentWorkspaces: Array.isArray(state.recentWorkspaces) ? state.recentWorkspaces.filter(Boolean).slice(0, 10) : []
  }, null, 2));
}

function rememberWorkspace(filePath) {
  if (!filePath) return readWorkspaceState();
  const state = readWorkspaceState();
  const recentWorkspaces = [filePath]
    .concat(state.recentWorkspaces.filter((item) => item !== filePath))
    .slice(0, 10);
  const nextState = { currentWorkspace: filePath, recentWorkspaces };
  writeWorkspaceState(nextState);
  return nextState;
}

function normalizeWorkspacePath(filePath) {
  if (!filePath) return '';
  return path.extname(filePath).toLowerCase() === '.cuevue' ? filePath : `${filePath}.cuevue`;
}

async function chooseWorkspaceSavePath() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save CueVue Workspace',
    defaultPath: 'CueVue Workspace.cuevue',
    filters: [{ name: 'CueVue Workspace', extensions: ['cuevue'] }]
  });
  if (result.canceled || !result.filePath) return '';
  return normalizeWorkspacePath(result.filePath);
}

function fileMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function sceneAssetEntries(scenes = []) {
  const entries = [];
  scenes.forEach((scene, sceneIndex) => {
    if (!scene || typeof scene !== 'object') return;
    if (scene.bg) entries.push({ sceneIndex, key: 'bg', value: scene.bg });
    if (scene.flow && scene.flow.logoLeftPath) entries.push({ sceneIndex, key: 'flow.logoLeftPath', value: scene.flow.logoLeftPath });
    if (scene.flow && scene.flow.logoRightPath) entries.push({ sceneIndex, key: 'flow.logoRightPath', value: scene.flow.logoRightPath });
    if (Array.isArray(scene.slidePaths)) {
      scene.slidePaths.forEach((value, slideIndex) => {
        if (value) entries.push({ sceneIndex, key: 'slidePaths', slideIndex, value });
      });
    }
  });
  return entries;
}

function setSceneAssetPath(scenes, entry, value) {
  const scene = scenes[entry.sceneIndex];
  if (!scene) return;
  if (entry.key === 'bg') scene.bg = value;
  if (entry.key === 'flow.logoLeftPath' && scene.flow) scene.flow.logoLeftPath = value;
  if (entry.key === 'flow.logoRightPath' && scene.flow) scene.flow.logoRightPath = value;
  if (entry.key === 'slidePaths' && Array.isArray(scene.slidePaths)) scene.slidePaths[entry.slideIndex] = value;
}

function assetIdForFile(filePath, usedIds) {
  const hash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  const ext = path.extname(filePath).toLowerCase() || '.asset';
  let id = `${hash}${ext}`;
  let counter = 1;
  while (usedIds.has(id)) {
    id = `${hash}-${counter}${ext}`;
    counter += 1;
  }
  usedIds.add(id);
  return id;
}

function linkedAssetManifest(scenes, targetPath) {
  const baseDir = path.dirname(targetPath);
  const seen = new Set();
  return sceneAssetEntries(scenes).reduce((assets, entry) => {
    const filePath = String(entry.value || '');
    if (!filePath || seen.has(filePath)) return assets;
    seen.add(filePath);
    assets.push({
      path: filePath,
      filename: path.basename(filePath),
      relativePath: path.isAbsolute(filePath) ? path.relative(baseDir, filePath) : filePath,
      exists: fs.existsSync(filePath)
    });
    return assets;
  }, []);
}

function embedWorkspaceAssets(scenes, targetPath) {
  const assets = [];
  const pathToId = new Map();
  const usedIds = new Set();
  const missingAssets = [];
  sceneAssetEntries(scenes).forEach((entry) => {
    const filePath = String(entry.value || '');
    if (!filePath || filePath.startsWith('cuevue-asset://')) return;
    if (!fs.existsSync(filePath)) {
      missingAssets.push(filePath);
      return;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return;
    let id = pathToId.get(filePath);
    if (!id) {
      id = assetIdForFile(filePath, usedIds);
      pathToId.set(filePath, id);
      assets.push({
        id,
        filename: path.basename(filePath),
        originalPath: filePath,
        relativePath: path.isAbsolute(filePath) ? path.relative(path.dirname(targetPath), filePath) : filePath,
        mimeType: fileMimeType(filePath),
        encoding: 'base64',
        data: fs.readFileSync(filePath).toString('base64')
      });
    }
    setSceneAssetPath(scenes, entry, `cuevue-asset://${id}`);
  });
  return { assets, missingAssets };
}

function embeddedAssetDir(workspacePath) {
  const baseName = path.basename(workspacePath, path.extname(workspacePath));
  const hash = crypto.createHash('sha256').update(workspacePath).digest('hex').slice(0, 12);
  const dir = path.join(app.getPath('userData'), 'workspace-assets', `${safeName(baseName)}-${hash}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function restoreEmbeddedWorkspace(workspace, workspacePath) {
  const scenes = Array.isArray(workspace.scenes) ? cloneJson(workspace.scenes) : [];
  const assets = Array.isArray(workspace.assets) ? workspace.assets : [];
  const assetsById = new Map();
  const dir = embeddedAssetDir(workspacePath);
  const missingAssets = [];
  assets.forEach((asset) => {
    if (!asset || !asset.id || !asset.data) return;
    const fileName = safeName(path.basename(asset.id, path.extname(asset.id))) + (path.extname(asset.id) || path.extname(asset.filename || '') || '.asset');
    const filePath = path.join(dir, fileName);
    try {
      fs.writeFileSync(filePath, Buffer.from(asset.data, asset.encoding === 'base64' ? 'base64' : 'utf8'));
      assetsById.set(asset.id, filePath);
    } catch (_) {
      missingAssets.push(asset.originalPath || asset.filename || asset.id);
    }
  });
  sceneAssetEntries(scenes).forEach((entry) => {
    const value = String(entry.value || '');
    if (!value.startsWith('cuevue-asset://')) return;
    const id = value.replace('cuevue-asset://', '');
    const restoredPath = assetsById.get(id);
    if (restoredPath) setSceneAssetPath(scenes, entry, restoredPath);
    else missingAssets.push(id);
  });
  return { ...workspace, scenes, missingAssets };
}

function verifyLinkedWorkspace(workspace) {
  const missingAssets = [];
  sceneAssetEntries(workspace.scenes || []).forEach((entry) => {
    const filePath = String(entry.value || '');
    if (filePath && !fs.existsSync(filePath)) missingAssets.push(filePath);
  });
  return { ...workspace, missingAssets };
}

function workspacePayload(rendererPayload = {}, options = {}) {
  const mode = options.mode === 'embedded' ? 'embedded' : 'linked';
  const targetPath = options.targetPath || '';
  const scenes = Array.isArray(rendererPayload.scenes) ? cloneJson(rendererPayload.scenes) : [];
  const embedded = mode === 'embedded' ? embedWorkspaceAssets(scenes, targetPath) : { assets: [], missingAssets: [] };
  return {
    app: 'CueVue',
    version: 2,
    mode,
    savedAt: new Date().toISOString(),
    scenes,
    activeId: rendererPayload.activeId || '',
    settings: rendererPayload.settings && typeof rendererPayload.settings === 'object' ? rendererPayload.settings : {},
    notes: readNotes(),
    notebookState: captureNotesWindowState() || readNotesWindowState(),
    assets: mode === 'embedded' ? embedded.assets : [],
    linkedAssets: mode === 'linked' ? linkedAssetManifest(scenes, targetPath) : [],
    missingAssets: embedded.missingAssets
  };
}

function writeWorkspaceFile(filePath, rendererPayload) {
  const targetPath = normalizeWorkspacePath(filePath);
  const mode = rendererPayload && rendererPayload.workspaceMode === 'embedded' ? 'embedded' : 'linked';
  const payload = workspacePayload(rendererPayload, { mode, targetPath });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
  const state = rememberWorkspace(targetPath);
  return { ok: true, path: targetPath, mode, missingAssets: payload.missingAssets || [], recentWorkspaces: state.recentWorkspaces };
}

function notesWindowHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CueVue Notes</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #26221c; background: #26211d; }
    .notebook { position: relative; display: grid; grid-template-rows: auto auto 1fr; height: 100%; padding: 18px 16px 16px 34px; background: #fbf2cf; box-shadow: inset 10px 0 0 #d7534a; }
    .notebook::before { content: ""; position: absolute; left: 9px; top: 18px; bottom: 18px; width: 12px; background: repeating-linear-gradient(to bottom, #42352d 0 8px, transparent 8px 26px); border-radius: 999px; opacity: .8; }
    .notebook::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(to bottom, transparent 0 29px, rgba(66, 95, 150, .28) 29px 30px); }
    .head { position: relative; z-index: 1; display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 2px solid rgba(190, 73, 68, .38); }
    .title { color: #2d2922; font-size: 18px; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
    .subtitle { display: none; }
    .slides { position: relative; z-index: 1; display: none; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px 0 8px; }
    .slides.open { display: grid; }
    .slide-card { display: grid; gap: 4px; min-width: 0; color: #655447; font-size: 11px; font-weight: 800; text-align: center; }
    .slide-card.current { color: #23456f; }
    .slide-card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border: 1px solid rgba(92, 76, 59, .28); border-radius: 5px; background: rgba(255,255,255,.45); }
    textarea { position: relative; z-index: 1; width: 100%; height: 100%; resize: none; border: 0; outline: 0; padding: 12px 2px 4px 0; color: #2b261f; background: transparent; font: 16px/30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .empty-thumb { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 9; border: 1px dashed rgba(92, 76, 59, .28); border-radius: 5px; background: rgba(255,255,255,.25); }
  </style>
</head>
<body>
  <div class="notebook">
    <div class="head">
      <div id="title" class="title">CueVue Notes</div>
      <div id="subtitle" class="subtitle">No scene selected</div>
    </div>
    <div id="slides" class="slides"></div>
    <textarea id="notes" spellcheck="true" placeholder=""></textarea>
  </div>
  <script>
    const { ipcRenderer, fileUrl: cuevueFileUrl } = window.cuevue;
    let currentKey = '';
    let saveTimer = null;
    const title = document.getElementById('title');
    const subtitle = document.getElementById('subtitle');
    const notes = document.getElementById('notes');
    const slides = document.getElementById('slides');

    function fileUrl(filePath) {
      return cuevueFileUrl(filePath);
    }

    function renderSlides(context) {
      slides.innerHTML = '';
      if (!context || context.type !== 'slides' || !Array.isArray(context.slidePaths) || !context.slidePaths.length) {
        slides.classList.remove('open');
        return;
      }
      slides.classList.add('open');
      const index = Number(context.slideIndex) || 0;
      [
        { label: 'Previous', path: context.slidePaths[index - 1], cls: '' },
        { label: 'Current', path: context.slidePaths[index], cls: 'current' },
        { label: 'Next', path: context.slidePaths[index + 1], cls: '' }
      ].forEach((item) => {
        const card = document.createElement('div');
        card.className = 'slide-card ' + item.cls;
        card.innerHTML = item.path
          ? '<img src="' + fileUrl(item.path) + '" alt=""><span>' + item.label + '</span>'
          : '<div class="empty-thumb">-</div><span>' + item.label + '</span>';
        slides.appendChild(card);
      });
    }

    async function loadContext(context) {
      currentKey = context.noteKey || '';
      title.textContent = context.title || 'CueVue Notes';
      subtitle.textContent = context.subtitle || '';
      renderSlides(context);
      notes.value = currentKey ? await ipcRenderer.invoke('notes-get', currentKey) : '';
    }

    notes.addEventListener('input', () => {
      if (!currentKey) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        ipcRenderer.send('notes-save', currentKey, notes.value);
      }, 180);
    });

    ipcRenderer.on('notes-context', (_, context) => loadContext(context || {}));
    ipcRenderer.send('notes-ready');
  </script>
</body>
</html>`;
}

function createNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.show();
    notesWindow.focus();
    if (lastNotesContext) notesWindow.webContents.send('notes-context', lastNotesContext);
    return;
  }

  const savedState = readNotesWindowState();
  notesWindow = new BrowserWindow({
    x: Number.isFinite(savedState.x) ? savedState.x : undefined,
    y: Number.isFinite(savedState.y) ? savedState.y : undefined,
    width: Number(savedState.width) || 360,
    height: Number(savedState.height) || 540,
    minWidth: 300,
    minHeight: 420,
    title: 'CueVue Notes',
    show: false,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    focusable: true,
    backgroundColor: '#fbf2cf',
    webPreferences: {
      preload: appFile('preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  notesWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(notesWindowHtml())}`).catch(() => {});
  notesWindow.once('ready-to-show', () => {
    if (!notesWindow || notesWindow.isDestroyed()) return;
    notesWindow.setAlwaysOnTop(true, 'screen-saver');
    notesWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    notesWindow.show();
    notesWindow.moveTop();
    if (lastNotesContext) notesWindow.webContents.send('notes-context', lastNotesContext);
  });
  notesWindow.on('move', scheduleNotesWindowStateSave);
  notesWindow.on('resize', scheduleNotesWindowStateSave);
  notesWindow.on('close', () => {
    const state = captureNotesWindowState();
    if (state) writeNotesWindowState(state);
  });
  notesWindow.on('closed', () => {
    notesWindow = null;
  });
}

function openMacApp(appName) {
  if (!appName) return;
  execFile('open', ['-a', appName], () => {});
}

function openMacAppAsync(appName) {
  return new Promise((resolve) => {
    if (!appName) {
      resolve(false);
      return;
    }
    execFile('open', ['-a', appName], (error) => {
      resolve(!error);
    });
  });
}

function runAppleScript(script) {
  execFile('osascript', ['-e', script], () => {});
}

function runAppleScriptAsync(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], (error) => {
      resolve(!error);
    });
  });
}

function runAppleScriptWithResult(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 120000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || '',
        stderr: stderr || (error ? error.message : '')
      });
    });
  });
}

function getBackgroundDir() {
  const dir = path.join(app.getPath('userData'), 'backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(value) {
  return String(value || 'scene').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

function saveBackground(srcPath, sceneId = 'iphone') {
  if (!srcPath || typeof srcPath !== 'string') return null;
  const ext = path.extname(srcPath).toLowerCase();
  if (!bgExtensions.includes(ext)) return null;
  if (!fs.existsSync(srcPath)) return null;

  const dir = getBackgroundDir();
  const prefix = `${safeName(sceneId)}-bg`;
  for (const item of fs.readdirSync(dir)) {
    if (item.startsWith(prefix)) {
      try {
        fs.unlinkSync(path.join(dir, item));
      } catch (_) {}
    }
  }

  const destPath = path.join(dir, `${prefix}-${Date.now()}${ext}`);
  fs.copyFileSync(srcPath, destPath);
  return destPath;
}

function getAssetDir(kind) {
  const dir = path.join(app.getPath('userData'), kind);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function emptyDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const item of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, item), { recursive: true, force: true });
  }
}

function slidesDir(sceneId) {
  const dir = path.join(app.getPath('userData'), 'slides', safeName(sceneId || 'slides'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copySlideImages(filePaths, sceneId) {
  const dir = slidesDir(sceneId);
  emptyDir(dir);
  const saved = [];
  filePaths.forEach((filePath, index) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!slideImageExtensions.includes(ext) || !fs.existsSync(filePath)) return;
    const destPath = path.join(dir, `slide-${String(index + 1).padStart(3, '0')}${ext}`);
    fs.copyFileSync(filePath, destPath);
    saved.push(destPath);
  });
  return saved;
}

function collectSlideImages(dir) {
  const images = [];
  function walk(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const itemPath = path.join(folder, item.name);
      if (item.isDirectory()) {
        walk(itemPath);
      } else if (slideImageExtensions.includes(path.extname(item.name).toLowerCase())) {
        images.push(itemPath);
      }
    }
  }
  walk(dir);
  return images.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function appleScriptString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function exportPowerPointToImages(filePath, sceneId) {
  const dir = slidesDir(sceneId);
  emptyDir(dir);

  const script = `
    set pptPath to POSIX file "${appleScriptString(filePath)}"
    set exportFolder to POSIX file "${appleScriptString(dir)}"
    tell application "Microsoft PowerPoint"
      activate
      open pptPath
      delay 1
      set theDeck to active presentation
      save theDeck in exportFolder as save as PNG
      close theDeck saving no
    end tell
  `;

  const result = await runAppleScriptWithResult(script);
  if (!result.ok) {
    return {
      ok: false,
      message: result.stderr || 'PowerPoint could not export this deck.'
    };
  }

  const images = collectSlideImages(dir);

  if (!images.length) {
    return {
      ok: false,
      message: 'PowerPoint export finished, but no slide images were created.'
    };
  }

  return {
    ok: true,
    slides: images,
    source: filePath
  };
}

function saveImageAsset(srcPath, assetId, folder = 'logos') {
  if (!srcPath || typeof srcPath !== 'string') return null;
  const ext = path.extname(srcPath).toLowerCase();
  if (!imageExtensions.includes(ext)) return null;
  if (!fs.existsSync(srcPath)) return null;

  const dir = getAssetDir(folder);
  const prefix = safeName(assetId);
  for (const item of fs.readdirSync(dir)) {
    if (item.startsWith(prefix)) {
      try {
        fs.unlinkSync(path.join(dir, item));
      } catch (_) {}
    }
  }

  const destPath = path.join(dir, `${prefix}-${Date.now()}${ext}`);
  fs.copyFileSync(srcPath, destPath);
  return destPath;
}

function credentialsFile(sceneId) {
  const dir = path.join(app.getPath('userData'), 'credentials');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeName(sceneId)}.json`);
}

function saveCredentials(sceneId, credentials) {
  const payload = JSON.stringify({
    username: credentials && credentials.username ? String(credentials.username) : '',
    password: credentials && credentials.password ? String(credentials.password) : ''
  });
  const value = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(payload).toString('base64')
    : Buffer.from(payload, 'utf8').toString('base64');
  fs.writeFileSync(credentialsFile(sceneId), JSON.stringify({
    encrypted: safeStorage.isEncryptionAvailable(),
    value
  }));
  return true;
}

function getCredentials(sceneId) {
  const filePath = credentialsFile(sceneId);
  if (!fs.existsSync(filePath)) return null;
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const buffer = Buffer.from(saved.value || '', 'base64');
  const text = saved.encrypted ? safeStorage.decryptString(buffer) : buffer.toString('utf8');
  const credentials = JSON.parse(text);
  return {
    username: credentials.username || '',
    password: credentials.password || ''
  };
}

app.whenReady().then(() => {
  // Allow sandboxed renderers to use getUserMedia / desktopCapturer streams.
  // Without this, app.enableSandbox() blocks media permission checks silently.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'display-capture') return true;
    return null; // defer everything else to default
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      callback(true);
      return;
    }
    callback(false);
  });
  createSplashWindow();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createMainWindow();
  }
});

ipcMain.on('open-app', (_, appName) => {
  openMacApp(appName);
});

ipcMain.on('open-url', (_, url) => {
  if (url) shell.openExternal(url);
});

ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.on('exit-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }
});

ipcMain.on('toggle-notes', () => {
  createNotesWindow();
});

ipcMain.on('focus-main-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.on('notes-context', (_, context) => {
  lastNotesContext = context || null;
  if (notesWindow && !notesWindow.isDestroyed() && lastNotesContext) {
    notesWindow.setAlwaysOnTop(true, 'screen-saver');
    notesWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    notesWindow.moveTop();
    notesWindow.webContents.send('notes-context', lastNotesContext);
  }
});

ipcMain.on('notes-ready', (event) => {
  if (lastNotesContext) event.sender.send('notes-context', lastNotesContext);
});

ipcMain.handle('notes-get', async (_, key) => {
  const notes = readNotes();
  return notes[key] || '';
});

ipcMain.on('notes-save', (_, key, text) => {
  if (!key) return;
  const notes = readNotes();
  notes[key] = String(text || '');
  writeNotes(notes);
});

ipcMain.handle('workspace-recent', async () => readWorkspaceState());

ipcMain.handle('workspace-save', async (_, rendererPayload) => {
  try {
    const state = readWorkspaceState();
    const targetPath = state.currentWorkspace || await chooseWorkspaceSavePath();
    if (!targetPath) return { ok: false, canceled: true };
    return writeWorkspaceFile(targetPath, rendererPayload);
  } catch (error) {
    return { ok: false, message: error.message || 'Workspace save failed.' };
  }
});

ipcMain.handle('workspace-save-as', async (_, rendererPayload) => {
  try {
    const targetPath = await chooseWorkspaceSavePath();
    if (!targetPath) return { ok: false, canceled: true };
    return writeWorkspaceFile(targetPath, rendererPayload);
  } catch (error) {
    return { ok: false, message: error.message || 'Workspace save failed.' };
  }
});

ipcMain.handle('workspace-open', async (_, requestedPath) => {
  try {
    let targetPath = requestedPath;
    if (!targetPath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open CueVue Workspace',
        properties: ['openFile'],
        filters: [{ name: 'CueVue Workspace', extensions: ['cuevue'] }]
      });
      if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
      targetPath = result.filePaths[0];
    }
    if (!fs.existsSync(targetPath)) return { ok: false, message: 'Workspace file was not found.' };
    let workspace = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    if (!workspace || !Array.isArray(workspace.scenes)) {
      return { ok: false, message: 'This is not a valid CueVue workspace.' };
    }
    const mode = workspace.mode === 'embedded' || (Array.isArray(workspace.assets) && workspace.assets.length) ? 'embedded' : 'linked';
    workspace = mode === 'embedded'
      ? restoreEmbeddedWorkspace(workspace, targetPath)
      : verifyLinkedWorkspace(workspace);
    if (workspace.notes && typeof workspace.notes === 'object') writeNotes(workspace.notes);
    if (workspace.notebookState && typeof workspace.notebookState === 'object') writeNotesWindowState(workspace.notebookState);
    const state = rememberWorkspace(targetPath);
    return {
      ok: true,
      path: targetPath,
      mode,
      workspace,
      missingAssets: workspace.missingAssets || [],
      recentWorkspaces: state.recentWorkspaces
    };
  } catch (error) {
    return { ok: false, message: error.message || 'Workspace open failed.' };
  }
});

ipcMain.on('launch-quicktime', () => {
  openMacApp('QuickTime Player');
});

ipcMain.handle('quicktime-new-movie-recording', async () => {
  const opened = await openMacAppAsync('QuickTime Player');
  if (!opened) {
    return {
      ok: false,
      message: 'QuickTime Player was not found. Install or restore QuickTime Player, then refresh device windows.'
    };
  }

  setTimeout(() => {
    runAppleScriptAsync('tell application "QuickTime Player" to activate\ntell application "System Events" to keystroke escape\ntell application "System Events" to keystroke "n" using {option down, command down}');
  }, 900);

  return {
    ok: true,
    message: 'QuickTime opened. New Movie Recording was requested; refresh if the window does not appear.'
  };
});

ipcMain.handle('quicktime-status', async () => {
  if (process.platform !== 'darwin') {
    return { ok: true, running: false, windows: [], movieRecording: false };
  }
  try {
    const script = [
      'tell application "System Events"',
      'if not (exists process "QuickTime Player") then return "NOT_RUNNING"',
      'set windowNames to {}',
      'tell process "QuickTime Player"',
      'repeat with appWindow in windows',
      'set end of windowNames to name of appWindow',
      'end repeat',
      'end tell',
      'set AppleScript\'s text item delimiters to linefeed',
      'set joinedNames to windowNames as text',
      'set AppleScript\'s text item delimiters to ""',
      'return joinedNames',
      'end tell'
    ].join('\n');
    const output = await runAppleScriptAsync(script);
    const raw = String(output || '').trim();
    if (raw === 'NOT_RUNNING') return { ok: true, running: false, windows: [], movieRecording: false };
    const windows = raw ? raw.split(/\r?\n/).map((name) => name.trim()).filter(Boolean) : [];
    return {
      ok: true,
      running: true,
      windows,
      movieRecording: windows.some((name) => /movie recording|quicktime|iphone|ipad/i.test(name))
    };
  } catch (error) {
    return {
      ok: false,
      running: false,
      windows: [],
      movieRecording: false,
      message: error.message || 'Unable to inspect QuickTime windows.'
    };
  }
});

ipcMain.on('minimize-quicktime', () => {
  runAppleScript('tell application "System Events" to tell process "QuickTime Player" to set miniaturized of windows to true');
});

function screenPermissionStatus() {
  if (process.platform !== 'darwin') return 'granted';
  try {
    return systemPreferences.getMediaAccessStatus('screen');
  } catch (_) {
    return 'unknown';
  }
}

async function enumerateCaptureSources() {
  const permission = screenPermissionStatus();
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 }
    });
    return {
      ok: true,
      permission,
      error: '',
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.toDataURL()
      }))
    };
  } catch (error) {
    return {
      ok: false,
      permission,
      error: error && error.message ? error.message : 'Unable to list capture sources.',
      sources: []
    };
  }
}

ipcMain.handle('get-capture-sources', async () => enumerateCaptureSources());

ipcMain.handle('get-sources', async () => {
  const result = await enumerateCaptureSources();
  if (!result.ok) throw new Error(result.error || 'Unable to list capture sources.');
  return result.sources;
});

ipcMain.handle('check-screen-permission', () => {
  return screenPermissionStatus();
});

ipcMain.on('open-screen-settings', () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});

ipcMain.handle('save-bg', async (_, srcPath, sceneId) => {
  try {
    return saveBackground(srcPath, sceneId);
  } catch (_) {
    return null;
  }
});

ipcMain.handle('choose-bg', async (_, sceneId) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Scene Background',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return saveBackground(result.filePaths[0], sceneId);
  } catch (_) {
    return null;
  }
});

ipcMain.handle('choose-bg-all', async (_, sceneIds) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Background For All Scenes',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;

    const saved = {};
    const ids = Array.isArray(sceneIds) && sceneIds.length ? sceneIds : ['flow', 'jenn', 'standard', 'iphone', 'slides'];
    for (const sceneId of ids) {
      saved[sceneId] = saveBackground(result.filePaths[0], sceneId);
    }
    return saved;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('choose-logo', async (_, logoId) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Logo',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return saveImageAsset(result.filePaths[0], logoId, 'logos');
  } catch (_) {
    return null;
  }
});

ipcMain.handle('choose-powerpoint', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose PowerPoint Deck',
      properties: ['openFile'],
      filters: [
        { name: 'PowerPoint', extensions: ['ppt', 'pptx', 'pps', 'ppsx'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    execFile('open', ['-a', 'Microsoft PowerPoint', result.filePaths[0]], () => {});
    return result.filePaths[0];
  } catch (_) {
    return null;
  }
});

ipcMain.handle('import-slides', async (_, sceneId) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Slides',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Slides', extensions: ['ppt', 'pptx', 'pps', 'ppsx', 'png', 'jpg', 'jpeg'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;

    const files = result.filePaths;
    const pptFiles = files.filter((filePath) => powerPointExtensions.includes(path.extname(filePath).toLowerCase()));
    const imageFiles = files.filter((filePath) => slideImageExtensions.includes(path.extname(filePath).toLowerCase()));

    if (pptFiles.length) {
      return exportPowerPointToImages(pptFiles[0], sceneId);
    }

    const slides = copySlideImages(imageFiles, sceneId);
    return slides.length
      ? { ok: true, slides, source: imageFiles.length === 1 ? imageFiles[0] : `${imageFiles.length} images` }
      : { ok: false, message: 'No supported slide files were selected.' };
  } catch (error) {
    return {
      ok: false,
      message: error.message || 'Could not import slides.'
    };
  }
});

ipcMain.handle('get-bg', async (_, sceneId = 'iphone') => {
  try {
    const dir = getBackgroundDir();
    const prefix = `${safeName(sceneId)}-bg`;
    for (const item of fs.readdirSync(dir)) {
      const ext = path.extname(item).toLowerCase();
      if (item.startsWith(prefix) && bgExtensions.includes(ext)) {
        return path.join(dir, item);
      }
    }
    return null;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('save-credentials', async (_, sceneId, credentials) => {
  try {
    return saveCredentials(sceneId, credentials);
  } catch (_) {
    return false;
  }
});

ipcMain.handle('get-credentials', async (_, sceneId) => {
  try {
    return getCredentials(sceneId);
  } catch (_) {
    return null;
  }
});
