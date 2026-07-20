const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('current', {
  // Core APIs
  queueDownload: (url) => ipcRenderer.invoke('queue-download', url),
  searchYoutube: (query) => ipcRenderer.invoke('search-youtube', query),
  getPreviewUrl: (url) => ipcRenderer.invoke('get-preview-url', url),
  getTracks: (opts) => ipcRenderer.invoke('get-tracks', opts),
  allTags: () => ipcRenderer.invoke('all-tags'),
  setTags: (id, tags) => ipcRenderer.invoke('set-tags', { id, tags }),
  setColor: (id, color) => ipcRenderer.invoke('set-color', { id, color }),
  deleteTrack: (id) => ipcRenderer.invoke('delete-track', id),
  revealInFinder: (filepath) => ipcRenderer.invoke('reveal-in-finder', filepath),
  openLibraryFolder: () => ipcRenderer.invoke('open-library-folder'),
  getLibraryPath: () => ipcRenderer.invoke('get-library-path'),
  chooseLibraryFolder: () => ipcRenderer.invoke('choose-library-folder'),
  setLibraryFolder: (dir) => ipcRenderer.invoke('set-library-folder', dir),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (partial) => ipcRenderer.invoke('set-config', partial),
  // Soulseek APIs
  slskConnect: (username, password) => ipcRenderer.invoke('slsk-connect', { username, password }),
  slskDisconnect: () => ipcRenderer.invoke('slsk-disconnect'),
  slskStatus: () => ipcRenderer.invoke('slsk-status'),
  slskSearch: (query) => ipcRenderer.invoke('slsk-search', query),
  slskDownload: (opts) => ipcRenderer.invoke('slsk-download', opts),
  // OSC APIs
  oscGetDeckState: (deckNum) => ipcRenderer.invoke('osc-get-deck-state', deckNum),
  oscGetAllDeckStates: () => ipcRenderer.invoke('osc-get-all-deck-states'),
  // MIDI APIs
  midiGetState: () => ipcRenderer.invoke('midi-get-state'),
  midiSetLED: (deck, control, value) => ipcRenderer.invoke('midi-set-led', { deck, control, value }),
  // View switching
  switchView: (view) => ipcRenderer.invoke('switch-view', view),
  // Event listeners
  onJobUpdate: (cb) => ipcRenderer.on('job-update', (event, payload) => cb(payload)),
  onLibraryPathChanged: (cb) => ipcRenderer.on('library-path-changed', (event, path) => cb(path)),
  onOscDeckUpdate: (cb) => ipcRenderer.on('osc-deck-update', (event, data) => cb(data)),
  onMidiConnected: (cb) => ipcRenderer.on('midi-connected', (event, data) => cb(data)),
  onMidiLoadRequest: (cb) => ipcRenderer.on('midi-load-request', (event, data) => cb(data)),
});
