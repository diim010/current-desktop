const path = require('node:path');

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.ogg',
  '.wav',
  '.m4a',
  '.aac',
  '.opus',
  '.wma',
]);

function isSupportedAudioFile(filepath) {
  return AUDIO_EXTENSIONS.has(path.extname(filepath).toLowerCase());
}

module.exports = {
  AUDIO_EXTENSIONS,
  isSupportedAudioFile,
};
