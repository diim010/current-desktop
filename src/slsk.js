/**
 * Soulseek (slsk) integration module.
 *
 * Uses the `slsk-client` npm package to connect to the Soulseek network
 * for searching and downloading music files.
 *
 * Requires a Soulseek account (username + password) stored in config.
 */
const path = require('path');
const fs = require('fs');

let slsk = null;
let client = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected | error

/**
 * Lazy-load slsk-client to avoid crashing if it's not installed.
 */
function loadSlskModule() {
  if (!slsk) {
    try {
      slsk = require('slsk-client');
    } catch (e) {
      throw new Error('slsk-client is not installed. Run: npm install slsk-client');
    }
  }
  return slsk;
}

/**
 * Connect to Soulseek network.
 * @param {string} username - Soulseek username
 * @param {string} password - Soulseek password
 * @returns {Promise<void>}
 */
function connect(username, password) {
  return new Promise((resolve, reject) => {
    if (client) {
      connectionStatus = 'connected';
      return resolve();
    }

    if (!username || !password) {
      connectionStatus = 'error';
      return reject(new Error('Soulseek username and password are required. Set them in Settings.'));
    }

    connectionStatus = 'connecting';
    const slskModule = loadSlskModule();

    slskModule.connect({
      user: username,
      pass: password,
    }, (err, c) => {
      if (err) {
        connectionStatus = 'error';
        client = null;
        return reject(new Error(`Soulseek connection failed: ${err.message || err}`));
      }
      client = c;
      connectionStatus = 'connected';
      console.log('[SLSK] Connected as', username);
      resolve();
    });
  });
}

/**
 * Disconnect from Soulseek.
 */
function disconnect() {
  if (client) {
    try {
      client.destroy();
    } catch (e) {
      // ignore
    }
    client = null;
  }
  connectionStatus = 'disconnected';
  console.log('[SLSK] Disconnected');
}

/**
 * Get current connection status.
 */
function getStatus() {
  return connectionStatus;
}

/**
 * Search for tracks on the Soulseek network.
 * @param {string} query - Search query
 * @param {object} opts - Optional: { timeout: 5000 }
 * @returns {Promise<Array>} - Array of results
 */
function search(query, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!client) {
      return reject(new Error('Not connected to Soulseek. Connect first in Settings.'));
    }

    const timeout = opts.timeout || 5000;

    client.search({
      req: query,
      timeout,
    }, (err, results) => {
      if (err) return reject(new Error(`Soulseek search failed: ${err.message || err}`));

      // Flatten + filter: only keep audio files (mp3, flac, ogg, wav, m4a, aac)
      const audioExtensions = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.opus', '.wma']);
      const flatResults = [];

      for (const result of (results || [])) {
        const user = result.user || 'unknown';
        const speed = result.speed || 0;
        const queueLength = result.slotsfree != null ? (result.slotsfree > 0 ? 0 : 1) : null;

        for (const file of (result.files || [])) {
          const ext = path.extname(file.file || '').toLowerCase();
          if (!audioExtensions.has(ext)) continue;

          const filename = path.basename(file.file || '');
          const dir = path.dirname(file.file || '');

          // Try to extract artist – title from filename
          const nameWithoutExt = path.basename(filename, ext);
          let title = nameWithoutExt;
          let artist = null;

          // Common patterns: "Artist - Title", "01 - Title", "01. Title"
          const dashMatch = nameWithoutExt.match(/^(.+?)\s*[-–—]\s*(.+)$/);
          if (dashMatch) {
            // Check if first part looks like a track number
            if (/^\d{1,3}\.?\s*$/.test(dashMatch[1].trim())) {
              title = dashMatch[2].trim();
            } else {
              artist = dashMatch[1].trim();
              title = dashMatch[2].trim();
            }
          }

          flatResults.push({
            id: `slsk:${user}:${file.file}`,
            title,
            artist,
            filename,
            filepath: file.file,
            size: file.size || 0,
            bitrate: file.attrs ? (file.attrs.bitrate || null) : null,
            duration: file.attrs ? (file.attrs.duration || null) : null,
            user,
            speed,
            queueLength,
            source: 'soulseek',
          });
        }
      }

      // Sort by speed (faster uploaders first), then by bitrate
      flatResults.sort((a, b) => {
        // Prefer free slots
        if (a.queueLength !== b.queueLength) return (a.queueLength || 0) - (b.queueLength || 0);
        // Prefer higher speed
        if (a.speed !== b.speed) return (b.speed || 0) - (a.speed || 0);
        // Prefer higher bitrate
        return (b.bitrate || 0) - (a.bitrate || 0);
      });

      // Limit to top 20 results
      resolve(flatResults.slice(0, 20));
    });
  });
}

/**
 * Download a file from Soulseek.
 * @param {string} username - The peer's username
 * @param {string} filepath - The remote file path
 * @param {string} outDir - Local output directory
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} - Absolute path to downloaded file
 */
function download(username, filepath, outDir, onProgress) {
  return new Promise((resolve, reject) => {
    if (!client) {
      return reject(new Error('Not connected to Soulseek.'));
    }

    const filename = path.basename(filepath);
    const localPath = path.join(outDir, filename);

    // Ensure output directory exists
    fs.mkdirSync(outDir, { recursive: true });

    client.download({
      file: {
        user: username,
        file: filepath,
      },
      path: localPath,
    }, (err, data) => {
      if (err) return reject(new Error(`Download failed: ${err.message || err}`));

      // The slsk-client returns a Buffer or writes to the path
      if (data && Buffer.isBuffer(data)) {
        fs.writeFileSync(localPath, data);
      }

      if (onProgress) onProgress(100);
      console.log('[SLSK] Downloaded:', localPath);
      resolve(localPath);
    });
  });
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  search,
  download,
};
