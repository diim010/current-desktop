const SOURCE_LABELS = {
  'youtube': 'YouTube',
  'youtube-music': 'YouTube Music',
  'soundcloud': 'SoundCloud',
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
const sortSelect = document.getElementById('sort-select');
const libraryResetBtn = document.getElementById('library-reset-btn');
const predictionsDropdown = document.getElementById('predictions-dropdown');
const libraryPathEl = document.getElementById('library-path');
const player      = document.getElementById('player');
const npTitle     = document.getElementById('np-title');
const npMeta      = document.getElementById('np-meta');
const djViewBtn   = document.getElementById('dj-view-btn');

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
  sort: 'recent',
  tracks: [],
};
const SOURCE_FILTERS = [
  ['all', 'All'],
  ['youtube', 'YouTube'],
  ['youtube-music', 'Music'],
  ['soundcloud', 'SoundCloud'],
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

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('show');
  setTimeout(() => errorBanner.classList.remove('show'), 4000);
}

/* ---------------- library path ---------------- */

window.current.getLibraryPath().then(p => {
  libraryPathEl.textContent = p;
});
window.current.onLibraryPathChanged(p => {
  libraryPathEl.textContent = p;
  loadLibrary();
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
    libraryState.sort !== 'recent';
}

function resetLibraryFilters() {
  libraryState.source = 'all';
  libraryState.color = 'all';
  libraryState.tag = 'all';
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
  renderLibraryNav(libraryState.tracks, visibleTracks);
  renderLibrary(visibleTracks);
}

function fileRowHTML(track) {
  const thumb = track.thumbnail ? `style="background-image:url('${track.thumbnail}')"` : '';
  const icon = track.thumbnail ? '' : '♪';
  const tags = (track.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const tagHtml = tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('');

  return `
    <div class="file-row color-${track.color || 'none'}" data-id="${track.id}" data-path="${escapeHtml(track.filepath)}">
      <div class="file-icon" ${thumb}>${icon}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(track.title)}</div>
        <div class="file-meta">
          <span>${SOURCE_LABELS[track.source] || track.source}</span>
          ${track.duration ? `<span>${fmtDuration(track.duration)}</span>` : ''}
          ${tagHtml}
        </div>
      </div>
      <div class="file-actions">
        <button class="tag-btn" title="Edit tags">#</button>
        <button class="reveal-btn" title="Reveal in Finder">⌂</button>
        <button class="danger delete-btn" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function renderLibrary(tracks) {
  if (!tracks.length) {
    const message = libraryState.tracks.length
      ? 'No tracks match the current filters.'
      : 'Nothing here yet — pulled tracks land in this list.';
    fileListEl.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }
  fileListEl.innerHTML = tracks.map(fileRowHTML).join('');

  fileListEl.querySelectorAll('.file-row').forEach(row => {
    const id = Number(row.dataset.id);
    const filepath = row.dataset.path;

    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      playTrack(row, filepath);
    });

    row.querySelector('.reveal-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.current.revealInFinder(filepath);
    });

    row.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.current.deleteTrack(id).then(loadLibrary);
    });

    row.querySelector('.tag-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const current = tracks.find(t => t.id === id);
      openEditModal(current);
    });
  });
}

function playTrack(row, filepath) {
  document.querySelectorAll('.file-row.playing').forEach(r => r.classList.remove('playing'));
  row.classList.add('playing');
  player.src = `file://${filepath}`;
  player.play();
  npTitle.textContent = row.querySelector('.file-name').textContent;
  npMeta.textContent = row.querySelector('.file-meta').textContent.trim();
}

function loadLibrary() {
  const opts = activeQuery ? { query: activeQuery } : {};
  window.current.getTracks(opts).then(tracks => {
    libraryState.tracks = tracks;
    renderLibraryView();
  });
}

sourceFilterEl.addEventListener('click', (e) => {
  const button = e.target.closest('[data-filter-group]');
  if (!button || button.disabled) return;
  libraryState[button.dataset.filterGroup] = button.dataset.filterValue;
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

let searchTimer;
input.addEventListener('input', () => {
  const val = input.value.trim();
  const urlRegex = /(https?:\/\/[^\s,]+)/g;
  const hasUrl = urlRegex.test(val);

  if (hasUrl) {
    pullBtn.classList.add('visible');
    if (activeQuery !== '') {
      activeQuery = '';
      loadLibrary();
    }
    closePredictions();
  } else {
    pullBtn.classList.remove('visible');
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
        <div class="pred-checkbox"></div>
        <div class="prediction-thumb" ${thumb}></div>
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

  predictionsDropdown.querySelectorAll('.prediction-row').forEach(row => {
    const url = row.dataset.url;
    const item = results.find(r => r.url === url);
    const rowPullBtn = row.querySelector('.prediction-pull-btn');

    // Toggle selection on row click (anywhere except the Pull button)
    row.addEventListener('click', (e) => {
      if (e.target.closest('.prediction-pull-btn')) return;
      if (selectedPredictions.has(url)) {
        selectedPredictions.delete(url);
        row.classList.remove('selected');
        row.querySelector('.pred-checkbox').textContent = '';
      } else {
        selectedPredictions.set(url, item);
        row.classList.add('selected');
        row.querySelector('.pred-checkbox').textContent = '✓';
      }
      updatePullAllBar();
    });

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
    opt.classList.toggle('selected', opt.dataset.color === selectedColor);
  });
  
  editModal.classList.add('show');
}

function closeEditModal() {
  editModal.classList.remove('show');
  currentEditingTrackId = null;
}

modalColorPicker.addEventListener('click', (e) => {
  const option = e.target.closest('.color-option');
  if (!option) return;
  
  selectedColor = option.dataset.color;
  modalColorPicker.querySelectorAll('.color-option').forEach(opt => {
    opt.classList.toggle('selected', opt === option);
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

// DJ view navigation
djViewBtn.addEventListener('click', () => {
  window.current.switchView('dj');
});

loadLibrary();
