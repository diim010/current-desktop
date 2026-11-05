const SOURCE_LABELS = {
  'youtube': 'YouTube',
  'youtube-music': 'YouTube Music',
  'soundcloud': 'SoundCloud',
  'soulseek': 'Soulseek',
  'local': 'Local file',
};

const form        = document.getElementById('universal-form');
const input       = document.getElementById('universal-input');
const pullBtn     = document.getElementById('pull-btn');
const queueEl     = document.getElementById('queue');
const errorBanner = document.getElementById('error-banner');
const fileListEl  = document.getElementById('file-list');
const librarySummaryEl = document.getElementById('library-summary');
const sourceFilterEl = document.getElementById('source-filter');
const colorFilterEl = document.getElementById('color-filter');
const tagFilterEl = document.getElementById('tag-filter');
const tagEmptyEl = document.getElementById('tag-empty');
const artistListEl = document.getElementById('artist-list');
const artistCountEl = document.getElementById('artist-count');
const catalogContextEl = document.getElementById('catalog-context');
const sortSelect = document.getElementById('sort-select');
const libraryResetBtn = document.getElementById('library-reset-btn');
const predictionsDropdown = document.getElementById('predictions-dropdown');
const libraryPathEl = document.getElementById('library-path');
const player      = document.getElementById('player');
const npTitle     = document.getElementById('np-title');
const npMeta      = document.getElementById('np-meta');
const playerCover = document.getElementById('player-cover');
const playerCoverPlaceholder = document.getElementById('player-cover-placeholder');
const playerFootnote = document.getElementById('player-footnote');
const npTime = document.getElementById('np-time');
const npProgress = document.getElementById('np-progress');
const npProgressFill = document.getElementById('np-progress-fill');
const mobileNowPlaying = document.getElementById('mobile-now-playing');
const mobileCover = document.getElementById('mobile-cover');
const mobileTitle = document.getElementById('mobile-title');
const mobileArtist = document.getElementById('mobile-artist');
const mobilePlayToggle = document.getElementById('mobile-play-toggle');
const mobileProgressFill = document.getElementById('mobile-progress-fill');
const workspaceTabs = document.getElementById('workspace-tabs');

// Preview Modal elements
const previewModal     = document.getElementById('preview-modal');
const previewThumb     = document.getElementById('preview-thumb');
const previewTitle     = document.getElementById('preview-title');
const previewArtist    = document.getElementById('preview-artist');
const previewSource    = document.getElementById('preview-source');
const previewDuration  = document.getElementById('preview-duration');
const previewLoading   = document.getElementById('preview-loading');
const previewWaveform  = document.getElementById('preview-waveform');
const previewWaveformFill = document.getElementById('preview-waveform-fill');
const previewCurrentTime = document.getElementById('preview-current-time');
const previewTotalTime = document.getElementById('preview-total-time');
const previewPlayBtn   = document.getElementById('preview-play-btn');
const previewAudio     = document.getElementById('preview-audio');
const previewCloseBtn  = document.getElementById('preview-close-btn');
const previewPullBtn   = document.getElementById('preview-pull-btn');

let currentPreviewItem = null; // track the item being previewed

// Edit Modal elements
const editModal        = document.getElementById('edit-modal');
const modalTagsInput   = document.getElementById('modal-tags-input');
const modalColorPicker = document.getElementById('modal-color-picker');
const modalCancelBtn   = document.getElementById('modal-cancel-btn');
const modalSaveBtn     = document.getElementById('modal-save-btn');

