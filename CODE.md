1# Current — Full Codebase Reference

This document compiles all the source code files for the **Current** Electron application.

---

## Configuration & Setup

### [package.json](file:///Users/di/Downloads/current-desktop/package.json)
```json
{
  "name": "current",
  "productName": "Current",
  "version": "1.0.0",
  "description": "Pull tracks from YouTube, YouTube Music, and SoundCloud into a local library.",
  "main": "main.js",
  "author": "You",
  "license": "MIT",
  "scripts": {
    "start": "electron .",
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "dist": "electron-builder --mac"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "@electron/rebuild": "^3.6.0"
  },
  "build": {
    "appId": "com.yourdomain.current",
    "productName": "Current",
    "files": [
      "main.js",
      "preload.js",
      "src/**/*",
      "renderer/**/*"
    ],
    "mac": {
      "category": "public.app-category.music",
      "target": ["dmg", "zip"],
      "icon": "build/icon.icns",
      "hardenedRuntime": true,
      "gatekeeperAssess": false
    },
    "dmg": {
      "title": "Current"
    }
  }
}
```

### [.gitignore](file:///Users/di/Downloads/current-desktop/.gitignore)
```text
node_modules/
dist/
*.log
.DS_Store
```

### [release.sh](file:///Users/di/Downloads/current-desktop/release.sh)
```bash
#!/bin/bash
# Build a release .dmg/.zip for Current.
# Run this on macOS, from the project root: ./release.sh [version]

set -e

cd "$(dirname "$0")"

VERSION="${1:-}"
if [ -n "$VERSION" ]; then
  npm version "$VERSION" --no-git-tag-version
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Building Current v$CURRENT_VERSION..."

# Sanity checks
command -v yt-dlp >/dev/null || echo "Warning: yt-dlp not found on PATH (only matters at runtime, not build time)"
command -v ffmpeg >/dev/null || echo "Warning: ffmpeg not found on PATH (only matters at runtime, not build time)"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

rm -rf dist

echo "Packaging..."
npm run dist

echo ""
echo "Done. Output in ./dist:"
ls -lh dist | grep -E '\.dmg|\.zip'

echo ""
echo "Unsigned build — on first launch, right-click the app and choose Open"
echo "to bypass Gatekeeper (or see README.md for code signing setup)."
```

---

## Electron Main Process & Preload

### [main.js](file:///Users/di/Downloads/current-desktop/main.js)
```javascript
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
```

### [preload.js](file:///Users/di/Downloads/current-desktop/preload.js)
```javascript
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
```

---

## Main Backend Logic

### [src/db.js](file:///Users/di/Downloads/current-desktop/src/db.js)
```javascript
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function initDB(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const db = new Database(path.join(userDataDir, 'library.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT UNIQUE,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      uploader TEXT,
      duration INTEGER,
      filepath TEXT NOT NULL,
      thumbnail TEXT,
      url TEXT,
      tags TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
    CREATE INDEX IF NOT EXISTS idx_tracks_video_id ON tracks(video_id);
  `);
  return db;
}

function findByVideoId(db, videoId) {
  if (!videoId) return null;
  return db.prepare('SELECT * FROM tracks WHERE video_id = ?').get(videoId);
}

function insertTrack(db, track) {
  const stmt = db.prepare(`
    INSERT INTO tracks (video_id, source, title, artist, uploader, duration, filepath, thumbnail, url, tags, added_at)
    VALUES (@video_id, @source, @title, @artist, @uploader, @duration, @filepath, @thumbnail, @url, @tags, @added_at)
  `);
  const info = stmt.run({
    video_id: track.video_id || null,
    source: track.source,
    title: track.title,
    artist: track.artist || null,
    uploader: track.uploader || null,
    duration: track.duration || null,
    filepath: track.filepath,
    thumbnail: track.thumbnail || null,
    url: track.url || null,
    tags: track.tags || '',
    added_at: Date.now(),
  });
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(info.lastInsertRowid);
}

function getTracks(db, source) {
  if (source && source !== 'all') {
    return db.prepare('SELECT * FROM tracks WHERE source = ? ORDER BY added_at DESC').all(source);
  }
  return db.prepare('SELECT * FROM tracks ORDER BY added_at DESC').all();
}

