const { contextBridge, ipcRenderer } = require('electron');

function filePathToUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${prefixed.split('/').map(encodeURIComponent).join('/')}`;
}

const sendChannels = new Set([
  'open-app',
  'open-url',
  'toggle-fullscreen',
  'exit-fullscreen',
  'toggle-notes',
  'focus-main-window',
  'notes-context',
  'notes-ready',
  'notes-save',
  'notes-select-slide',
  'launch-quicktime',
  'minimize-quicktime',
  'open-screen-settings'
]);

const invokeChannels = new Set([
  'notes-get',
  'quicktime-new-movie-recording',
  'quicktime-status',
  'get-capture-sources',
  'get-sources',
  'check-screen-permission',
  'save-bg',
  'choose-bg',
  'choose-bg-all',
  'choose-logo',
  'choose-powerpoint',
  'import-slides',
  'get-bg',
  'save-credentials',
  'get-credentials',
  'workspace-save',
  'workspace-save-as',
  'workspace-open',
  'workspace-recent'
]);

const receiveChannels = new Set([
  'notes-context',
  'notes-select-slide'
]);

contextBridge.exposeInMainWorld('cuevue', {
  ipcRenderer: {
    send(channel, ...args) {
      if (!sendChannels.has(channel)) return;
      ipcRenderer.send(channel, ...args);
    },
    invoke(channel, ...args) {
      if (!invokeChannels.has(channel)) {
        return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    on(channel, listener) {
      if (!receiveChannels.has(channel) || typeof listener !== 'function') return () => {};
      const wrapped = (_event, ...args) => listener(undefined, ...args);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    }
  },
  fileUrl(filePath) {
    return filePath ? filePathToUrl(filePath) : '';
  }
});

function injectRuntimeHotfix() {
  const script = document.createElement('script');
  script.textContent = `
(() => {
  const cuevue = window.cuevue;
  if (!cuevue || window.__cuevueRuntimeHotfixApplied) return;
  window.__cuevueRuntimeHotfixApplied = true;

  const css = document.createElement('style');
  css.textContent = \`
    .scene-slot.permission-target::before { content: none !important; }
    .toolbar-icon-button[aria-label="Presenter notebook"]::before { content: "🗒"; font-size: 17px; }
    .toolbar-icon-button[aria-label="Presenter notebook"] { font-size: 0 !important; }
    .toolbar-icon-button[aria-label="Refresh current scene"] { color: #dce9ff; }
    .toolbar-icon-button[aria-label="Add scene"] { color: #bff0bd; }
    .source-card { min-height: 172px !important; }
    .source-card img { min-height: 86px; image-rendering: auto; }
    .source-card small { display: block; margin-top: 4px; color: #8fa0b2; font-size: 10px; line-height: 1.2; }
    .source-card .source-score { display: inline-block; margin-left: 5px; color: #91d18b; font-size: 10px; font-weight: 800; }
    .scene-button-label::before { content: none !important; }
    .device-diagnostics { display: none !important; }
  \`;
  document.head.appendChild(css);

  function scoreSource(source, kind) {
    const name = String(source && source.name || '').toLowerCase();
    const id = String(source && source.id || '').toLowerCase();
    if (kind === 'device') {
      if (name.includes('movie recording')) return 0;
      if (name.includes('quicktime') && (name.includes('iphone') || name.includes('ipad'))) return 1;
      if (name.includes('quicktime') && name.includes('recording')) return 2;
      if (name.includes('quicktime')) return 3;
      if (name.includes('iphone') || name.includes('ipad')) return 4;
      if (source.kind === 'screen' || id.startsWith('screen:')) return 50;
      return 30;
    }
    if (kind === 'window') return (source.kind === 'screen' || id.startsWith('screen:')) ? 8 : 1;
    return 5;
  }

  async function forceScan(kind) {
    const result = await cuevue.ipcRenderer.invoke('get-capture-sources', {
      reason: kind || 'manual',
      forced: true,
      at: Date.now()
    });
    const allSources = Array.isArray(result && result.sources) ? result.sources : [];
    const sources = allSources.slice().sort((a, b) => scoreSource(a, kind) - scoreSource(b, kind) || String(a.name).localeCompare(String(b.name)));
    return { result, allSources, sources };
  }

  function findActiveDeviceScene() {
    try {
      return Array.isArray(window.scenes) ? window.scenes.find((scene) => scene.id === window.activeId && scene.type === 'device') : null;
    } catch (_) {
      return null;
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function openFallbackGrid() {
    const fallback = document.getElementById('device-fallback');
    if (fallback) fallback.classList.add('open');
  }

  function patchToolbarLabels() {
    document.querySelectorAll('.scene-button').forEach((button) => {
      const label = button.querySelector('.scene-button-label');
      if (!label || button.__cuevueLabelPatched) return;
      button.__cuevueLabelPatched = true;
      const text = label.textContent || button.getAttribute('aria-label') || '';
      if (/iphone|device/i.test(text)) button.setAttribute('aria-label', 'Mobile Device');
      if (/slide/i.test(text)) button.setAttribute('aria-label', 'Slides');
      if (/flow|toc/i.test(text)) button.setAttribute('aria-label', 'Flow');
    });
  }

  const originalAlert = window.alert;
  window.alert = (message) => {
    const text = String(message || '');
    if (/screen recording|permission|denied/i.test(text)) {
      setText('selected-device-label', 'Mobile device disconnected.');
      return;
    }
    originalAlert.call(window, message);
  };

  window.cuevueForceSourceScan = forceScan;

  function tick() {
    patchToolbarLabels();
  }

  window.addEventListener('DOMContentLoaded', tick);
  setInterval(tick, 750);
})();
  `;
  document.documentElement.appendChild(script);
  script.remove();
}

window.addEventListener('DOMContentLoaded', injectRuntimeHotfix);