// Cache for recent search queries
const searchCache = new Map();
let searchAbortController = null;
let activeQuery = '';
const jobsById = new Map();
let currentEditingTrackId = null;
let selectedColor = 'none';
const selectedPredictions = new Map(); // url -> item
const libraryState = {
  source: 'all',
  color: 'all',
  tag: 'all',
  artist: 'all',
  sort: 'recent',
  tracks: [],
};
let currentTrack = null;
let activePane = 'taxonomy';
let dialogReturnFocus = null;
const localArtworkObserver = new IntersectionObserver((entries, observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    const image = entry.target;
    const track = libraryState.tracks.find(item => item.id === Number(image.dataset.trackId));
    if (!track) continue;
    window.current.getTrackArtwork(track.filepath).then(thumbnail => {
      if (thumbnail && image.isConnected) {
        image.src = thumbnail;
        image.hidden = false;
      }
    }).catch(err => showError(`Could not read album artwork: ${err.message}`));
  }
}, { root: document.getElementById('file-list') });
const SOURCE_FILTERS = [
  ['all', 'All'],
  ['youtube', 'YouTube'],
  ['youtube-music', 'Music'],
  ['soundcloud', 'SoundCloud'],
  ['soulseek', 'Soulseek'],
  ['local', 'Local files'],
];
const COLOR_FILTERS = ['all', 'none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];

/* ---------------- helpers ---------------- */

function fmtBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtClock(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(safeSeconds / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setCoverImage(element, thumbnail) {
  element.style.backgroundImage = thumbnail ? `url(${JSON.stringify(thumbnail)})` : '';
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
  setTimeout(() => errorBanner.classList.remove('show'), 4000);
}

function showDialog(modal, initialFocus) {
  dialogReturnFocus = document.activeElement;
  modal.inert = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('show');
  (initialFocus || modal.querySelector('[role="dialog"]')).focus();
}

function hideDialog(modal) {
  modal.classList.remove('show');
  modal.inert = true;
  modal.setAttribute('aria-hidden', 'true');
  if (dialogReturnFocus && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus = null;
}

document.addEventListener('keydown', (event) => {
  const modal = document.querySelector('.modal-overlay.show');
  if (!modal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    if (modal === editModal) closeEditModal();
    else closePreviewModal();
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = [...modal.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), audio[controls], [tabindex]:not([tabindex="-1"])'
  )].filter(element => element.getClientRects().length > 0);
  if (!focusable.length) {
    event.preventDefault();
    modal.querySelector('[role="dialog"]').focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

/* ---------------- library path ---------------- */

window.current.getLibraryPath().then(p => {
  libraryPathEl.textContent = p;
});
window.current.onLibraryPathChanged(p => {
  libraryPathEl.textContent = p;
  loadLibrary();
});

window.current.onLibraryScanWarning(warning => {
  const messages = [];
  if (warning.directoryErrors) messages.push(`Could not read ${warning.directoryErrors} folder(s)`);
  if (warning.metadataErrors) messages.push(`${warning.metadataErrors} track(s) are shown by filename because their tags could not be read`);
  if (warning.artworkErrors) messages.push('Some album artwork could not be read');
  if (messages.length) showError(`${messages.join('. ')}.`);
});

libraryPathEl.addEventListener('click', () => {
  window.current.chooseLibraryFolder();
});

/* ---------------- pull-all bar ---------------- */
const predictionLoader = document.getElementById('prediction-loader');
const pullAllBar   = document.getElementById('pull-all-bar');
const pullAllLabel = document.getElementById('pull-all-label');
const pullAllBtn   = document.getElementById('pull-all-btn');

function clearPredictionResults() {
  predictionsDropdown.querySelectorAll('.prediction-row, .prediction-message').forEach(el => el.remove());
}

function closePredictions() {
  predictionsDropdown.classList.remove('show');
  if (predictionLoader) predictionLoader.classList.add('hidden');
  clearPredictionResults();
  selectedPredictions.clear();
  updatePullAllBar();
}

function showPredictionMessage(message) {
  clearPredictionResults();
  if (predictionLoader) predictionLoader.classList.add('hidden');

  const messageEl = document.createElement('div');
  messageEl.className = 'prediction-loading prediction-message';
  messageEl.textContent = message;
  pullAllBar.before(messageEl);
}

function updatePullAllBar() {
  const n = selectedPredictions.size;
  if (n > 0) {
    pullAllBar.classList.add('show');
    pullAllLabel.textContent = `${n} selected`;
    pullAllBtn.textContent = n === 1 ? 'Pull 1' : `Pull ${n}`;
  } else {
    pullAllBar.classList.remove('show');
  }
}

pullAllBtn.addEventListener('click', async () => {
  if (!selectedPredictions.size) return;
  pullAllBtn.disabled = true;
  const items = [...selectedPredictions.values()];
  selectedPredictions.clear();
  updatePullAllBar();
  predictionsDropdown.classList.remove('show');
  clearPredictionResults();
  input.value = '';
  activeQuery = '';

  for (const item of items) {
    try {
      const { id, source } = await window.current.queueDownload(item.url);
      jobsById.set(id, { id, source, status: 'fetching', progress: 0, title: item.title });
      renderQueue();
    } catch (err) {
      showError(err.message);
    }
  }
  pullAllBtn.disabled = false;
});

/* ---------------- composer / queue ---------------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = input.value.trim();
  if (!val) return;

  const urlRegex = /(https?:\/\/[^\s,]+)/g;
  const urls = val.match(urlRegex) || [];

  if (urls.length > 0) {
    const restoreInputFocus = document.activeElement === pullBtn;
    pullBtn.disabled = true;
    Promise.all(urls.map(url => 
      window.current.queueDownload(url)
        .then(({ id, source }) => {
          jobsById.set(id, { id, source, status: 'fetching', progress: 0, title: null });
        })
        .catch(err => showError(err.message))
    )).finally(() => {
      input.value = '';
      pullBtn.disabled = false;
      pullBtn.classList.remove('visible');
      pullBtn.tabIndex = -1;
      if (restoreInputFocus && document.activeElement === document.body) input.focus();
      activeQuery = '';
      loadLibrary();
      renderQueue();
    });
  }
});

window.current.onJobUpdate((job) => {
  jobsById.set(job.id, { ...jobsById.get(job.id), ...job });
  renderQueue();

  if (job.status === 'done' || job.status === 'duplicate') {
    if (job.status === 'done') loadLibrary();
    setTimeout(() => { jobsById.delete(job.id); renderQueue(); }, 4000);
  }
});

function jobCardHTML(job) {
  const title = job.title || (job.status === 'fetching' ? 'Looking up track…' : 'Downloading…');
  const pct = Math.max(0, Math.min(100, job.progress || 0));
  let stateClass = '';
  let meta = SOURCE_LABELS[job.source] || job.source || '';

  if (job.status === 'done') { stateClass = 'done'; meta += ' · saved'; }
  else if (job.status === 'duplicate') { stateClass = 'duplicate'; meta = 'Already in your library'; }
  else if (job.status === 'error') { stateClass = 'error'; meta += ' · failed'; }
  else if (job.status === 'fetching') { meta += ' · looking up…'; }
  else { meta += ` · ${pct.toFixed(0)}%`; }

  return `
    <div class="job-card ${stateClass}" data-job-id="${job.id}">
      <div class="job-row">
        <div class="job-title">${escapeHtml(title)}</div>
        ${job.status === 'error' ? `<button class="dismiss-job-btn" title="Dismiss error">✕</button>` : ''}
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="job-row">
        <div class="job-meta">${meta}</div>
        ${job.status === 'error' ? `<div class="job-error">${escapeHtml(job.message || 'Something went wrong')}</div>` : ''}
      </div>
    </div>
  `;
}

function renderQueue() {
  const jobs = [...jobsById.values()];
  queueEl.innerHTML = jobs.map(jobCardHTML).join('');

  queueEl.querySelectorAll('.dismiss-job-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.job-card');
      const jobId = card.dataset.jobId;
      jobsById.delete(jobId);
      renderQueue();
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function trackTags(track) {
  return (track.tags || '').split(',').map(t => t.trim()).filter(Boolean);
}

function countBy(tracks, getter) {
  const counts = new Map();
  for (const track of tracks) {
    const value = getter(track);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function tagCounts(tracks) {
  const counts = new Map();
  for (const track of tracks) {
    for (const tag of trackTags(track)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
}

function isFilteringLibrary() {
  return Boolean(activeQuery) ||
    libraryState.source !== 'all' ||
    libraryState.color !== 'all' ||
    libraryState.tag !== 'all' ||
    libraryState.artist !== 'all' ||
    libraryState.sort !== 'recent';
}

function resetLibraryFilters() {
  libraryState.source = 'all';
  libraryState.color = 'all';
  libraryState.tag = 'all';
  libraryState.artist = 'all';
  libraryState.sort = 'recent';
  activeQuery = '';
  input.value = '';
  sortSelect.value = libraryState.sort;
  closePredictions();
  loadLibrary();
}

function renderFilterButton({ group, value, label, count, active, disabled = false, extraClass = '', title = '' }) {
  const countHtml = Number.isFinite(count) ? `<span class="filter-count">${count}</span>` : '';
  return `
    <button
      type="button"
      class="filter-chip ${extraClass} ${active ? 'active' : ''}"
      data-filter-group="${escapeHtml(group)}"
      data-filter-value="${escapeHtml(value)}"
      aria-pressed="${active}"
      ${disabled ? 'disabled' : ''}
      ${title ? `title="${escapeHtml(title)}"` : ''}
    >
      ${label}${countHtml}
    </button>
  `;
}

function renderLibraryNav(baseTracks, visibleTracks) {
  const sourceCounts = countBy(baseTracks, track => track.source || 'unknown');
  const colorCounts = countBy(baseTracks, track => track.color || 'none');
  const allCount = baseTracks.length;
  const filteredCount = visibleTracks.length;
  const hasFilters = isFilteringLibrary();

  librarySummaryEl.textContent = hasFilters
    ? `${filteredCount} of ${allCount} tracks`
    : `${allCount} ${allCount === 1 ? 'track' : 'tracks'}`;
  libraryResetBtn.classList.toggle('visible', hasFilters);
  sortSelect.value = libraryState.sort;

  sourceFilterEl.innerHTML = SOURCE_FILTERS.map(([value, label]) => {
    const count = value === 'all' ? allCount : (sourceCounts.get(value) || 0);
    return renderFilterButton({
      group: 'source',
      value,
      label: escapeHtml(label),
      count,
      active: libraryState.source === value,
      disabled: value !== 'all' && count === 0 && libraryState.source !== value,
    });
  }).join('');

  colorFilterEl.innerHTML = COLOR_FILTERS.map(color => {
    const count = color === 'all' ? allCount : (colorCounts.get(color) || 0);
    const label = color === 'all'
      ? 'All'
      : color === 'none'
        ? 'None'
        : `<span class="color-swatch color-${escapeHtml(color)}"></span><span class="sr-only">${escapeHtml(color)}</span>`;
    return renderFilterButton({
      group: 'color',
      value: color,
      label,
      count,
      active: libraryState.color === color,
      disabled: color !== 'all' && count === 0 && libraryState.color !== color,
      extraClass: color === 'all' || color === 'none' ? '' : 'color-filter-chip',
      title: color === 'all' ? '' : color,
    });
  }).join('');

  const tags = [...tagCounts(baseTracks).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  if (libraryState.tag !== 'all' && !tags.some(([tag]) => tag === libraryState.tag)) {
    tags.push([libraryState.tag, 0]);
  }

  tagFilterEl.classList.toggle('hidden', tags.length === 0);
  tagEmptyEl.classList.toggle('hidden', tags.length > 0);
  tagFilterEl.innerHTML = tags.map(([tag, count]) => renderFilterButton({
    group: 'tag',
    value: tag,
    label: `#${escapeHtml(tag)}`,
    count,
    active: libraryState.tag === tag,
    extraClass: 'tag-filter-chip',
  })).join('');
}

function getFilteredTracks() {
  const filtered = libraryState.tracks.filter(track => {
    if (libraryState.source !== 'all' && track.source !== libraryState.source) return false;
    if (libraryState.color !== 'all' && (track.color || 'none') !== libraryState.color) return false;
    if (libraryState.tag !== 'all' && !trackTags(track).includes(libraryState.tag)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (libraryState.sort === 'title') {
      return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    }
    if (libraryState.sort === 'duration') {
      return (b.duration || 0) - (a.duration || 0) || (b.added_at || 0) - (a.added_at || 0);
    }
    if (libraryState.sort === 'source') {
      return String(a.source || '').localeCompare(String(b.source || '')) ||
        String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    }
    return (b.added_at || 0) - (a.added_at || 0);
  });
}

function renderLibraryView() {
  const visibleTracks = getFilteredTracks();
  const scopedTracks = libraryState.artist === 'all'
    ? visibleTracks
    : visibleTracks.filter(track => artistName(track) === libraryState.artist);
  renderLibraryNav(libraryState.tracks, scopedTracks);
  renderArtists(visibleTracks);
  renderLibrary(scopedTracks);
}

function artistName(track) {
  return track.artist || track.uploader || 'Unknown artist';
}

function trackRowHTML(track) {
  const tags = trackTags(track).slice(0, 2);
  const tagHtml = tags.map(tag => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('');
  const removeLabel = track.managed_file === 0 ? 'Remove from Current' : 'Delete';
  return `
    <article class="track-row color-${escapeHtml(track.color || 'none')}" data-id="${track.id}">
      <button type="button" class="track-main" aria-label="Play ${escapeHtml(track.title)}">
        <span class="track-title">${escapeHtml(track.title)}</span>
        <span class="track-meta">
          <span>${escapeHtml(SOURCE_LABELS[track.source] || track.source || 'Local')}</span>
          ${track.duration ? `<span>${fmtDuration(track.duration)}</span>` : ''}
          ${tagHtml}
        </span>
      </button>
      <div class="file-actions">
        <button type="button" class="tag-btn" title="Edit tags" aria-label="Edit tags for ${escapeHtml(track.title)}">#</button>
        <button type="button" class="reveal-btn" title="Reveal in Finder" aria-label="Reveal ${escapeHtml(track.title)} in Finder">↗</button>
        <button type="button" class="danger delete-btn" title="${removeLabel}" aria-label="${removeLabel} ${escapeHtml(track.title)}">×</button>
      </div>
    </article>
  `;
}

function renderArtists(tracks) {
  const counts = countBy(tracks, artistName);
  const artists = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
  artistCountEl.textContent = String(artists.length);
  artistListEl.innerHTML = [
    `<button type="button" class="artist-row ${libraryState.artist === 'all' ? 'active' : ''}" data-artist="all" aria-pressed="${libraryState.artist === 'all'}">
      <span>All artists</span><span class="artist-track-count">${tracks.length}</span>
    </button>`,
    ...artists.map(([artist, count]) => `
      <button type="button" class="artist-row ${libraryState.artist === artist ? 'active' : ''}" data-artist="${escapeHtml(artist)}" aria-pressed="${libraryState.artist === artist}">
        <span>${escapeHtml(artist)}</span><span class="artist-track-count">${count}</span>
      </button>
    `),
  ].join('');
}

function renderLibrary(tracks) {
  localArtworkObserver.disconnect();
  if (!tracks.length) {
    const message = libraryState.tracks.length
      ? 'No tracks match the current filters.'
      : 'Nothing here yet. Search for music above or paste a track link to pull it in.';
    fileListEl.innerHTML = `<div class="empty-state">${message}</div>`;
    catalogContextEl.textContent = libraryState.artist === 'all' ? 'All artists' : libraryState.artist;
    return;
  }

  const albums = new Map();
  for (const track of tracks) {
    const artist = artistName(track);
    const album = track.album || 'Unfiled recordings';
    const key = libraryState.artist === 'all' ? `${artist}\u0000${album}` : album;
    if (!albums.has(key)) albums.set(key, { artist, album, tracks: [] });
    albums.get(key).tracks.push(track);
  }

  const groups = [...albums.entries()].sort((a, b) =>
    a[1].album.localeCompare(b[1].album, undefined, { sensitivity: 'base' }) ||
    a[1].artist.localeCompare(b[1].artist, undefined, { sensitivity: 'base' })
  );
  catalogContextEl.textContent = libraryState.artist === 'all' ? `${tracks.length} recordings` : libraryState.artist;
  fileListEl.innerHTML = groups.map(([key, group]) => {
    const groupTracks = group.tracks;
    const headingMeta = libraryState.artist === 'all' ? `<span>${escapeHtml(group.artist)}</span>` : '';
    const label = group.album === 'Unfiled recordings' ? group.album : escapeHtml(group.album);
    return `
      <section class="album-group">
        <div class="album-heading">
          <img class="album-thumb" data-track-id="${groupTracks[0].id}" alt="" hidden>
          <div class="album-heading-copy">
            <h3>${label}</h3>
            ${headingMeta}
            <span class="album-track-count">${groupTracks.length} ${groupTracks.length === 1 ? 'track' : 'tracks'}</span>
          </div>
        </div>
        <div class="album-tracks">${groupTracks.map(trackRowHTML).join('')}</div>
      </section>
    `;
  }).join('');

  fileListEl.querySelectorAll('.album-thumb').forEach(image => {
    const track = tracks.find(item => item.id === Number(image.dataset.trackId));
    if (track && track.thumbnail) {
      image.src = track.thumbnail;
      image.hidden = false;
    } else if (track?.source === 'local') {
      localArtworkObserver.observe(image);
    }
  });

  fileListEl.querySelectorAll('.track-row').forEach(row => {
    const id = Number(row.dataset.id);
    const track = tracks.find(item => item.id === id);
    if (currentTrack && currentTrack.id === id) row.classList.add('playing');

    row.querySelector('.track-main').addEventListener('click', () => {
      playTrack(track);
    });

    row.querySelector('.reveal-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.current.revealInFinder(track.filepath);
    });

    row.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.current.deleteTrack(id).then(loadLibrary);
    });

    row.querySelector('.tag-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(track);
    });
  });
}

function playTrack(track) {
  if (!track) return;
  currentTrack = track;
  player.src = `file://${track.filepath}`;
  npTitle.textContent = track.title || 'Untitled recording';
  npMeta.textContent = [artistName(track), track.album, SOURCE_LABELS[track.source] || track.source]
    .filter(Boolean).join(' · ');
  playerFootnote.textContent = track.filepath;
  playerCover.hidden = !track.thumbnail;
  playerCoverPlaceholder.hidden = Boolean(track.thumbnail);
  setCoverImage(playerCover, track.thumbnail);
  mobileNowPlaying.hidden = false;
  mobileTitle.textContent = track.title || 'Untitled recording';
  mobileArtist.textContent = artistName(track);
  mobileCover.hidden = !track.thumbnail;
  setCoverImage(mobileCover, track.thumbnail);
  if (!track.thumbnail && track.source === 'local') {
    window.current.getTrackArtwork(track.filepath).then(thumbnail => {
      if (currentTrack?.id !== track.id || !thumbnail) return;
      playerCover.hidden = false;
      playerCoverPlaceholder.hidden = true;
      setCoverImage(playerCover, thumbnail);
      mobileCover.hidden = false;
      setCoverImage(mobileCover, thumbnail);
    }).catch(err => showError(`Could not read album artwork: ${err.message}`));
  }
  renderLibraryView();
  player.play().catch(err => showError(`Could not play this track: ${err.message}`));
}

function loadLibrary() {
  const opts = activeQuery ? { query: activeQuery } : {};
  window.current.getTracks(opts).then(tracks => {
    libraryState.tracks = tracks;
    renderLibraryView();
  }).catch(err => showError(`Could not load library: ${err.message}`));
}

sourceFilterEl.addEventListener('click', (e) => {
  const button = e.target.closest('[data-filter-group]');
  if (!button || button.disabled) return;
  libraryState[button.dataset.filterGroup] = button.dataset.filterValue;
  renderLibraryView();
});

artistListEl.addEventListener('click', (e) => {
  const button = e.target.closest('[data-artist]');
  if (!button) return;
  libraryState.artist = button.dataset.artist;
  renderLibraryView();
});

colorFilterEl.addEventListener('click', (e) => {
  const button = e.target.closest('[data-filter-group]');
  if (!button || button.disabled) return;
  libraryState[button.dataset.filterGroup] = button.dataset.filterValue;
  renderLibraryView();
});

tagFilterEl.addEventListener('click', (e) => {
  const button = e.target.closest('[data-filter-group]');
  if (!button || button.disabled) return;
  libraryState.tag = libraryState.tag === button.dataset.filterValue ? 'all' : button.dataset.filterValue;
  renderLibraryView();
});

sortSelect.addEventListener('change', () => {
  libraryState.sort = sortSelect.value;
  renderLibraryView();
});

libraryResetBtn.addEventListener('click', resetLibraryFilters);

workspaceTabs.addEventListener('click', (e) => {
  const button = e.target.closest('[data-pane]');
  if (!button) return;
  activatePane(button);
});

function activatePane(button) {
  activePane = button.dataset.pane;
  workspaceTabs.querySelectorAll('.workspace-tab').forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-pane-content]').forEach(pane => {
    pane.classList.toggle('mobile-active', pane.dataset.paneContent === activePane);
  });
}

workspaceTabs.addEventListener('keydown', (event) => {
  const tabs = [...workspaceTabs.querySelectorAll('[role="tab"]')];
  const currentIndex = tabs.indexOf(document.activeElement);
  if (currentIndex < 0) return;

  let nextIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[nextIndex].focus();
  activatePane(tabs[nextIndex]);
});

mobileNowPlaying.addEventListener('click', (e) => {
  if (e.target.closest('#mobile-play-toggle')) return;
  const playerTab = workspaceTabs.querySelector('[data-pane="player"]');
  activatePane(playerTab);
});

mobilePlayToggle.addEventListener('click', () => {
  if (player.paused) {
    player.play().catch(err => showError(`Could not play this track: ${err.message}`));
  } else {
    player.pause();
  }
});

player.addEventListener('timeupdate', updatePlayerProgress);
player.addEventListener('durationchange', updatePlayerProgress);
player.addEventListener('play', () => mobilePlayToggle.textContent = 'Pause');
player.addEventListener('pause', () => mobilePlayToggle.textContent = 'Play');
player.addEventListener('ended', () => mobilePlayToggle.textContent = 'Play');
player.addEventListener('error', () => {
  if (currentTrack) showError('This audio file could not be opened. Check that it still exists in your library folder.');
});

function updatePlayerProgress() {
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  npTime.textContent = `${fmtClock(currentTime)} / ${fmtClock(duration)}`;
  npProgressFill.style.width = `${percent}%`;
  mobileProgressFill.style.width = `${percent}%`;
  npProgress.setAttribute('aria-valuenow', String(Math.round(percent)));
  npProgress.setAttribute('aria-valuetext', `${fmtClock(currentTime)} of ${fmtClock(duration)}`);
}

npProgress.addEventListener('click', (e) => {
  if (!Number.isFinite(player.duration) || !player.duration) return;
  const rect = npProgress.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  player.currentTime = percent * player.duration;
});

npProgress.addEventListener('keydown', (event) => {
  if (!Number.isFinite(player.duration) || !player.duration) return;
  let targetTime;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') targetTime = player.currentTime + 5;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') targetTime = player.currentTime - 5;
  else if (event.key === 'Home') targetTime = 0;
  else if (event.key === 'End') targetTime = player.duration;
  else return;

  event.preventDefault();
  player.currentTime = Math.max(0, Math.min(player.duration, targetTime));
});

let searchTimer;
input.addEventListener('input', () => {
  const val = input.value.trim();
  const urlRegex = /(https?:\/\/[^\s,]+)/g;
  const hasUrl = urlRegex.test(val);

  if (hasUrl) {
    pullBtn.classList.add('visible');
    pullBtn.tabIndex = 0;
    if (activeQuery !== '') {
      activeQuery = '';
      loadLibrary();
    }
    closePredictions();
  } else {
    pullBtn.classList.remove('visible');
    pullBtn.tabIndex = -1;
    clearTimeout(searchTimer);
    
    if (!val) {
      activeQuery = '';
      loadLibrary();
      closePredictions();
      return;
    }

    searchTimer = setTimeout(() => {
      activeQuery = val;
      loadLibrary();
      fetchYoutubePredictions(val);
    }, 300);
  }
});

let currentSearchQuery = '';

async function fetchYoutubePredictions(query) {
  currentSearchQuery = query;

  // Abort any previous request
  if (searchAbortController) {
    searchAbortController.abort();
  }
  searchAbortController = new AbortController();
  const { signal } = searchAbortController;

  clearPredictionResults();
  if (predictionLoader) predictionLoader.classList.remove('hidden');
  predictionsDropdown.classList.add('show');

  // Use cached results if available
  if (searchCache.has(query)) {
    const cachedResults = searchCache.get(query);
    if (predictionLoader) predictionLoader.classList.add('hidden');
    renderPredictionResults(cachedResults);
    return;
  }

  try {
    const results = await window.current.searchYoutube(query);
    if (signal.aborted) return; // aborted while waiting
    // Cache results
    searchCache.set(query, results);

    if (currentSearchQuery !== query) return; // stale response
    if (predictionLoader) predictionLoader.classList.add('hidden');

    renderPredictionResults(results);
  } catch (err) {
    if (err.name === 'AbortError') return; // request was cancelled
    if (currentSearchQuery === query) {
      showPredictionMessage(err.message || 'YouTube search failed.');
    }
  }
}

// Helper to render prediction rows
function renderPredictionResults(results) {
  clearPredictionResults();
  if (predictionLoader) predictionLoader.classList.add('hidden');

  if (!results || !results.length) {
    showPredictionMessage('No YouTube results found.');
    return;
  }

  // Build rows (loader and pull-all-bar are separate DOM elements, not in innerHTML)
  const rowsHTML = results.map(item => {
    const thumb = item.thumbnail ? `style="background-image:url('${item.thumbnail}')"` : '';
    const durationStr = item.duration ? fmtDuration(item.duration) : '';
    const meta = [item.uploader, durationStr].filter(Boolean).join(' · ');
    return `
      <div class="prediction-row" data-url="${escapeHtml(item.url)}">
        <input type="checkbox" class="pred-checkbox" aria-label="Select ${escapeHtml(item.title)} for batch import">
        <div class="prediction-thumb" ${thumb}></div>
        <div class="prediction-info">
          <div class="prediction-title">${escapeHtml(item.title)}</div>
          <div class="prediction-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="prediction-actions">
          <button type="button" class="prediction-preview-btn" title="Preview" aria-label="Preview ${escapeHtml(item.title)}">▶</button>
          <button type="button" class="prediction-pull-btn" aria-label="Import ${escapeHtml(item.title)}">Import</button>
        </div>
      </div>
    `;
  }).join('');

  pullAllBar.insertAdjacentHTML('beforebegin', rowsHTML);

  predictionsDropdown.querySelectorAll('.prediction-row').forEach(row => {
    const url = row.dataset.url;
    const item = results.find(r => r.url === url);
    const rowPullBtn = row.querySelector('.prediction-pull-btn');
    const rowPreviewBtn = row.querySelector('.prediction-preview-btn');
    const checkbox = row.querySelector('.pred-checkbox');

    const updateSelection = (selected) => {
      if (selected) {
        selectedPredictions.set(url, item);
        row.classList.add('selected');
      } else {
        selectedPredictions.delete(url);
        row.classList.remove('selected');
      }
      checkbox.checked = selected;
      updatePullAllBar();
    };

    row.addEventListener('click', (e) => {
      if (e.target.closest('.prediction-pull-btn') || e.target.closest('.prediction-preview-btn') || e.target === checkbox) return;
      updateSelection(!checkbox.checked);
    });
    checkbox.addEventListener('change', () => updateSelection(checkbox.checked));

    // Preview button — open preview modal
    if (rowPreviewBtn) {
      rowPreviewBtn.addEventListener('click', e => {
        e.stopPropagation();
        openPreviewModal(item);
      });
    }

    // Individual Pull button — instant single download
    rowPullBtn.addEventListener('click', e => {
      e.stopPropagation();
      rowPullBtn.disabled = true;
      rowPullBtn.textContent = '···';
      selectedPredictions.delete(url);
      updatePullAllBar();
      window.current.queueDownload(url)
        .then(({ id, source }) => {
          jobsById.set(id, { id, source, status: 'fetching', progress: 0, title: item ? item.title : null });
          renderQueue();
          predictionsDropdown.classList.remove('show');
          clearPredictionResults();
          selectedPredictions.clear();
          updatePullAllBar();
          input.value = '';
          activeQuery = '';
        })
        .catch(err => {
          showError(err.message);
          rowPullBtn.disabled = false;
          rowPullBtn.textContent = 'Pull';
        });
    });
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#universal-form') && !e.target.closest('#predictions-dropdown')) {
    predictionsDropdown.classList.remove('show');
    selectedPredictions.clear();
    updatePullAllBar();
  }
});

/* ---------------- Edit Modal ---------------- */

function openEditModal(track) {
  currentEditingTrackId = track.id;
  modalTagsInput.value = track.tags || '';
  
  selectedColor = track.color || 'none';
  modalColorPicker.querySelectorAll('.color-option').forEach(opt => {
    const selected = opt.dataset.color === selectedColor;
    opt.classList.toggle('selected', selected);
    opt.setAttribute('aria-pressed', String(selected));
  });
  
  showDialog(editModal, modalTagsInput);
}

function closeEditModal() {
  hideDialog(editModal);
  currentEditingTrackId = null;
}

modalColorPicker.addEventListener('click', (e) => {
  const option = e.target.closest('.color-option');
  if (!option) return;
  
  selectedColor = option.dataset.color;
  modalColorPicker.querySelectorAll('.color-option').forEach(opt => {
    const selected = opt === option;
    opt.classList.toggle('selected', selected);
    opt.setAttribute('aria-pressed', String(selected));
  });
});

modalCancelBtn.addEventListener('click', closeEditModal);

modalSaveBtn.addEventListener('click', async () => {
  if (!currentEditingTrackId) return;
  
  const tags = modalTagsInput.value.trim();
  const color = selectedColor;
  
  await window.current.setTags(currentEditingTrackId, tags);
  await window.current.setColor(currentEditingTrackId, color);
  
  closeEditModal();
  loadLibrary();
});

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) {
    closeEditModal();
  }
});

/* ---------------- Preview Modal Logic ---------------- */

function openPreviewModal(item) {
  currentPreviewItem = item;

  // Populate metadata
  previewTitle.textContent = item.title || '—';
  previewArtist.textContent = item.uploader || item.artist || '';
  previewSource.textContent = SOURCE_LABELS[item.source] || 'YouTube';
  previewDuration.textContent = item.duration ? fmtDuration(item.duration) : '';

  if (item.thumbnail) {
    previewThumb.style.backgroundImage = `url('${item.thumbnail}')`;
  } else {
    previewThumb.style.backgroundImage = '';
  }

  // Reset player state
  previewAudio.pause();
  previewAudio.src = '';
  previewWaveformFill.style.width = '0%';
  previewCurrentTime.textContent = '0:00';
  previewTotalTime.textContent = item.duration ? fmtDuration(item.duration) : '0:00';
  previewPlayBtn.classList.remove('playing');
  previewPlayBtn.querySelector('.play-icon').textContent = '▶';

  // Show loading, hide waveform
  previewLoading.classList.remove('hidden');
  previewWaveform.style.opacity = '0.3';

  // Show modal
  showDialog(previewModal, previewCloseBtn);

  // Fetch preview URL
  const previewUrl = item.url;
  window.current.getPreviewUrl(previewUrl)
    .then(streamUrl => {
      previewLoading.classList.add('hidden');
      previewWaveform.style.opacity = '1';
      previewAudio.src = streamUrl;
      previewAudio.load();
    })
    .catch(err => {
      previewLoading.classList.add('hidden');
      previewWaveform.style.opacity = '1';
      showError(`Preview failed: ${err.message}`);
    });
}

function closePreviewModal() {
  hideDialog(previewModal);
  previewAudio.pause();
  previewAudio.src = '';
  previewPlayBtn.classList.remove('playing');
  previewPlayBtn.querySelector('.play-icon').textContent = '▶';
  currentPreviewItem = null;
}

previewPlayBtn.addEventListener('click', () => {
  if (!previewAudio.src) return;
  if (previewAudio.paused) {
    previewAudio.play();
    previewPlayBtn.classList.add('playing');
    previewPlayBtn.querySelector('.play-icon').textContent = '❚❚';
  } else {
    previewAudio.pause();
    previewPlayBtn.classList.remove('playing');
    previewPlayBtn.querySelector('.play-icon').textContent = '▶';
  }
});

previewAudio.addEventListener('timeupdate', () => {
  if (!previewAudio.duration) return;
  const pct = (previewAudio.currentTime / previewAudio.duration) * 100;
  previewWaveformFill.style.width = `${pct}%`;
  previewCurrentTime.textContent = fmtDuration(previewAudio.currentTime);
  previewTotalTime.textContent = fmtDuration(previewAudio.duration);
});

previewAudio.addEventListener('ended', () => {
  previewPlayBtn.classList.remove('playing');
  previewPlayBtn.querySelector('.play-icon').textContent = '▶';
  previewWaveformFill.style.width = '0%';
  previewCurrentTime.textContent = '0:00';
});

// Click on waveform to seek
previewWaveform.addEventListener('click', (e) => {
  if (!previewAudio.duration) return;
  const rect = previewWaveform.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  previewAudio.currentTime = pct * previewAudio.duration;
});

previewCloseBtn.addEventListener('click', closePreviewModal);

previewPullBtn.addEventListener('click', () => {
  if (!currentPreviewItem) return;
  const item = currentPreviewItem;
  closePreviewModal();

  // If it's a soulseek item, use slsk download
  if (item.source === 'soulseek') {
    window.current.slskDownload({
      user: item.user,
      filepath: item.filepath,
      title: item.title,
      artist: item.artist,
      duration: item.duration,
    }).then(({ id, source }) => {
      jobsById.set(id, { id, source, status: 'downloading', progress: 0, title: item.title });
      renderQueue();
    }).catch(err => showError(err.message));
  } else {
    // YouTube/SoundCloud — use queueDownload
    window.current.queueDownload(item.url)
      .then(({ id, source }) => {
        jobsById.set(id, { id, source, status: 'fetching', progress: 0, title: item.title });
        renderQueue();
      })
      .catch(err => showError(err.message));
  }
});

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closePreviewModal();
});

/* ---------------- Soulseek Search Integration ---------------- */

let slskResults = [];
let searchSourceTab = 'youtube'; // 'youtube' | 'soulseek'

function renderSearchSourceTabs(ytCount, slskCount) {
  // Check if tabs already exist, else create
  let tabsEl = predictionsDropdown.querySelector('.search-source-tabs');
  if (!tabsEl) {
    tabsEl = document.createElement('div');
    tabsEl.className = 'search-source-tabs';
    predictionsDropdown.insertBefore(tabsEl, predictionsDropdown.firstChild);
  }

  tabsEl.innerHTML = `
    <button class="search-source-tab ${searchSourceTab === 'youtube' ? 'active' : ''}" data-tab="youtube">
      YouTube<span class="tab-count">${ytCount != null ? ytCount : ''}</span>
    </button>
    <button class="search-source-tab ${searchSourceTab === 'soulseek' ? 'active' : ''}" data-tab="soulseek">
      Soulseek<span class="tab-count">${slskCount != null ? slskCount : '…'}</span>
    </button>
  `;

  tabsEl.querySelectorAll('.search-source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      searchSourceTab = tab.dataset.tab;
      // Re-render
      if (searchSourceTab === 'soulseek') {
        renderSlskResults(slskResults);
      } else {
        const cachedYt = searchCache.get(currentSearchQuery);
        if (cachedYt) renderPredictionResults(cachedYt);
      }
    });
  });
}

