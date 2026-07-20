const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const db = require('./src/db');
const { detectSource, fetchInfo, downloadAudio, searchYoutube, getPreviewUrl } = require('./src/ytdlp');
const slsk = require('./src/slsk');
const config = require('./src/config');
const OSCServer = require('./src/osc-server');

let mainWindow;
let database;
let oscServer;

const SOURCES = ['youtube', 'youtube-music', 'soundcloud', 'soulseek'];

function libraryRoot() {
  // Default: ~/Music/Current — override via Settings (stored via electron-store).
  return config.get('libraryPath') || path.join(app.getPath('music'), 'Current');
}

function ensureLibraryFolders() {
  const root = libraryRoot();
  fs.mkdirSync(root, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 900,
    minWidth: 520,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function switchView(view) {
  const viewFile = view === 'dj' ? 'dj.html' : 'index.html';
  mainWindow.loadFile(path.join(__dirname, 'renderer', viewFile));
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Choose Library Folder…',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory', 'createDirectory'],
            });
            if (!result.canceled && result.filePaths[0]) {
              const newPath = result.filePaths[0];
              config.set('libraryPath', newPath);
              ensureLibraryFolders();
              try {
                // Change database location and reinitialize
                database = db.changeUserDirectory(newPath);
                console.log('[App] Library moved to', newPath);
              } catch (e) {
                console.error('[App] Failed to change library folder:', e);
              }
              mainWindow.webContents.send('library-path-changed', newPath);
            }
          },
        },
        { label: 'Settings', click: () => { createSettingsWindow(); } },
        { type: 'separator' },
        { label: 'Library View', click: () => { switchView('library'); } },
        { label: 'DJ View', click: () => { switchView('dj'); } },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ensureLibraryFolders();
  const libPath = libraryRoot();
  database = db.initDB(libPath);
  console.log('[App] Initialized DB at', libPath);
  
  buildMenu();
  createWindow();
  
  // Start OSC server for Mixxx communication after window is created
  oscServer = new OSCServer(7777, mainWindow);
  oscServer.start();
  // Settings window placeholder
  let settingsWindow = null;
function createSettingsWindow() {
  if (settingsWindow) return;
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 260,
    parent: mainWindow,
    modal: true,
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}



  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (oscServer) {
    oscServer.stop();
  }
  if (process.platform !== 'darwin') app.quit();
});

/* ------------------------------------------------------------------ */
/* IPC                                                                   */
/* ------------------------------------------------------------------ */

ipcMain.handle('get-library-path', () => libraryRoot());

ipcMain.handle('choose-library-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!result.canceled && result.filePaths[0]) {
    const newPath = result.filePaths[0];
    config.set('libraryPath', newPath);
    ensureLibraryFolders();
    try {
      database = db.changeUserDirectory(newPath);
      console.log('[App] Library moved to', newPath);
    } catch (e) {
      console.error('[App] Failed to change library folder:', e);
    }
    mainWindow.webContents.send('library-path-changed', newPath);
    return newPath;
  }
  return null;
});

ipcMain.handle('set-library-folder', async (event, newPath) => {
  if (!newPath) throw new Error('Invalid path');
  config.set('libraryPath', newPath);
  ensureLibraryFolders();
  try {
    database = db.changeUserDirectory(newPath);
    console.log('[App] Library changed via Settings to', newPath);
  } catch (e) {
    console.error('[App] Failed to change library folder via Settings:', e);
  }
  mainWindow.webContents.send('library-path-changed', newPath);
  return newPath;
});

ipcMain.handle('queue-download', async (event, url) => {
  const source = detectSource(url);
  if (!source) {
    throw new Error("That link isn't YouTube, YouTube Music, or SoundCloud.");
  }

  const jobId = randomUUID();
  const outDir = libraryRoot();

  // Run async; report progress via events keyed by jobId.
  (async () => {
    try {
      mainWindow.webContents.send('job-update', { id: jobId, status: 'fetching', source, progress: 0 });

      let info = null;
      try {
        info = await fetchInfo(url);
      } catch {
        // Some extractors (e.g. certain SoundCloud sets) are picky about
        // --dump-json; fall back to downloading without dedup metadata.
      }

      if (info && info.id) {
        const existing = db.findByVideoId(database, info.id);
        if (existing) {
          mainWindow.webContents.send('job-update', {
            id: jobId, status: 'duplicate', source, progress: 100,
            title: info.title, message: 'Already in your library.',
          });
          return;
        }
      }

      mainWindow.webContents.send('job-update', {
        id: jobId, status: 'downloading', source, progress: 0,
        title: info ? info.title : null,
      });

      const filepath = await downloadAudio(url, outDir, (pct) => {
        mainWindow.webContents.send('job-update', { id: jobId, status: 'downloading', source, progress: pct, title: info ? info.title : null });
      });

      const tagsList = [];
      if (source) {
        tagsList.push(source);
      }
      if (info && (info.playlist_title || info.playlist)) {
        tagsList.push(info.playlist_title || info.playlist);
      }
      const initialTags = tagsList.filter(Boolean).join(', ');

      const track = db.insertTrack(database, {
        video_id: info ? info.id : null,
        source,
        title: info ? info.title : path.basename(filepath, '.mp3'),
        artist: info ? (info.artist || info.uploader || null) : null,
        uploader: info ? info.uploader : null,
        duration: info ? Math.round(info.duration || 0) : null,
        filepath,
        thumbnail: info ? info.thumbnail : null,
        url,
        tags: initialTags,
      });

      mainWindow.webContents.send('job-update', {
        id: jobId, status: 'done', source, progress: 100, title: track.title, track,
      });
    } catch (err) {
      mainWindow.webContents.send('job-update', {
        id: jobId, status: 'error', progress: 0, message: err.message,
      });
    }
  })();

  return { id: jobId, source };
});

