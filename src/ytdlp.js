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
const FFMPEG_PATH = resolveBin('ffmpeg');
const FFMPEG_DIR = fs.existsSync(FFMPEG_PATH) ? path.dirname(FFMPEG_PATH) : null;

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
      '--no-playlist', '--no-warnings', '--newline',
      '-o', path.join(outDir, '%(title)s.%(ext)s'),
      '--print', 'after_move:%(filepath)s',
      url,
    ];
    if (FFMPEG_DIR) {
      args.push('--ffmpeg-location', FFMPEG_DIR);
    }

    const proc = spawn(ytdlpPath, args);
    let finalPath = '';
    let stderrBuf = '';
    let stdoutBuf = '';
    let stderrLineBuf = '';
    let lastProgress = null;

    function handleProgress(line) {
      const progressMatch = line.match(/\[download\]\s+([\d.]+)%/);
      if (progressMatch) {
        lastProgress = parseFloat(progressMatch[1]);
        onProgress(lastProgress);
      }
    }

    function consumeLines(buffer, chunk, onLine) {
      const lines = (buffer + chunk).split(/\r\n|\n|\r/);
      const remainder = lines.pop();
      lines.forEach(onLine);
      return remainder;
    }

    proc.stdout.on('data', (d) => {
      stdoutBuf = consumeLines(stdoutBuf, d.toString(), (line) => {
        handleProgress(line);
        // --print after_move:%(filepath)s prints the final path on its own line
        if (line.trim().toLowerCase().endsWith('.mp3')) {
          finalPath = line.trim();
        }
      });
    });

    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderrBuf += chunk;
      stderrLineBuf = consumeLines(stderrLineBuf, chunk, handleProgress);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (stdoutBuf) {
        handleProgress(stdoutBuf);
        if (stdoutBuf.trim().toLowerCase().endsWith('.mp3')) {
          finalPath = stdoutBuf.trim();
        }
      }
      if (stderrLineBuf) handleProgress(stderrLineBuf);
      if (code !== 0) {
        return reject(new Error(stderrBuf.trim() || `yt-dlp exited with ${code}`));
      }
      if (!finalPath) {
        return reject(new Error('Download finished but no output file was reported.'));
      }
      if (lastProgress !== 100) onProgress(100);
      resolve(finalPath);
    });
  });
}

function searchYoutube(query, ytdlpPath = YTDLP_PATH) {
  const searchTerm = query.trim();
  if (!searchTerm) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlpPath, [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      `ytsearch5:${searchTerm}`,
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
              url: item.webpage_url ||
                item.original_url ||
                (typeof item.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url : null) ||
                (item.id ? `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}` : null),
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
