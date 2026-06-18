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
