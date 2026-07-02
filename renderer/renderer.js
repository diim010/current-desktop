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
const tabs        = document.querySelectorAll('.tab');
const libraryPathEl = document.getElementById('library-path');
const player      = document.getElementById('player');
const npTitle     = document.getElementById('np-title');
const npMeta      = document.getElementById('np-meta');

// Edit Modal elements
const editModal        = document.getElementById('edit-modal');
const modalTagsInput   = document.getElementById('modal-tags-input');
const modalColorPicker = document.getElementById('modal-color-picker');
const modalCancelBtn   = document.getElementById('modal-cancel-btn');
const modalSaveBtn     = document.getElementById('modal-save-btn');

let activeTab = 'all';
let activeQuery = '';
const jobsById = new Map();
let currentEditingTrackId = null;
let selectedColor = 'none';

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
  const opts = activeQuery ? { query: activeQuery } : { source: activeTab };
  window.current.getTracks(opts).then(renderLibrary);
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.source;
    input.value = '';
    pullBtn.classList.remove('visible');
    activeQuery = '';
    loadLibrary();
  });
});

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
  } else {
    pullBtn.classList.remove('visible');
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      activeQuery = val;
      loadLibrary();
    }, 200);
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

loadLibrary();
