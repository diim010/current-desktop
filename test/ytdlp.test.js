const assert = require('node:assert/strict');
const { chmodSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { detectSource, downloadAudio, searchYoutube } = require('../src/ytdlp');

test('detectSource recognizes supported YouTube and SoundCloud URLs', () => {
  assert.equal(detectSource('https://www.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(detectSource('https://music.youtube.com/watch?v=abc'), 'youtube-music');
  assert.equal(detectSource('https://youtu.be/abc'), 'youtube');
  assert.equal(detectSource('https://soundcloud.com/artist/track'), 'soundcloud');
  assert.equal(detectSource('https://snd.sc/abc'), 'soundcloud');
  assert.equal(detectSource('https://example.com/track'), null);
});

test('downloadAudio reads progress from stderr and the output path from stdout', async (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'current-ytdlp-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const fakeYtDlp = path.join(tempDir, 'fake-yt-dlp');
  const script = [
    `#!${process.execPath}`,
    "const args = process.argv.slice(2);",
    "const template = args[args.indexOf('-o') + 1];",
    "const outputPath = template.replace('%(title)s.%(ext)s', 'fake.mp3');",
    "process.stderr.write('[download] 37.');",
    "setTimeout(() => {",
    "  process.stderr.write('5% of 10MiB at 1MiB/s\\n');",
    "  process.stdout.write(outputPath + '\\n');",
    '}, 5);',
    '',
  ].join('\n');
  writeFileSync(fakeYtDlp, script);
  chmodSync(fakeYtDlp, 0o755);

  const outputDir = path.join(tempDir, 'library');
  const progress = [];
  const outputPath = await downloadAudio(
    'https://soundcloud.com/artist/track',
    outputDir,
    (percent) => progress.push(percent),
    fakeYtDlp,
  );

  assert.equal(outputPath, path.join(outputDir, 'fake.mp3'));
  assert.deepEqual(progress, [37.5, 100]);
});

test('searchYoutube returns canonical YouTube URLs from flat search results', async (t) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'current-ytdlp-search-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const fakeYtDlp = path.join(tempDir, 'fake-yt-dlp');
  const results = [
    { id: 'abc123', title: 'Result', url: 'abc123', webpage_url: 'https://www.youtube.com/watch?v=abc123' },
    { id: 'def456', title: 'Second', url: 'def456' },
  ];
  const script = [
    `#!${process.execPath}`,
    "const args = process.argv.slice(2);",
    "if (args.at(-1) !== 'ytsearch5:lofi beats' || !args.includes('--flat-playlist')) process.exit(2);",
    `process.stdout.write(${JSON.stringify(results.map((item) => JSON.stringify(item)).join('\n') + '\n')});`,
    '',
  ].join('\n');
  writeFileSync(fakeYtDlp, script);
  chmodSync(fakeYtDlp, 0o755);

  assert.deepEqual(await searchYoutube('  lofi beats  ', fakeYtDlp), [
    {
      id: 'abc123',
      title: 'Result',
      url: 'https://www.youtube.com/watch?v=abc123',
      uploader: undefined,
      duration: undefined,
      thumbnail: null,
    },
    {
      id: 'def456',
      title: 'Second',
      url: 'https://www.youtube.com/watch?v=def456',
      uploader: undefined,
      duration: undefined,
      thumbnail: null,
    },
  ]);
});

test('searchYoutube does not invoke yt-dlp for a blank query', async () => {
  assert.deepEqual(await searchYoutube('   ', '/does/not/exist'), []);
});
