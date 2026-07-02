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
      uploader TEXT,
      duration INTEGER,
      filepath TEXT NOT NULL,
      thumbnail TEXT,
      url TEXT,
      tags TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'none',
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
    INSERT INTO tracks (video_id, source, title, artist, uploader, duration, filepath, thumbnail, url, tags, color, added_at)
    VALUES (@video_id, @source, @title, @artist, @uploader, @duration, @filepath, @thumbnail, @url, @tags, @color, @added_at)
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
    color: track.color || 'none',
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
    WHERE title LIKE ? OR artist LIKE ? OR uploader LIKE ? OR tags LIKE ? OR color LIKE ?
    ORDER BY added_at DESC
  `).all(like, like, like, like, like);
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
  setTags,
  setColor,
  deleteTrack,
  allTags,
  changeUserDirectory,
  getDbFilePath,
};
