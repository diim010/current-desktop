let MIDIDeviceManager;
try {
  const { MIDI } = require('jazz-midi');

  class MIDIDeviceManagerImpl {
    constructor(mainWindow) {
      this.mainWindow = mainWindow;
      this.midi = new MIDI();
      this.input = null;
      this.output = null;
      this.isConnected = false;
      this.controllerState = {
        deckA: { jog: 0, tempo: 0.5, volume: 0, playing: false, cue: false },
        deckB: { jog: 0, tempo: 0.5, volume: 0, playing: false, cue: false },
        crossfader: 0.5,
        masterVolume: 0.75,
      };
    }

    findDDJSR() {
      const inputs = this.midi.MidiInList();
      for (let i = 0; i < inputs.length; i++) {
        const info = this.midi.MidiInInfo(i);
        if (info && (info.name.includes('DDJ-SR') || info.name.includes('DDJ SR'))) {
          return { input: i, name: info.name };
        }
      }
      return null;
    }

    connect() {
      const device = this.findDDJSR();
      if (!device) {
        console.log('[MIDI] DDJ SR not found, waiting for connection...');
        return false;
      }

      try {
        this.input = this.midi.MidiInOpen(device.input);
        this.input.on('midi', (msg) => {
          this.handleMessage(msg);
        });

        const outputs = this.midi.MidiOutList();
        for (let i = 0; i < outputs.length; i++) {
          const info = this.midi.MidiOutInfo(i);
          if (info && (info.name.includes('DDJ-SR') || info.name.includes('DDJ SR'))) {
            this.output = this.midi.MidiOutOpen(i);
            break;
          }
        }

        this.isConnected = true;
        console.log('[MIDI] Connected to', device.name);
        this.notifyRenderer('midi-connected', { device: device.name });
        return true;
      } catch (err) {
        console.error('[MIDI] Connection error:', err);
        return false;
      }
    }

    handleMessage(msg) {
      const [status, control, value] = msg;
      const channel = (status & 0x0f) + 1;

      switch (status & 0xf0) {
        case 0x90: // Note On
          this.handleNoteOn(channel, control, value);
          break;
        case 0x80: // Note Off
          this.handleNoteOff(channel, control, value);
          break;
        case 0xB0: // Control Change
          this.handleControlChange(channel, control, value);
          break;
      }
    }

    handleNoteOn(channel, control, value) {
      if (channel === 1 || channel === 2) {
        const deckNum = channel;

        switch (control) {
          case 0x17: // Play/Pause
            this.sendOSC(`/mixxx/deck/${deckNum}/play`, value > 0 ? 1 : 0);
            break;
          case 0x18: // Cue
            if (value > 0) this.sendOSC(`/mixxx/deck/${deckNum}/cue`, 1);
            break;
          case 0x19: // Sync
            this.sendOSC(`/mixxx/deck/${deckNum}/sync`, value > 0 ? 1 : 0);
            break;
          case 0x1A: // Load
            this.notifyRenderer('midi-load-request', { deck: deckNum });
            break;
          default:
            if (control >= 0x20 && control <= 0x27) { // Performance Pads 1-8
              const padNum = control - 0x1f;
              this.sendOSC(`/mixxx/deck/${deckNum}/pads/${padNum}`, value > 0 ? 1 : 0);
            }
        }
      }
    }

    handleNoteOff(channel, control) {
      if (channel === 1 || channel === 2) {
        const deckNum = channel;

        if (control === 0x18) { // Cue released
          this.sendOSC(`/mixxx/deck/${deckNum}/cue`, 0);
        }
      }
    }

    handleControlChange(channel, control, value) {
      const normalizedValue = value / 127;

      if (channel === 1 || channel === 2) {
        const deck = channel === 1 ? 'deckA' : 'deckB';
        const deckNum = channel;

        switch (control) {
          case 0x01: // Jog Wheel
            this.handleJog(deck, normalizedValue, deckNum);
            break;
          case 0x02: // Tempo Slider
            this.controllerState[deck].tempo = normalizedValue;
            this.sendOSC(`/mixxx/deck/${deckNum}/bpm`, normalizedValue);
            break;
          case 0x0B: // Volume Fader
            this.controllerState[deck].volume = normalizedValue;
            this.sendOSC(`/mixxx/deck/${deckNum}/volume`, normalizedValue);
            break;
          case 0x0C: // Filter Knob
            this.sendOSC(`/mixxx/deck/${deckNum}/filter`, normalizedValue);
            break;
        }
      } else if (channel === 0x0F || channel === 16) {
        // Master channel
        switch (control) {
          case 0x01: // Crossfader
            this.controllerState.crossfader = normalizedValue;
            this.sendOSC('/mixxx/master/crossfader', normalizedValue);
            break;
          case 0x02: // Master Volume
            this.controllerState.masterVolume = normalizedValue;
            this.sendOSC('/mixxx/master/volume', normalizedValue);
            break;
        }
      }
    }

    handleJog(deck, value, deckNum) {
      if (this.controllerState[deck].playing) {
        const jogDelta = (value - 0.5) * 2;
        this.sendOSC(`/mixxx/deck/${deckNum}/jog`, jogDelta);
      }
    }

    sendOSC(address, value) {
      const oscClient = new (require('node-osc').Client)(7778, '127.0.0.1');
      oscClient.send(address, value);
    }

    setLED(deck, control, value) {
      if (this.output) {
        this.output.send([0x90 | (deck - 1), control, value]);
      }
    }

    getState() {
      return this.controllerState;
    }

    notifyRenderer(channel, data) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    }

    disconnect() {
      if (this.input) this.input.close();
      this.isConnected = false;
    }
  }

  MIDIDeviceManager = MIDIDeviceManagerImpl;
} catch (e) {
  console.warn('[MIDI] Failed to load midi library, MIDI support disabled:', e.message);
  MIDIDeviceManager = class {
    constructor() {}
    connect() { return false; }
    disconnect() {}
    getState() { return null; }
    setLED() {}
  };
}

module.exports = MIDIDeviceManager;