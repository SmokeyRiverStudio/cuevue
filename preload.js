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
    return filePath ? filePathToUrl(filePath) : '';
  }
});
