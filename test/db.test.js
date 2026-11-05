const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const libraryDb = require('../src/db');

test('adds album metadata to existing libraries and searches it', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'current-library-'));
  const dbPath = path.join(userDataDir, 'library.db');
  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
    CREATE TABLE tracks (
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
    INSERT INTO tracks (source, title, filepath, added_at)
    VALUES ('youtube', 'Older recording', '/music/older.mp3', 1);
  `);
  legacyDb.close();

  try {
    const db = libraryDb.initDB(userDataDir);
    const [existingTrack] = libraryDb.getTracks(db);
    assert.equal(existingTrack.title, 'Older recording');
    assert.equal(existingTrack.album, null);
    assert.equal(existingTrack.managed_file, 1);
    assert.equal(existingTrack.available, 1);

    const addedTrack = libraryDb.insertTrack(db, {
      source: 'soundcloud',
      title: 'New recording',
      artist: 'Example Artist',
      album: 'Release Notes',
      filepath: '/music/new.mp3',
    });

    assert.equal(addedTrack.album, 'Release Notes');
    assert.deepEqual(libraryDb.searchTracks(db, 'Release Notes').map(track => track.id), [addedTrack.id]);
  } finally {
    const currentDb = libraryDb.getCurrentDb();
    if (currentDb && currentDb.open) currentDb.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('indexes local audio files without duplicating downloads and hides them without deleting the file', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'current-library-local-'));
  const libraryRoot = path.join(userDataDir, 'Music');
  fs.mkdirSync(libraryRoot);
  const importedPath = path.join(libraryRoot, 'downloaded.mp3');
  const localPath = path.join(libraryRoot, 'local.flac');
  fs.writeFileSync(importedPath, 'downloaded');
  fs.writeFileSync(localPath, 'local');

  try {
    const db = libraryDb.initDB(userDataDir);
    const imported = libraryDb.insertTrack(db, {
      source: 'youtube',
      title: 'Imported',
      filepath: importedPath,
    });

    libraryDb.syncLocalTracks(db, [
      { source: 'local', title: 'Duplicate download', filepath: importedPath, added_at: 1 },
      { source: 'local', title: 'Local recording', filepath: localPath, added_at: 2 },
    ], true);

    const tracks = libraryDb.getTracks(db);
    assert.equal(tracks.length, 2);
    assert.equal(tracks.find(track => track.id === imported.id).title, 'Imported');
    const localTrack = tracks.find(track => track.source === 'local');
    assert.equal(localTrack.title, 'Local recording');
    assert.equal(localTrack.managed_file, 0);

    libraryDb.deleteTrack(db, localTrack.id);
    assert.equal(fs.existsSync(localPath), true);
    assert.equal(libraryDb.getTracks(db, 'local').length, 0);

    libraryDb.syncLocalTracks(db, [
      { source: 'local', title: 'Local recording', filepath: localPath, added_at: 2 },
    ], true);
    assert.equal(libraryDb.getTracks(db, 'local').length, 0);
    assert.equal(db.prepare('SELECT available FROM tracks WHERE id = ?').get(localTrack.id).available, 0);

    const stale = libraryDb.insertTrack(db, {
      source: 'local',
      title: 'Previously indexed',
      filepath: path.join(libraryRoot, 'missing.mp3'),
      managed_file: 0,
    });
    libraryDb.syncLocalTracks(db, [], false);
    assert.ok(db.prepare('SELECT id FROM tracks WHERE id = ?').get(stale.id));
    libraryDb.syncLocalTracks(db, [], true);
    assert.equal(db.prepare('SELECT id FROM tracks WHERE id = ?').get(stale.id), undefined);
  } finally {
    const currentDb = libraryDb.getCurrentDb();
    if (currentDb && currentDb.open) currentDb.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