function searchTracks(db, query) {
  const like = `%${query}%`;
  return db.prepare(`
    SELECT * FROM tracks
    WHERE title LIKE ? OR artist LIKE ? OR uploader LIKE ? OR tags LIKE ?
    ORDER BY added_at DESC
  `).all(like, like, like, like);
}

function setTags(db, id, tags) {
  db.prepare('UPDATE tracks SET tags = ? WHERE id = ?').run(tags, id);
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
}

function deleteTrack(db, id) {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  return track;
}

function allTags(db) {
  const rows = db.prepare("SELECT tags FROM tracks WHERE tags != ''").all();
  const set = new Set();
  for (const row of rows) {
    row.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => set.add(t));
  }
  return [...set].sort();
}

module.exports = {
  initDB,
  findByVideoId,
  insertTrack,
  getTracks,
  searchTracks,
  setTags,
  deleteTrack,
  allTags,
};
```

### [src/ytdlp.js](file:///Users/di/Downloads/current-desktop/src/ytdlp.js)
```javascript
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * GUI-launched apps on macOS often don't inherit the shell's PATH, so
 * Homebrew's /opt/homebrew/bin (Apple Silicon) or /usr/local/bin (Intel)
 * may be invisible to spawn(). Resolve a usable binary path once.
 */
function resolveBin(name) {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    name, // fall back to PATH lookup
  ];
  for (const candidate of candidates) {
    if (candidate === name) return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

const YTDLP_PATH = resolveBin('yt-dlp');
const FFMPEG_DIR = path.dirname(resolveBin('ffmpeg'));

function detectSource(url) {
  const u = url.toLowerCase();
  if (u.includes('music.youtube.com')) return 'youtube-music';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('soundcloud.com') || u.includes('snd.sc')) return 'soundcloud';
  return null;
}

/** Fetch metadata without downloading. */
function fetchInfo(url, ytdlpPath = YTDLP_PATH) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlpPath, ['--dump-json', '--no-playlist', '--no-warnings', url]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `yt-dlp exited with ${code}`));
      try {
        // --dump-json can print one JSON object per line for some extractors;
        // take the last non-empty line.
        const lines = out.trim().split('\n').filter(Boolean);
        resolve(JSON.parse(lines[lines.length - 1]));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Download + convert to mp3. Calls onProgress(percent) during download.
 * Resolves with the absolute path of the finished mp3.
 */
function downloadAudio(url, outDir, onProgress, ytdlpPath = YTDLP_PATH) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });

    const args = [
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--embed-metadata', '--embed-thumbnail',
      '--ffmpeg-location', FFMPEG_DIR,
      '--no-playlist', '--no-warnings', '--newline',
      '-o', path.join(outDir, '%(title)s.%(ext)s'),
      '--print', 'after_move:%(filepath)s',
      url,
    ];

    const proc = spawn(ytdlpPath, args);
    let finalPath = '';
    let stderrBuf = '';
    let stdoutBuf = '';

    proc.stdout.on('data', (d) => {
      stdoutBuf += d.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop(); // keep partial line for next chunk

      for (const line of lines) {
        const progressMatch = line.match(/\[download\]\s+([\d.]+)%/);
        if (progressMatch) {
          onProgress(parseFloat(progressMatch[1]));
          continue;
        }
        // --print after_move:%(filepath)s prints the final path on its own line
        if (line.trim().toLowerCase().endsWith('.mp3')) {
          finalPath = line.trim();
        }
      }
    });

    proc.stderr.on('data', (d) => (stderrBuf += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderrBuf.trim() || `yt-dlp exited with ${code}`));
      }
      if (!finalPath) {
        return reject(new Error('Download finished but no output file was reported.'));
      }
      onProgress(100);
      resolve(finalPath);
    });
  });
}

