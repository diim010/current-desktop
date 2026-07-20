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

function searchYoutube(query, ytdlpPath = YTDLP_PATH) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlpPath, [
      `ytsearch5:${query}`,
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(err.trim() || `yt-dlp search exited with code ${code}`));
      }
      try {
        const results = [];
        const lines = out.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            results.push({
              id: item.id,
              title: item.title,
              url: item.url || item.webpage_url,
              uploader: item.uploader || item.channel,
              duration: item.duration,
              thumbnail: item.thumbnail ||
                (item.thumbnails && item.thumbnails.length
                  ? item.thumbnails[item.thumbnails.length - 1].url
                  : null),
            });
          } catch (e) {
            // ignore malformed line
          }
        }
        resolve(results);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Get a direct audio stream URL for preview playback (no download).
 * Uses yt-dlp to extract the best audio URL that can be played directly.
 */
function getPreviewUrl(url, ytdlpPath = YTDLP_PATH) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlpPath, [
      '-f', 'bestaudio',
      '--get-url',
      '--no-playlist',
      '--no-warnings',
      url,
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `yt-dlp exited with ${code}`));
      const streamUrl = out.trim().split('\n').filter(Boolean)[0];
      if (!streamUrl) return reject(new Error('Could not extract audio stream URL.'));
      resolve(streamUrl);
    });
  });
}

module.exports = { detectSource, fetchInfo, downloadAudio, searchYoutube, getPreviewUrl };
