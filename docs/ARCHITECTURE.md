# Architecture: Pioneer DDJ SR Controller Integration

## Current System Overview

### Electron Application Structure
```
main.js              - Main process, window management, OSC server init
├── src/
│   ├── osc-server.js   - OSC communication with Mixxx (port 7777)
│   ├── db.js           - SQLite database for track library
│   ├── ytdlp.js          - YouTube/SoundCloud track fetching
│   └── config.js         - App configuration management
└── renderer/
    ├── dj.html/dj.js     - DJ view: deck visualization
    ├── index.html/js     - Library view: track management
    ├── settings.html/js  - Settings panel
    └── style.css         - Design system with glass morphism
```

## DDJ SR Controller Mapping

### MIDI Communication Layer
```
src/midi-server.js (NEW)
├── MIDI input handling via 'midi' npm package
├── Bridge to OSC for Mixxx compatibility
└── Controller state management
```

### Core Components to Add

#### 1. MIDI Input Handler
- Node.js native MIDI via `midi` package
- Listen on system MIDI ports for DDJ SR
- Parse controller messages (pitch, knobs, buttons, pads)
- Map to internal deck/controller state

#### 2. Controller State Bridge
```
MIDI Input → Controller State → OSC Output → Mixxx
                    ↓
              IPC → DJ View (UI feedback)
```

#### 3. Deck Mapping (DDJ SR to Mixxx)
| DDJ SR Control      | Mixxx OSC Path           | Function |
|---------------------|--------------------------|----------|
| Jog Wheel A/B       | /mixxx/deck/[1-2]/jog    | Pitch bend |
| Tempo Slider A/B      | /mixxx/deck/[1-2]/bpm     | Tempo adjust |
| Play/Pause A/B      | /mixxx/deck/[1-2]/play    | Toggle play |
| Cue A/B             | /mixxx/deck/[1-2]/cue     | Cue point |
| Sync A/B            | /mixxx/deck/[1-2]/sync    | Beat sync |
| Volume Fader A/B    | /mixxx/deck/[1-2]/volume  | Deck volume |
| Filter Knob A/B     | /mixxx/deck/[1-2]/filter  | Filter effect |
| Gain Knob           | /mixxx/deck/[1-2]/gain    | Per-channel gain |
| Crossfader          | /mixxx/master/crossfader  | Mix blend |
| Headphone Cue       | /mixxx/deck/[1-2]/pfl   | Pre-fade listen |
| Load A/B            | /mixxx/deck/[1-2]/load    | Track load |
| Performance Pads A/B| /mixxx/deck/[1-2]/pads/[1-8] | Hot cues/loops |

### Data Flow Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ DDJ SR MIDI  │────▶│ MIDI Server  │────▶│ OSC Server   │────▶│ Mixxx        │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                             │                    │                    │
                             └────────────────────┼────────────────────┘
                                                  │                    │
                                           ┌──────▼──────┐     ┌─────▼──────┐
                                           │ DJ View UI  │◀────│ OSC Events │
                                           └─────────────┘     └────────────┘
```

### Library Integration

#### Controller-Aware Features
- Waveform zoom synchronized with jog wheel
- Pad color feedback for hot cues (RGB LED control)
- Deck status LEDs (play/pause/cue states)
- Track loading via Load buttons triggers library search

#### Enhanced UI Feedback
```
dj.js enhancements:
- Request library tracks by deck (for load buttons)
- Display controller connection status
- Visual feedback for pad triggers
- Waveform interaction for jog sync
```

### Configuration Schema

```javascript
// Settings for DDJ SR
{
  midi: {
    enabled: true,
    inputDevice: "DDJ-SR",
    outputDevice: "DDJ-SR",
    // Fallback to generic controller
    genericMode: false
  },
  controller: {
    // Mapping overrides
    deckA: "1",
    deckB: "2",
    // Performance pad modes
    padModes: {
      hotcues: true,
      loops: false,
      samples: false
    }
  }
}
```

### IPC Handlers (Extensions)

```javascript
// New MIDI IPC handlers in main.js
ipcMain.handle('midi-get-state', () => controllerState);
ipcMain.handle('midi-set-state', (event, state) => updateController(state));
ipcMain.handle('midi-send-led', (event, { deck, control, value }) => {
  midiServer.setLED(deck, control, value);
});
```

### Security Considerations
- MIDI devices require system permissions (macOS: Accessibility/MIDI)
- All IPC remains context-isolated (secure)
- OSC server runs on localhost only (no external network)

---
[Back to Documentation Index](./README.md)
