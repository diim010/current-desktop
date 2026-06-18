const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('current', {
  queueDownload: (url) => ipcRenderer.invoke('queue-download', url),
  getTracks: (opts) => ipcRenderer.invoke('get-tracks', opts),
  allTags: () => ipcRenderer.invoke('all-tags'),
  setTags: (id, tags) => ipcRenderer.invoke('set-tags', { id, tags }),
  deleteTrack: (id) => ipcRenderer.invoke('delete-track', id),
  revealInFinder: (filepath) => ipcRenderer.invoke('reveal-in-finder', filepath),
  openLibraryFolder: () => ipcRenderer.invoke('open-library-folder'),
  getLibraryPath: () => ipcRenderer.invoke('get-library-path'),
  onJobUpdate: (cb) => ipcRenderer.on('job-update', (event, payload) => cb(payload)),
  onLibraryPathChanged: (cb) => ipcRenderer.on('library-path-changed', (event, path) => cb(path)),
});