ipcMain.handle('search-youtube', async (event, query) => {
  return await searchYoutube(query);
});

ipcMain.handle('get-preview-url', async (event, url) => {
  return await getPreviewUrl(url);
});

/* ---- Soulseek IPC ---- */

ipcMain.handle('slsk-connect', async (event, { username, password }) => {
  await slsk.connect(username, password);
  return slsk.getStatus();
});

ipcMain.handle('slsk-disconnect', async () => {
  slsk.disconnect();
  return slsk.getStatus();
});

ipcMain.handle('slsk-status', () => {
  return slsk.getStatus();
});

ipcMain.handle('slsk-search', async (event, query) => {
  return await slsk.search(query, { timeout: 5000 });
});

ipcMain.handle('slsk-download', async (event, { user, filepath, title, artist, duration }) => {
  const jobId = randomUUID();
  const outDir = libraryRoot();

  (async () => {
    try {
      mainWindow.webContents.send('job-update', {
        id: jobId, status: 'downloading', source: 'soulseek', progress: 0, title: title || path.basename(filepath),
      });

      const localPath = await slsk.download(user, filepath, outDir, (pct) => {
        mainWindow.webContents.send('job-update', {
          id: jobId, status: 'downloading', source: 'soulseek', progress: pct, title: title || path.basename(filepath),
        });
      });

      const track = db.insertTrack(database, {
        video_id: null,
        source: 'soulseek',
        title: title || path.basename(localPath, path.extname(localPath)),
        artist: artist || null,
        uploader: user,
        duration: duration || null,
        filepath: localPath,
        thumbnail: null,
        url: null,
        tags: 'soulseek',
      });

      mainWindow.webContents.send('job-update', {
        id: jobId, status: 'done', source: 'soulseek', progress: 100, title: track.title, track,
      });
    } catch (err) {
      mainWindow.webContents.send('job-update', {
        id: jobId, status: 'error', source: 'soulseek', progress: 0, message: err.message,
      });
    }
  })();

  return { id: jobId, source: 'soulseek' };
});


ipcMain.handle('get-config', () => config.getAll());
ipcMain.handle('set-config', (event, partial) => {
  for (const [key, value] of Object.entries(partial)) {
    config.set(key, value);
  }
  return config.getAll();
});

ipcMain.handle('get-tracks', (event, { source, query } = {}) => {
  if (query && query.trim()) return db.searchTracks(database, query.trim());
  return db.getTracks(database, source);
});

ipcMain.handle('all-tags', () => db.allTags(database));

ipcMain.handle('set-tags', (event, { id, tags }) => db.setTags(database, id, tags));

ipcMain.handle('set-color', (event, { id, color }) => db.setColor(database, id, color));

ipcMain.handle('delete-track', (event, id) => {
  const track = db.deleteTrack(database, id);
  if (track && track.filepath && fs.existsSync(track.filepath)) {
    fs.unlinkSync(track.filepath);
  }
  return true;
});

ipcMain.handle('reveal-in-finder', (event, filepath) => {
  shell.showItemInFolder(filepath);
});

ipcMain.handle('open-library-folder', () => {
  shell.openPath(libraryRoot());
});

// OSC-related IPC handlers
ipcMain.handle('osc-get-deck-state', (event, deckNum) => {
  if (oscServer) {
    return oscServer.getDeckState(deckNum);
  }
  return null;
});

ipcMain.handle('osc-get-all-deck-states', () => {
  if (oscServer) {
    return oscServer.getAllDeckStates();
  }
  return null;
});

// View switching
ipcMain.handle('switch-view', (event, view) => {
  switchView(view);
});
