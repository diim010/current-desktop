const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const db = require('./src/db');
const { detectSource, fetchInfo, downloadAudio, searchYoutube, getPreviewUrl } = require('./src/ytdlp');
const slsk = require('./src/slsk');
const config = require('./src/config');
const { isPathWithin, readTrackArtwork, scanLibraryFiles } = require('./src/library-files');

let mainWindow;
let database;
let libraryScanCache = null;
let libraryScanPromise = null;
const LIBRARY_SCAN_CACHE_MS = 15000;

const SOURCES = ['youtube', 'youtube-music', 'soundcloud', 'soulseek'];

function libraryRoot() {
  // Default: ~/Music/Current — override via Settings (stored via electron-store).
  return config.get('libraryPath') || path.join(app.getPath('music'), 'Current');
}

function invalidateLibraryScan() {
  libraryScanCache = null;
}

async function syncLocalLibrary() {
  const root = path.resolve(libraryRoot());
  if (libraryScanCache?.root === root && Date.now() - libraryScanCache.scannedAt < LIBRARY_SCAN_CACHE_MS) {
    return libraryScanCache;
  }

  if (libraryScanPromise) {
    await libraryScanPromise;
    if (libraryScanCache?.root === root && Date.now() - libraryScanCache.scannedAt < LIBRARY_SCAN_CACHE_MS) {
      return libraryScanCache;
    }
  }

  const scanDatabase = database;
  const scanPromise = (async () => {
    const scan = await scanLibraryFiles(root);
    if (scanDatabase !== database || path.resolve(libraryRoot()) !== root) return null;

    db.syncLocalTracks(scanDatabase, scan.tracks, scan.complete);
    libraryScanCache = { ...scan, scannedAt: Date.now() };

    if (scan.errors.length || scan.metadataErrors) {
      for (const { directory, error } of scan.errors) {
        console.warn(`[Library] Could not scan ${directory}: ${error.message}`);
      }
      if (scan.metadataErrors) {
        console.warn(`[Library] Could not read audio metadata for ${scan.metadataErrors} file(s).`);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('library-scan-warning', {
          directoryErrors: scan.errors.length,
          metadataErrors: scan.metadataErrors,
        });
      }
    }

    return libraryScanCache;
  })();
  libraryScanPromise = scanPromise;

  let scan;
  try {
    scan = await scanPromise;
  } finally {
    if (libraryScanPromise === scanPromise) libraryScanPromise = null;
  }
  return scan || syncLocalLibrary();
}

function ensureLibraryFolders() {
  const root = libraryRoot();
  fs.mkdirSync(root, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
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
                invalidateLibraryScan();
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
      invalidateLibraryScan();
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
    invalidateLibraryScan();
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
        album: info ? (info.album || info.release_title || null) : null,
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

ipcMain.handle('get-tracks', async (event, { source, query } = {}) => {
  await syncLocalLibrary();
  const root = path.resolve(libraryRoot());
  const tracks = query && query.trim()
    ? db.searchTracks(database, query.trim())
    : db.getTracks(database, source);

  return tracks.filter(track => track.source !== 'local' || isPathWithin(root, track.filepath));
});

ipcMain.handle('get-track-artwork', async (event, filepath) => {
  const scan = await syncLocalLibrary();
  if (typeof filepath !== 'string' || !filepath) {
    throw new Error('A local file path is required to read artwork.');
  }
  const resolvedPath = path.resolve(filepath);
  if (!isPathWithin(scan.root, resolvedPath) || !scan.tracks.some(track => track.filepath === resolvedPath)) {
    throw new Error('Artwork is only available for files in the selected library folder.');
  }

  try {
    return await readTrackArtwork(resolvedPath);
  } catch (error) {
    console.warn(`[Library] Could not read artwork from ${resolvedPath}: ${error.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('library-scan-warning', { artworkErrors: 1 });
    }
    return null;
  }
});

ipcMain.handle('all-tags', () => db.allTags(database));

ipcMain.handle('set-tags', (event, { id, tags }) => db.setTags(database, id, tags));

ipcMain.handle('set-color', (event, { id, color }) => db.setColor(database, id, color));

ipcMain.handle('delete-track', (event, id) => {
  const track = db.deleteTrack(database, id);
  if (track && track.managed_file !== 0 && track.filepath && fs.existsSync(track.filepath)) {
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
