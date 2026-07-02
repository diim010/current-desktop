const osc = require('node-osc');

class OSCServer {
  constructor(port = 7777, mainWindow) {
    this.port = port;
    this.mainWindow = mainWindow;
    this.server = null;
    this.deckState = {
      1: { playing: false, title: '', volume: 0, playPosition: 0, duration: 0 },
      2: { playing: false, title: '', volume: 0, playPosition: 0, duration: 0 },
    };
  }

  start() {
    this.server = new osc.Server(this.port, '0.0.0.0');
    console.log(`[OSC] Server listening on port ${this.port}`);

    this.server.on('message', (msg) => {
      this.handleMessage(msg);
    });

    this.server.on('error', (err) => {
      console.error('[OSC] Server error:', err);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[OSC] Server stopped');
    }
  }

  handleMessage(msg) {
    const [address, ...args] = msg;
    console.log('[OSC] Received:', address, args);

    // Parse Mixxx OSC messages
    // Format: /mixxx/deck/[1-2]/[property]
    if (address.startsWith('/mixxx/deck/')) {
      const parts = address.split('/');
      const deckNum = parseInt(parts[3]);
      const property = parts[4];

      if (deckNum && this.deckState[deckNum]) {
        this.updateDeckState(deckNum, property, args);
      }
    }
  }

  updateDeckState(deckNum, property, args) {
    const value = args[0];

    switch (property) {
      case 'playing':
        this.deckState[deckNum].playing = value === 1;
        break;
      case 'title':
        this.deckState[deckNum].title = value;
        break;
      case 'volume':
        this.deckState[deckNum].volume = value;
        break;
      case 'playposition':
        this.deckState[deckNum].playPosition = value;
        break;
      case 'duration':
        this.deckState[deckNum].duration = value;
        break;
      default:
        console.log('[OSC] Unknown property:', property);
        return;
    }

    // Send update to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('osc-deck-update', {
        deck: deckNum,
        state: this.deckState[deckNum],
      });
    }
  }

  getDeckState(deckNum) {
    return this.deckState[deckNum] || null;
  }

  getAllDeckStates() {
    return this.deckState;
  }
}

module.exports = OSCServer;