module.exports = { detectSource, fetchInfo, downloadAudio };
```

---

## Renderer & UI

### [renderer/index.html](file:///Users/di/Downloads/current-desktop/renderer/index.html)
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Current</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<div class="titlebar-spacer"></div>

<div class="shell">

  <div class="brand">
    <h1>Current</h1>
    <p id="library-path">Pulling into ~/Music/Current</p>
  </div>

  <form id="composer-form" class="glass composer">
    <input type="url" id="url-input" placeholder="Paste a track link…" autocomplete="off">
    <button type="submit" id="pull-btn">Pull</button>
  </form>
  <div class="error-banner" id="error-banner"></div>

  <div class="queue" id="queue"></div>

  <div class="glass panel">
    <div class="panel-top">
      <div class="tabs" id="tabs">
        <div class="tab active" data-source="all">All</div>
        <div class="tab" data-source="youtube">YouTube</div>
        <div class="tab" data-source="youtube-music">YT Music</div>
        <div class="tab" data-source="soundcloud">SoundCloud</div>
      </div>
      <input type="search" id="search-input" placeholder="Search title, artist, tag…">
    </div>
    <div class="file-list" id="file-list">
      <div class="empty-state">Loading library…</div>
    </div>
  </div>

</div>

<div class="now-playing" id="now-playing">
  <div class="np-info">
    <div class="np-title" id="np-title">—</div>
    <div class="np-meta" id="np-meta">&nbsp;</div>
  </div>
  <audio id="player" controls></audio>
</div>

<script src="renderer.js"></script>
</body>
</html>
```

### [renderer/renderer.js](file:///Users/di/Downloads/current-desktop/renderer/renderer.js)
```javascript
const SOURCE_LABELS = {
  'youtube': 'YouTube',
  'youtube-music': 'YouTube Music',
  'soundcloud': 'SoundCloud',
};

const form        = document.getElementById('composer-form');
const input       = document.getElementById('url-input');
const pullBtn     = document.getElementById('pull-btn');
const queueEl     = document.getElementById('queue');
const errorBanner = document.getElementById('error-banner');
const fileListEl  = document.getElementById('file-list');
const searchInput = document.getElementById('search-input');
const tabs        = document.querySelectorAll('.tab');
const libraryPathEl = document.getElementById('library-path');
const player      = document.getElementById('player');
const npTitle     = document.getElementById('np-title');
const npMeta      = document.getElementById('np-meta');

let activeTab = 'all';
let activeQuery = '';
const jobsById = new Map();

/* ---------------- helpers ---------------- */

function fmtBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
  setTimeout(() => errorBanner.classList.remove('show'), 4000);
}

/* ---------------- library path ---------------- */

window.current.getLibraryPath().then(p => {
  libraryPathEl.textContent = `Pulling into ${p}`;
});
window.current.onLibraryPathChanged(p => {
  libraryPathEl.textContent = `Pulling into ${p}`;
  loadLibrary();
});

/* ---------------- composer / queue ---------------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  pullBtn.disabled = true;
  window.current.queueDownload(url)
    .then(({ id, source }) => {
      input.value = '';
      jobsById.set(id, { id, source, status: 'fetching', progress: 0, title: null });
      renderQueue();
    })
    .catch(err => showError(err.message))
    .finally(() => { pullBtn.disabled = false; });
});

window.current.onJobUpdate((job) => {
  jobsById.set(job.id, { ...jobsById.get(job.id), ...job });
  renderQueue();

  if (job.status === 'done' || job.status === 'duplicate') {
    if (job.status === 'done') loadLibrary();
    setTimeout(() => { jobsById.delete(job.id); renderQueue(); }, 4000);
  }
});

function jobCardHTML(job) {
  const title = job.title || (job.status === 'fetching' ? 'Looking up track…' : 'Downloading…');
  const pct = Math.max(0, Math.min(100, job.progress || 0));
  let stateClass = '';
  let meta = SOURCE_LABELS[job.source] || job.source || '';

  if (job.status === 'done') { stateClass = 'done'; meta += ' · saved'; }
  else if (job.status === 'duplicate') { stateClass = 'duplicate'; meta = 'Already in your library'; }
  else if (job.status === 'error') { stateClass = 'error'; meta += ' · failed'; }
  else if (job.status === 'fetching') { meta += ' · looking up…'; }
  else { meta += ` · ${pct.toFixed(0)}%`; }

  return `
    <div class="job-card ${stateClass}">
      <div class="job-row"><div class="job-title">${escapeHtml(title)}</div></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="job-row">
        <div class="job-meta">${meta}</div>
        ${job.status === 'error' ? `<div class="job-error">${escapeHtml(job.message || 'Something went wrong')}</div>` : ''}
      </div>
    </div>
  `;
}

function renderQueue() {
  const jobs = [...jobsById.values()];
  queueEl.innerHTML = jobs.map(jobCardHTML).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- library ---------------- */

function fileRowHTML(track) {
  const thumb = track.thumbnail ? `style="background-image:url('${track.thumbnail}')"` : '';
  const icon = track.thumbnail ? '' : '♪';
  const tags = (track.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const tagHtml = tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('');

  return `
    <div class="file-row" data-id="${track.id}" data-path="${escapeHtml(track.filepath)}">
      <div class="file-icon" ${thumb}>${icon}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(track.title)}</div>
        <div class="file-meta">
          <span>${SOURCE_LABELS[track.source] || track.source}</span>
          ${track.duration ? `<span>${fmtDuration(track.duration)}</span>` : ''}
          ${tagHtml}
        </div>
      </div>
      <div class="file-actions">
        <button class="tag-btn" title="Edit tags">#</button>
        <button class="reveal-btn" title="Reveal in Finder">⌂</button>
        <button class="danger delete-btn" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function renderLibrary(tracks) {
  if (!tracks.length) {
    fileListEl.innerHTML = `<div class="empty-state">Nothing here yet — pulled tracks land in this list.</div>`;
    return;
  }
  fileListEl.innerHTML = tracks.map(fileRowHTML).join('');

  fileListEl.querySelectorAll('.file-row').forEach(row => {
    const id = Number(row.dataset.id);
    const filepath = row.dataset.path;

    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      playTrack(row, filepath);
    });

    row.querySelector('.reveal-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.current.revealInFinder(filepath);
    });

    row.querySelector('.danger.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.current.deleteTrack(id).then(loadLibrary);
    });

    row.querySelector('.tag-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const current = tracks.find(t => t.id === id);
      const next = prompt('Tags (comma separated):', current.tags || '');
      if (next === null) return;
      await window.current.setTags(id, next.trim());
      loadLibrary();
    });
  });
}

