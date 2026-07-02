const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('current', {
  // Core APIs
  queueDownload: (url) => ipcRenderer.invoke('queue-download', url),
  searchYoutube: (query) => ipcRenderer.invoke('search-youtube', query),
  getTracks: (opts) => ipcRenderer.invoke('get-tracks', opts),
  allTags: () => ipcRenderer.invoke('all-tags'),
  setTags: (id, tags) => ipcRenderer.invoke('set-tags', { id, tags }),
  setColor: (id, color) => ipcRenderer.invoke('set-color', { id, color }),
  deleteTrack: (id) => ipcRenderer.invoke('delete-track', id),
  revealInFinder: (filepath) => ipcRenderer.invoke('reveal-in-finder', filepath),
  openLibraryFolder: () => ipcRenderer.invoke('open-library-folder'),
  getLibraryPath: () => ipcRenderer.invoke('get-library-path'),
  chooseLibraryFolder: () => ipcRenderer.invoke('choose-library-folder'),
  // Settings API
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (partial) => ipcRenderer.invoke('set-config', partial),
  // Event listeners
  onJobUpdate: (cb) => ipcRenderer.on('job-update', (event, payload) => cb(payload)),
  onLibraryPathChanged: (cb) => ipcRenderer.on('library-path-changed', (event, path) => cb(path)),
});
