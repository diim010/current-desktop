const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { isPathWithin, scanLibraryFiles } = require('../src/library-files');

function makeOneSecondWav() {
  const sampleRate = 8000;
  const dataSize = sampleRate * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

test('scans supported audio recursively without following directory symlinks', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'current-library-scan-'));
  const root = path.join(tempDir, 'Current');
  const nested = path.join(root, 'Artist', 'Album');
  const outside = path.join(tempDir, 'outside');
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(outside);
  const wavPath = path.join(nested, 'Track.WAV');
  const invalidAudioPath = path.join(root, 'Broken demo.mp3');
  fs.writeFileSync(wavPath, makeOneSecondWav());
  fs.writeFileSync(invalidAudioPath, 'not audio');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'not audio');
  fs.writeFileSync(path.join(outside, 'outside.flac'), 'not audio');

  let symlinkCreated = false;
  try {
    fs.symlinkSync(outside, path.join(root, 'linked-folder'), 'dir');
    symlinkCreated = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) throw error;
  }

  try {
    const result = await scanLibraryFiles(root);
    assert.equal(result.complete, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.tracks.length, 2);
    assert.deepEqual(result.tracks.map(track => track.title).sort(), ['Broken demo', 'Track']);
    assert.equal(result.tracks.find(track => track.filepath === wavPath).duration, 1);
    assert.ok(result.tracks.find(track => track.filepath === invalidAudioPath));
    assert.ok(result.tracks.every(track => isPathWithin(root, track.filepath)));
    if (symlinkCreated) {
      assert.equal(result.tracks.some(track => track.filepath.includes('outside.flac')), false);
    }
    assert.equal(isPathWithin(root, path.join(root, '..', 'outside', 'outside.flac')), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('reports an unreadable or missing library directory as incomplete', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'current-library-missing-'));
  try {
    const result = await scanLibraryFiles(path.join(tempDir, 'missing'));
    assert.equal(result.complete, false);
    assert.equal(result.tracks.length, 0);
    assert.equal(result.errors.length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