function playTrack(row, filepath) {
  document.querySelectorAll('.file-row.playing').forEach(r => r.classList.remove('playing'));
  row.classList.add('playing');
  player.src = `file://${filepath}`;
  player.play();
  npTitle.textContent = row.querySelector('.file-name').textContent;
  npMeta.textContent = row.querySelector('.file-meta').textContent.trim();
}

function loadLibrary() {
  const opts = activeQuery ? { query: activeQuery } : { source: activeTab };
  window.current.getTracks(opts).then(renderLibrary);
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.source;
    searchInput.value = '';
    activeQuery = '';
    loadLibrary();
  });
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    activeQuery = searchInput.value.trim();
    loadLibrary();
  }, 200);
});

loadLibrary();
```

### [renderer/style.css](file:///Users/di/Downloads/current-desktop/renderer/style.css)
```css
:root {
  --glass-fill: rgba(255,255,255,0.06);
  --glass-fill-strong: rgba(255,255,255,0.12);
  --glass-border: rgba(255,255,255,0.16);
  --glass-highlight: rgba(255,255,255,0.4);
  --text-primary: #f5f7fb;
  --text-secondary: #b9c2cf;
  --text-faint: #7c8896;
  --accent-youtube: #ff6b81;
  --accent-ytmusic: #a78bfa;
  --accent-soundcloud: #ffab5e;
  --accent-cyan: #5eead4;
  --radius-lg: 20px;
  --radius-md: 14px;
  --radius-sm: 10px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: transparent;
  color: var(--text-primary);
  font-family: -apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

.titlebar-spacer {
  height: 28px;
  -webkit-app-region: drag;
}

.shell {
  max-width: 640px;
  margin: 0 auto;
  padding: 4px 22px 0;
  height: calc(100vh - 90px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.brand { margin-bottom: 18px; flex-shrink: 0; }
.brand h1 {
  font-weight: 700;
  font-size: 26px;
  letter-spacing: -0.02em;
  margin: 0;
}
.brand p {
  margin: 4px 0 0;
  color: var(--text-faint);
  font-size: 12px;
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}

.glass {
  background: var(--glass-fill);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    0 8px 28px rgba(0,0,0,0.25);
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
  border-radius: 999px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.composer input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 14px;
  padding: 9px 0;
}
.composer input::placeholder { color: var(--text-faint); }
.composer button {
  border: none;
  border-radius: 999px;
  padding: 9px 18px;
  font-weight: 600;
  font-size: 13px;
  color: #06121a;
  background: linear-gradient(135deg, var(--accent-cyan), #9be9ff);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.composer button:active { transform: scale(0.96); }
.composer button:disabled { opacity: 0.5; }

.error-banner {
  display: none;
  margin: 0 0 12px 14px;
  color: var(--accent-youtube);
  font-size: 12.5px;
  flex-shrink: 0;
}
.error-banner.show { block; }

/* ---------------- Queue ---------------- */
.queue {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.queue:empty { display: none; }

.job-card {
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--glass-fill);
  border: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.job-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.job-title {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.job-meta { font-size: 11px; color: var(--text-faint); font-family: 'SF Mono', monospace; }
.job-error { font-size: 12px; color: var(--accent-youtube); }

.progress-track {
  height: 5px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden;
}
.progress-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-ytmusic), var(--accent-cyan));
  width: 0%; transition: width 0.4s ease; position: relative; overflow: hidden;
}
.progress-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%);
  background-size: 200% 100%; animation: shimmer 1.6s linear infinite;
}
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.job-card.done .progress-fill::after,
.job-card.duplicate .progress-fill::after { animation: none; }
.job-card.done .progress-fill,
.job-card.duplicate .progress-fill { background: linear-gradient(90deg, #34d399, var(--accent-cyan)); }
.job-card.error .progress-fill { background: var(--accent-youtube); }

/* ---------------- Library panel ---------------- */
.panel {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.panel-top { flex-shrink: 0; margin-bottom: 10px; }
.tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.tab {
  flex: 1; text-align: center; padding: 7px 4px;
  border-radius: var(--radius-sm); border: 1px solid transparent;
  background: rgba(255,255,255,0.04); color: var(--text-secondary);
  font-size: 11px; font-family: 'SF Mono', monospace; cursor: pointer;
}
.tab.active { background: var(--glass-fill-strong); border-color: var(--glass-border); color: var(--text-primary); }

#search-input {
  width: 100%; background: rgba(255,255,255,0.04); border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm); padding: 8px 12px; color: var(--text-primary);
  font-size: 13px; outline: none;
}
#search-input::placeholder { color: var(--text-faint); }

.file-list {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 7px;
  padding-right: 2px;
}
.file-list::-webkit-scrollbar { width: 6px; }
.file-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

.file-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border-radius: var(--radius-sm); background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06); cursor: pointer;
  transition: background 0.15s ease;
}
.file-row:hover { background: rgba(255,255,255,0.05); }
.file-row.playing { background: var(--glass-fill-strong); border-color: var(--accent-cyan); }

.file-icon {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background-size: cover; background-position: center;
  background-color: rgba(255,255,255,0.05); font-size: 13px;
}
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-meta { font-size: 10.5px; color: var(--text-faint); font-family: 'SF Mono', monospace; margin-top: 2px; display: flex; gap: 6px; flex-wrap: wrap; }
.tag-chip {
  display: inline-block; padding: 1px 6px; border-radius: 999px;
  background: rgba(167,139,250,0.18); color: var(--accent-ytmusic);
  font-size: 10px;
}
.file-actions { display: flex; gap: 5px; flex-shrink: 0; }
.file-actions button {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border-radius: 7px; border: 1px solid var(--glass-border);
  background: rgba(255,255,255,0.04); color: var(--text-secondary);
  cursor: pointer; font-size: 12px;
}
.file-actions button:hover { background: var(--glass-fill-strong); color: var(--text-primary); }
.file-actions button.danger:hover { color: var(--accent-youtube); }

.empty-state { padding: 24px 8px; text-align: center; color: var(--text-faint); font-size: 12.5px; }

/* ---------------- Now playing bar ---------------- */
.now-playing {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 14px;
  padding: 10px 22px; background: rgba(20,22,30,0.6);
  border-top: 1px solid var(--glass-border);
  backdrop-filter: blur(20px);
}
.np-info { flex-shrink: 0; width: 180px; min-width: 0; }
.np-title { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-meta { font-size: 10.5px; color: var(--text-faint); font-family: 'SF Mono', monospace; }
#player { flex: 1; height: 28px; }
#player::-webkit-media-controls-panel { background: transparent; }
```
