const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Global references to the current database instance and its user data directory
let currentDb = null;
let currentUserDir = null;

function getCurrentDb() {
  return currentDb;
}

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
      album TEXT,
      uploader TEXT,
      duration INTEGER,
      filepath TEXT NOT NULL,
      thumbnail TEXT,
      url TEXT,
      tags TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'none',
      managed_file INTEGER NOT NULL DEFAULT 1,
      available INTEGER NOT NULL DEFAULT 1,
      added_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
    CREATE INDEX IF NOT EXISTS idx_tracks_video_id ON tracks(video_id);
  `);

  try {
    db.exec("ALTER TABLE tracks ADD COLUMN color TEXT NOT NULL DEFAULT 'none'");
  } catch (e) {
    // ignore if column exists
  }

  const columns = db.pragma('table_info(tracks)');
  if (!columns.some(column => column.name === 'album')) {
    db.exec('ALTER TABLE tracks ADD COLUMN album TEXT');
  }
  if (!columns.some(column => column.name === 'managed_file')) {
    db.exec('ALTER TABLE tracks ADD COLUMN managed_file INTEGER NOT NULL DEFAULT 1');
  }
  if (!columns.some(column => column.name === 'available')) {
    db.exec('ALTER TABLE tracks ADD COLUMN available INTEGER NOT NULL DEFAULT 1');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_filepath ON tracks(filepath)');

  // Store references for later directory changes
  currentDb = db;
  currentUserDir = userDataDir;

  return db;
}

function findByVideoId(db, videoId) {
  if (!videoId) return null;
  return db.prepare('SELECT * FROM tracks WHERE video_id = ?').get(videoId);
}

function insertTrack(db, track) {
  const stmt = db.prepare(`
    INSERT INTO tracks (video_id, source, title, artist, album, uploader, duration, filepath, thumbnail, url, tags, color, managed_file, available, added_at)
    VALUES (@video_id, @source, @title, @artist, @album, @uploader, @duration, @filepath, @thumbnail, @url, @tags, @color, @managed_file, @available, @added_at)
  `);
  const info = stmt.run({
    video_id: track.video_id || null,
    source: track.source,
    title: track.title,
    artist: track.artist || null,
    album: track.album || null,
    uploader: track.uploader || null,
    duration: track.duration || null,
    filepath: track.filepath,
    thumbnail: track.thumbnail || null,
    url: track.url || null,
    tags: track.tags || '',
    color: track.color || 'none',
    managed_file: track.managed_file === 0 ? 0 : 1,
    available: track.available === 0 ? 0 : 1,
    added_at: track.added_at || Date.now(),
  });
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(info.lastInsertRowid);
}

function getTracks(db, source) {
  if (source && source !== 'all') {
    return db.prepare('SELECT * FROM tracks WHERE available = 1 AND source = ? ORDER BY added_at DESC').all(source);
  }
  return db.prepare('SELECT * FROM tracks WHERE available = 1 ORDER BY added_at DESC').all();
}

function searchTracks(db, query) {
  const like = `%${query}%`;
  return db.prepare(`
    SELECT * FROM tracks
    WHERE available = 1 AND (
      title LIKE ? OR artist LIKE ? OR album LIKE ? OR uploader LIKE ? OR tags LIKE ? OR color LIKE ?
    )
    ORDER BY added_at DESC
  `).all(like, like, like, like, like, like);
}

function setTags(db, id, tags) {
  db.prepare('UPDATE tracks SET tags = ? WHERE id = ?').run(tags, id);
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
}

function setColor(db, id, color) {
  db.prepare('UPDATE tracks SET color = ? WHERE id = ?').run(color, id);
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
}

function deleteTrack(db, id) {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
  if (track && track.managed_file === 0) {
    db.prepare('UPDATE tracks SET available = 0 WHERE id = ?').run(id);
  } else {
    db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  }
  return track;
}

function syncLocalTracks(db, tracks, complete) {
  const normalizePath = filepath => {
    const resolved = path.resolve(filepath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const existingRows = db.prepare('SELECT id, filepath, source, available FROM tracks').all();
  const existingByPath = new Map(existingRows.map(row => [normalizePath(row.filepath), row]));
  const presentPaths = new Set();

  const sync = db.transaction(() => {
    for (const track of tracks) {
      const filepath = path.resolve(track.filepath);
      const key = normalizePath(filepath);
      presentPaths.add(key);
      const existing = existingByPath.get(key);

      if (existing) {
        if (existing.source === 'local' && existing.available) {
          db.prepare(`
            UPDATE tracks
            SET title = ?, artist = ?, album = ?, duration = ?, added_at = ?
            WHERE id = ?
          `).run(track.title, track.artist || null, track.album || null, track.duration || null, track.added_at, existing.id);
        }
        continue;
      }

      const inserted = insertTrack(db, {
        ...track,
        filepath,
        thumbnail: null,
        managed_file: 0,
      });
      existingByPath.set(key, {
        id: inserted.id,
        filepath,
        source: 'local',
        available: 1,
      });
    }

    if (complete) {
      const deleteMissing = db.prepare("DELETE FROM tracks WHERE id = ? AND source = 'local'");
      for (const row of existingRows) {
        if (row.source === 'local' && !presentPaths.has(normalizePath(row.filepath))) {
          deleteMissing.run(row.id);
        }
      }
    }
  });

  sync();
}

function allTags(db) {
  const rows = db.prepare("SELECT tags FROM tracks WHERE available = 1 AND tags != ''").all();
  const set = new Set();
  for (const row of rows) {
    row.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => set.add(t));
  }
  return [...set].sort();
}

function changeUserDirectory(newDir) {
  console.log(`[DB] Changing user directory to ${newDir}`);
  fs.mkdirSync(newDir, { recursive: true });

  if (currentDb && currentUserDir) {
    const oldPath = path.join(currentUserDir, 'library.db');
    const newPath = path.join(newDir, 'library.db');
    currentDb.close();
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    }
    currentDb = initDB(newDir);
  } else {
    currentDb = initDB(newDir);
  }
  return currentDb;
}

function getDbFilePath() {
  return currentUserDir ? path.join(currentUserDir, 'library.db') : null;
}

module.exports = {
  initDB,
  getCurrentDb,
  findByVideoId,
  insertTrack,
  getTracks,
  searchTracks,
  syncLocalTracks,
  setTags,
  setColor,
  deleteTrack,
  allTags,
  changeUserDirectory,
  getDbFilePath,
};
