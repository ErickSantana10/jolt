const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getDesktopSources: () => ipcRenderer.invoke('desktop-capturer:get-sources'),
  selectDesktopSource: (options) => ipcRenderer.invoke('desktop-capturer:select-source', options),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  installUpdate: (downloadUrl) => ipcRenderer.invoke('app:install-update', { downloadUrl }),
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('app:update-progress', listener);
    return () => ipcRenderer.removeListener('app:update-progress', listener);
  },
  getSavedAuth: () => ipcRenderer.invoke('auth:get-saved'),
  saveAuth: (data) => ipcRenderer.invoke('auth:save', data),
  clearSavedAuth: () => ipcRenderer.invoke('auth:clear'),
  startProcessAudioCapture: () => ipcRenderer.invoke('audio-capture:start'),
  stopProcessAudioCapture: () => ipcRenderer.invoke('audio-capture:stop'),
  onProcessAudioData: (callback) => {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on('audio-capture:pcm', listener);
    return () => ipcRenderer.removeListener('audio-capture:pcm', listener);
  },
});
