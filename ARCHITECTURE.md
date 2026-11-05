# Architecture: Pioneer DDJ SR Controller Integration

## Current System Overview

### Electron Application Structure
```
main.js              - Main process, window management, download IPC
├── src/
│   ├── db.js           - SQLite database for track library, including album metadata
│   ├── library-files.js - Recursive local audio indexing and metadata/artwork reads
│   ├── audio-formats.js - Shared audio format allowlist
│   ├── ytdlp.js          - YouTube/SoundCloud track fetching
│   └── config.js         - App configuration management
└── renderer/
    ├── index.html/js     - Four-pane library, import, search, and playback
    ├── settings.html/js  - Settings panel
    └── style.css         - Master Tape Ledger design system
```

### Library Workspace

The desktop renderer presents source/tag taxonomy, artist index, album and track groups, and the current player as four adjacent panes. At narrow widths those same panes become tabs with a persistent compact player. Downloaded release metadata is stored in the optional `tracks.album` column; older rows remain valid and display as unfiled recordings.

On the first library request and after the cache expires, `main.js` scans only the configured library directory, recursively indexes supported audio files, and synchronizes them into SQLite. The scanner ignores symlinks, deduplicates by resolved file path against downloaded tracks, and reads tags with `music-metadata`; embedded artwork is fetched lazily and capped to safe image formats and sizes. Local rows are marked as not app-managed: removing them from Current hides the entry while preserving the original file. Directory or metadata read issues are logged and surfaced without preventing accessible files from loading.

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
| Performance Pads A/B| /mixxx/deck/[1-2]/pads/[1-8] | Hot cues/loops |

### Data Flow Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ DDJ SR MIDI  │────▶│ MIDI Server  │────▶│ Mixxx (OSC) │
└──────────────┘     └──────────────┘     └──────────────┘
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