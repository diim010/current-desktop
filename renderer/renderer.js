const SOURCE_LABELS = {
  'youtube': 'YouTube',
  'youtube-music': 'YouTube Music',
  'soundcloud': 'SoundCloud',
};

const form        = document.getElementById('composer-form');
const input       = document.getElementById('url-input');
const pullBtn     = document.getElementById('pull-btn');
const queueEl     = document.getElementById('queue');
const errorBanner = document.getElementById('error-banner');
const fileListEl  = document.getElementById('file-list');
const searchInput = document.getElementById('search-input');
const tabs        = document.querySelectorAll('.tab');
const libraryPathEl = document.getElementById('library-path');
const player      = document.getElementById('player');
const npTitle     = document.getElementById('np-title');
const npMeta      = document.getElementById('np-meta');

let activeTab = 'all';
let activeQuery = '';
const jobsById = new Map();

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
  libraryPathEl.textContent = `Pulling into ${p}`;
});
window.current.onLibraryPathChanged(p => {
  libraryPathEl.textContent = `Pulling into ${p}`;
  loadLibrary();
});

/* ---------------- composer / queue ---------------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  pullBtn.disabled = true;
  window.current.queueDownload(url)
    .then(({ id, source }) => {
      input.value = '';
      jobsById.set(id, { id, source, status: 'fetching', progress: 0, title: null });
      renderQueue();
    })
    .catch(err => showError(err.message))
    .finally(() => { pullBtn.disabled = false; });
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
    <div class="job-card ${stateClass}">
      <div class="job-row"><div class="job-title">${escapeHtml(title)}</div></div>
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
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- library ---------------- */

function fileRowHTML(track) {
  const thumb = track.thumbnail ? `style="background-image:url('${track.thumbnail}')"` : '';
  const icon = track.thumbnail ? '' : '♪';
  const tags = (track.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const tagHtml = tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('');

  return `
    <div class="file-row" data-id="${track.id}" data-path="${escapeHtml(track.filepath)}">
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
    fileListEl.innerHTML = `<div class="empty-state">Nothing here yet — pulled tracks land in this list.</div>`;
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

    row.querySelector('.tag-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const current = tracks.find(t => t.id === id);
      const next = prompt('Tags (comma separated):', current.tags || '');
      if (next === null) return;
      await window.current.setTags(id, next.trim());
      loadLibrary();
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
  const opts = activeQuery ? { query: activeQuery } : { source: activeTab };
  window.current.getTracks(opts).then(renderLibrary);
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.source;
    searchInput.value = '';
    activeQuery = '';
    loadLibrary();
  });
});

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    activeQuery = searchInput.value.trim();
    loadLibrary();
  }, 200);
});

loadLibrary();
