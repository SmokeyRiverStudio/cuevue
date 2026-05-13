const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

const sendChannels = new Set([
  'open-app',
  'open-url',
  'toggle-notes',
  'notes-context',
  'notes-ready',
  'notes-save',
  'launch-quicktime',
  'minimize-quicktime',
  'open-screen-settings'
]);

const invokeChannels = new Set([
  'notes-get',
  'quicktime-new-movie-recording',
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
  'notes-context'
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
    return filePath ? pathToFileURL(filePath).href : '';
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const key = 'cuevue.flow.quickedit.v1';
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fallback = [
    ['Asset Hierarchy', 'Structure the operation', 'Context fast', 'Find what matters quickly'],
    ['Scheduled Maintenance', 'Calendar PMs', 'Less firefighting', 'Prevent missed work'],
    ['Mobile App', 'Floor-ready workflows', 'Maintenance anywhere', 'Technicians stay moving'],
    ['Analytics & Reporting', 'Proof, not promises', 'Data-driven decisions', 'Show the improvement'],
    ['', '', '', ''],
    ['', '', '', '']
  ];
  const load = () => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  };
  const save = (rows) => localStorage.setItem(key, JSON.stringify(rows));
  const render = () => {
    const box = document.getElementById('flow-topics');
    if (!box) return;
    const rows = load().filter((r) => r.some((v) => String(v || '').trim()));
    box.innerHTML = rows.map((r, i) => `<div class="flow-topic revealed"><div class="flow-topic-number">${i + 1}</div><div class="flow-topic-copy"><div class="flow-topic-heading">${esc(r[0])}</div><div class="flow-topic-subheading">${esc(r[1])}</div></div><div class="flow-topic-check">✓</div><div class="flow-topic-impact" style="opacity:1;transform:none;pointer-events:auto"><div class="flow-topic-impact-heading">${esc(r[2])}</div><div class="flow-topic-impact-subheading">${esc(r[3])}</div></div></div>`).join('');
  };
  const quickEdit = () => {
    const rows = load();
    for (let i = 0; i < 6; i += 1) {
      const current = rows[i] || ['', '', '', ''];
      const raw = window.prompt(`Flow row ${i + 1}: Topic | Sub-topic | Impact | Sub-impact`, current.join(' | '));
      if (raw === null) break;
      rows[i] = raw.split('|').map((x) => x.trim()).concat(['','','','']).slice(0, 4);
    }
    save(rows);
    render();
  };
  const addButton = () => {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar || document.getElementById('flow-quick-edit-button')) return;
    const btn = document.createElement('button');
    btn.id = 'flow-quick-edit-button';
    btn.className = 'toolbar-icon-button';
    btn.type = 'button';
    btn.title = 'Emergency Flow Quick Edit';
    btn.textContent = 'F';
    btn.addEventListener('click', quickEdit);
    toolbar.appendChild(btn);
  };
  document.addEventListener('click', (event) => {
    const edit = event.target.closest('.edit-scene-button');
    if (!edit) return;
    const sceneButton = edit.parentElement && edit.parentElement.querySelector('.scene-button');
    if (sceneButton && sceneButton.textContent.trim().toLowerCase().includes('flow')) {
      event.preventDefault();
      event.stopPropagation();
      quickEdit();
    }
  }, true);
  addButton();
  render();
});
