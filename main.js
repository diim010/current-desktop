const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const db = require('./src/db');
const { detectSource, fetchInfo, downloadAudio } = require('./src/ytdlp');

let mainWindow;
let database;

const SOURCES = ['youtube', 'youtube-music', 'soundcloud'];

function libraryRoot() {
  // Default: ~/Music/Current — override via Settings (stored in app config).
  const cfg = readConfig();
  return cfg.libraryPath || path.join(app.getPath('music'), 'Current');
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(partial) {
  const cfg = { ...readConfig(), ...partial };
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  return cfg;
}

function ensureLibraryFolders() {
  const root = libraryRoot();
  for (const source of SOURCES) {
    fs.mkdirSync(path.join(root, source), { recursive: true });
  }
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
              writeConfig({ libraryPath: result.filePaths[0] });
              ensureLibraryFolders();
              mainWindow.webContents.send('library-path-changed', result.filePaths[0]);
            }
          },
        },
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
  database = db.initDB(app.getPath('userData'));
  ensureLibraryFolders();
  buildMenu();
  createWindow();

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

ipcMain.handle('queue-download', async (event, url) => {
  const source = detectSource(url);
  if (!source) {
    throw new Error("That link isn't YouTube, YouTube Music, or SoundCloud.");
  }

  const jobId = randomUUID();
  const outDir = path.join(libraryRoot(), source);

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
        tags: '',
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

ipcMain.handle('get-tracks', (event, { source, query } = {}) => {
  if (query && query.trim()) return db.searchTracks(database, query.trim());
  return db.getTracks(database, source);
});

ipcMain.handle('all-tags', () => db.allTags(database));

ipcMain.handle('set-tags', (event, { id, tags }) => db.setTags(database, id, tags));

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
