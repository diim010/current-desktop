const fs = require('node:fs/promises');
const path = require('node:path');
const { isSupportedAudioFile } = require('./audio-formats');

const SAFE_ARTWORK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ARTWORK_BYTES = 512 * 1024;
const METADATA_CONCURRENCY = 4;
const MAX_METADATA_CACHE = 5000;
const metadataCache = new Map();
const artworkCache = new Map();
let parseFilePromise;

async function parseAudioFile(filepath, options) {
  if (!parseFilePromise) {
    parseFilePromise = import('music-metadata').then(module => module.parseFile);
  }
  const parseFile = await parseFilePromise;
  return parseFile(filepath, options);
}

function isPathWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function localTrackFromMetadata(filepath, stat, metadata) {
  const common = metadata?.common || {};
  const duration = Number(metadata?.format?.duration);

  return {
    source: 'local',
    title: String(common.title || path.basename(filepath, path.extname(filepath))),
    artist: String(common.artist || common.albumartist || ''),
    album: String(common.album || ''),
    uploader: null,
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    filepath,
    thumbnail: null,
    url: null,
    tags: '',
    color: 'none',
    managed_file: 0,
    added_at: Math.trunc(stat.mtimeMs || Date.now()),
  };
}

async function readMetadata(filepath, stat) {
  const key = path.resolve(filepath);
  const signature = `${stat.size}:${stat.mtimeMs}`;
  const cached = metadataCache.get(key);
  if (cached?.signature === signature) {
    metadataCache.delete(key);
    metadataCache.set(key, cached);
    return cached;
  }

  let result;
  try {
    result = { metadata: await parseAudioFile(filepath, { skipCovers: true }), error: false };
  } catch {
    result = { metadata: null, error: true };
  }

  metadataCache.set(key, { ...result, signature });
  if (metadataCache.size > MAX_METADATA_CACHE) {
    metadataCache.delete(metadataCache.keys().next().value);
  }
  return result;
}

async function scanLibraryFiles(libraryRoot) {
  const root = path.resolve(libraryRoot);
  const files = [];
  const errors = [];
  let metadataErrors = 0;

  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      errors.push({ directory, error });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const filepath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filepath);
      } else if (entry.isFile() && isSupportedAudioFile(filepath)) {
        try {
          files.push({ filepath, stat: await fs.stat(filepath) });
        } catch (error) {
          errors.push({ directory: filepath, error });
        }
      }
    }
  }

  await visit(root);

  const tracks = new Array(files.length);
  let nextIndex = 0;
  async function parseWorker() {
    while (nextIndex < files.length) {
      const index = nextIndex++;
      const { filepath, stat } = files[index];
      const { metadata, error } = await readMetadata(filepath, stat);
      if (error) metadataErrors++;
      tracks[index] = localTrackFromMetadata(filepath, stat, metadata);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(METADATA_CONCURRENCY, files.length) }, parseWorker)
  );

  return {
    root,
    tracks,
    errors,
    metadataErrors,
    complete: errors.length === 0,
  };
}

async function readTrackArtwork(filepath) {
  const stat = await fs.stat(filepath);
  const key = path.resolve(filepath);
  const signature = `${stat.size}:${stat.mtimeMs}`;
  const cached = artworkCache.get(key);
  if (cached?.signature === signature) {
    artworkCache.delete(key);
    artworkCache.set(key, cached);
    return cached.thumbnail;
  }

  const metadata = await parseAudioFile(filepath);
  const picture = (metadata.common.picture || []).find(image =>
    SAFE_ARTWORK_TYPES.has(String(image.format || '').toLowerCase()) &&
    image.data?.length > 0 &&
    image.data.length <= MAX_ARTWORK_BYTES
  );
  const thumbnail = picture
    ? `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
    : null;
  artworkCache.set(key, { signature, thumbnail });
  if (artworkCache.size > 200) artworkCache.delete(artworkCache.keys().next().value);
  return thumbnail;
}

module.exports = {
  isPathWithin,
  readTrackArtwork,
  scanLibraryFiles,
};
