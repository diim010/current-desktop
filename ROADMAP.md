# Roadmap: Pioneer DDJ SR Controller Integration

## Phase 1: Foundation (v1.1)
**Goal: Basic controller connectivity and deck control**

### Milestone 1.1.1 - MIDI Infrastructure
- [ ] Add `midi` npm package dependency
- [ ] Create `src/midi-server.js` with MIDI input/output handling
- [ ] Implement device detection and auto-selection for DDJ SR
- [ ] Add controller connection/disconnection detection
- [ ] Extend settings UI with MIDI configuration panel

### Milestone 1.1.2 - Core Deck Control
- [ ] Map jog wheels to play position/tempo control
- [ ] Map play/pause buttons to OSC play messages
- [ ] Map cue buttons to OSC cue messages
- [ ] Map volume faders to OSC volume messages
- [ ] Map tempo sliders to BPM adjustment
- [ ] Update DJ view with controller connection status

## Phase 2: Mixer & Effects (v1.2)
**Goal: Full mixer control and basic effects**

### Milestone 2.1.1 - Mixer Controls
- [ ] Crossfader OSC mapping
- [ ] Master volume control
- [ ] Filter knob integration (high/mid/low)
- [ ] Gain knobs per deck

### Milestone 2.1.2 - Performance Pads
- [ ] Hot cue pad mapping (8 per deck)
- [ ] Loop control pads (in/out, 4/8/16/32 beat loops)
- [ ] Pad LED feedback (basic colors)
- [ ] Pad modes: Hot cues / Loops / Samples toggle

## Phase 3: Library Integration (v1.3)
**Goal: Controller-driven library browsing**

### Milestone 3.1.1 - Track Loading
- [ ] Load buttons trigger library track loading
- [ ] Selected deck shows highlighted in library
- [ ] Visual indicator for track assigned to deck

### Milestone 3.1.2 - Search & Browse
- [ ] Encoder knob for library scrolling
- [ ] Shift+Nudge for quick navigation
- [ ] Category filters via controller buttons

## Phase 4: Advanced Features (v1.4)
**Goal: Pro features and polish**

### Milestone 4.1.1 - Visual Feedback
- [ ] Waveform zoom via jog wheel
- [ ] Beat grid visualization sync
- [ ] Deck VU meters
- [ ] Controller parameter sync (sliders match UI)

### Milestone 4.1.2 - Performance Features
- [ ] Slicer performance pads
- [ ] Quantized cue points
- [ ] Slip mode (tempo without position)
- [ ] Key lock toggle

### Milestone 4.1.3 - Generic Support
- [ ] Fallback mapping for unsupported controllers
- [ ] Configurable MIDI mapping
- [ ] Controller preset system

## Technical Debt & Testing

### Phase 2.5 - Testing (v1.2.5)
- [ ] Unit tests for MIDI message parsing
- [ ] Integration tests with mock device
- [ ] Manual testing with DDJ SR hardware

### Phase 4.5 - Documentation (v1.4.5)
- [ ] MIDI mapping reference
- [ ] Troubleshooting guide
- [ ] Controller setup documentation

## Known Limitations

1. **MIDI Output Compatibility**: Some DDJ SR LED feedback requires reverse-engineered SysEx
2. **Cross-platform**: MIDI implementation varies on Windows/macOS/Linux
3. **Latency**: USB MIDI has inherent ~1ms latency (acceptable for DJ use)

## Success Metrics

- [ ] Controller detected automatically on launch
- [ ] All core controls (jog, play, cue, volume, tempo) responsive
- [ ] <5ms input-to-audio-latency for jog wheels
- [ ] Controller disconnection handled gracefully
- [ ] Settings persist across restarts