function renderSlskResults(results) {
  clearPredictionResults();
  if (predictionLoader) predictionLoader.classList.add('hidden');

  const ytCount = searchCache.has(currentSearchQuery) ? searchCache.get(currentSearchQuery).length : null;
  renderSearchSourceTabs(ytCount, results.length);

  if (!results || !results.length) {
    const msg = document.createElement('div');
    msg.className = 'prediction-loading prediction-message';
    msg.textContent = 'No Soulseek results. Make sure you\'re connected in Settings.';
    pullAllBar.before(msg);
    return;
  }

  const rowsHTML = results.map(item => {
    const bitrateStr = item.bitrate ? `${item.bitrate}kbps` : '';
    const sizeStr = item.size ? fmtBytes(item.size) : '';
    const durationStr = item.duration ? fmtDuration(item.duration) : '';
    const meta = [item.user, bitrateStr, sizeStr, durationStr].filter(Boolean).join(' · ');
    const ext = (item.filename || '').split('.').pop().toUpperCase();
    return `
      <div class="prediction-row" data-slsk-id="${escapeHtml(item.id)}">
        <div class="prediction-thumb" style="display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--accent-soundcloud)">${ext}</div>
        <div class="prediction-info">
          <div class="prediction-title">${escapeHtml(item.title)}</div>
          <div class="prediction-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="prediction-actions">
          <button class="prediction-pull-btn">Pull</button>
        </div>
      </div>
    `;
  }).join('');

  pullAllBar.insertAdjacentHTML('beforebegin', rowsHTML);

  predictionsDropdown.querySelectorAll('.prediction-row[data-slsk-id]').forEach(row => {
    const slskId = row.dataset.slskId;
    const item = results.find(r => r.id === slskId);
    const rowPullBtn = row.querySelector('.prediction-pull-btn');

    rowPullBtn.addEventListener('click', e => {
      e.stopPropagation();
      rowPullBtn.disabled = true;
      rowPullBtn.textContent = '···';

      window.current.slskDownload({
        user: item.user,
        filepath: item.filepath,
        title: item.title,
        artist: item.artist,
        duration: item.duration,
      }).then(({ id, source }) => {
        jobsById.set(id, { id, source, status: 'downloading', progress: 0, title: item.title });
        renderQueue();
        predictionsDropdown.classList.remove('show');
        clearPredictionResults();
        input.value = '';
        activeQuery = '';
      }).catch(err => {
        showError(err.message);
        rowPullBtn.disabled = false;
        rowPullBtn.textContent = 'Pull';
      });
    });
  });
}

// Extend fetchYoutubePredictions to also search Soulseek
const originalFetchYoutubePredictions = fetchYoutubePredictions;

async function fetchSlskPredictions(query) {
  try {
    const status = await window.current.slskStatus();
    if (status !== 'connected') {
      slskResults = [];
      return;
    }
    const results = await window.current.slskSearch(query);
    slskResults = results || [];

    // If we're on the soulseek tab, re-render
    if (searchSourceTab === 'soulseek' && currentSearchQuery === query) {
      renderSlskResults(slskResults);
    }
    // Update tab counts
    const tabsEl = predictionsDropdown.querySelector('.search-source-tabs');
    if (tabsEl) {
      const slskTab = tabsEl.querySelector('[data-tab="soulseek"] .tab-count');
      if (slskTab) slskTab.textContent = slskResults.length;
    }
  } catch (err) {
    slskResults = [];
    console.warn('[SLSK search]', err.message);
  }
}

// Patch the input handler to also trigger slsk search
const origSearchTimer = 'searchTimer';
// We hook into the existing search flow — when YouTube search fires, also fire Soulseek
const origRenderPredictionResults = renderPredictionResults;

loadLibrary();
