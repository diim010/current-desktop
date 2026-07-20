const { ipcRenderer } = require('electron');

let deckStates = {
  1: { playing: false, title: '', volume: 0, playPosition: 0, duration: 0 },
  2: { playing: false, title: '', volume: 0, playPosition: 0, duration: 0 },
};

let midiConnected = false;

// Format time in MM:SS
function formatTime(seconds) {
  if (!seconds || seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update deck UI
function updateDeckUI(deckNum) {
  const state = deckStates[deckNum];
  if (!state) return;

  const statusEl = document.getElementById(`deck${deckNum}-status`);
  const titleEl = document.getElementById(`deck${deckNum}-title`);
  const metaEl = document.getElementById(`deck${deckNum}-meta`);
  const progressEl = document.getElementById(`deck${deckNum}-progress`);
  const volumeEl = document.getElementById(`deck${deckNum}-volume`);

  // Update status
  if (statusEl) {
    statusEl.textContent = state.playing ? 'Playing' : 'Stopped';
    statusEl.classList.toggle('playing', state.playing);
  }

  // Update title
  if (titleEl) {
    titleEl.textContent = state.title || 'No track loaded';
  }

  // Update meta (current time / duration)
  if (metaEl) {
    const currentTime = state.playPosition * state.duration;
    metaEl.textContent = `${formatTime(currentTime)} / ${formatTime(state.duration)}`;
  }

  // Update progress bar
  if (progressEl) {
    progressEl.style.width = `${state.playPosition * 100}%`;
  }

  // Update volume bar
  if (volumeEl) {
    volumeEl.style.width = `${state.volume * 100}%`;
  }
}

// Listen for OSC deck updates
ipcRenderer.on('osc-deck-update', (event, data) => {
  console.log('[DJ UI] Deck update:', data);
  
  const { deck, state } = data;
  if (deck && state) {
    deckStates[deck] = { ...deckStates[deck], ...state };
    updateDeckUI(deck);
  }
});

// Initialize: request current deck states
async function initializeDeckStates() {
  try {
    const states = await ipcRenderer.invoke('osc-get-all-deck-states');
    if (states) {
      deckStates = states;
      updateDeckUI(1);
      updateDeckUI(2);
    }
  } catch (error) {
    console.error('[DJ UI] Failed to get initial deck states:', error);
  }
}

// Check connection status periodically


// Library view navigation
document.getElementById('library-view-btn').addEventListener('click', () => {
  window.current.switchView('library');
});



ipcRenderer.on('midi-load-request', (event, data) => {
  const { deck } = data;
  console.log('[DJ UI] MIDI load request for deck', deck);
  // Highlight deck for track loading
  document.querySelectorAll('.deck').forEach(d => d.classList.remove('loading'));
  const deckEl = document.querySelector(`.deck:nth-child(${deck === 1 ? 1 : 3})`);
  if (deckEl) deckEl.classList.add('loading');
});

// Initialize on load
initializeDeckStates();

