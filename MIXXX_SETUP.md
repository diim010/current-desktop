# Mixxx + Current DJ Integration Setup Guide

This guide explains how to integrate Mixxx DJ software with the Current app using OSC (Open Sound Control) protocol and your Pioneer DDJ SR controller.

## Architecture Overview

- **Mixxx**: Handles audio processing, DJ functionality, and Pioneer DDJ SR controller
- **Current App**: Provides your custom design system UI via Electron
- **Communication**: OSC protocol over UDP (port 7777)

## Prerequisites

1. **Mixxx DJ Software**: Download from https://mixxx.org/download/
2. **Pioneer DDJ SR Controller**: Connected via USB
3. **Current App**: This Electron application with OSC server

## Step 1: Set Up Mixxx

### Install Mixxx
```bash
# macOS
brew install --cask mixxx

# Or download from https://mixxx.org/download/
```

### Configure Pioneer DDJ SR Controller

1. **Download the DDJ SR mapping**:
   ```bash
   git clone https://github.com/hrudham/Mixxx-Pioneer-DDJ-SR.git
   ```

2. **Copy mapping files to Mixxx**:
   ```bash
   # macOS
   cp Mixxx-Pioneer-DDJ-SR/bin/PIONEER_DDJ-SR.midi.xml /Applications/Mixxx.app/Contents/Resources/controllers/
   cp Mixxx-Pioneer-DDJ-SR/bin/PIONEER_DDJ-SR-scripts.js /Applications/Mixxx.app/Contents/Resources/controllers/
   ```

3. **Configure DDJ SR for non-Serato mode**:
   - Turn off the Pioneer DDJ-SR
   - Hold down `Shift` + `Play` on the left deck
   - Turn the power on
   - Turn the left deck's keylock on
   - Restart the controller

### Enable OSC in Mixxx

Mixxx needs to be configured to send OSC messages to the Current app.

1. Open Mixxx
2. Go to **Preferences → Live Broadcasting**
3. Enable OSC output if available (note: OSC support may require a specific Mixxx build)
4. Set OSC server address to `127.0.0.1` (localhost)
5. Set OSC server port to `7777`

**Note**: Mixxx's OSC support is still in development. You may need to build Mixxx from source with OSC enabled or use a development build.

## Step 2: Run Current App

```bash
cd /Users/di/Downloads/current-desktop
npm install
npm start
```

The app will:
1. Start the OSC server on port 7777
2. Load the library view by default
3. Switch to DJ view via menu or button

## Step 3: Use the Integration

### Switch Between Views
- **Library View**: Click "Switch to DJ View" button or use menu: `Current → DJ View`
- **DJ View**: Click "← Back to Library" button or use menu: `Current → Library View`

### DJ View Features
- **Deck A & Deck B**: Display track info, play status, volume, and progress
- **Waveform Visualization**: Placeholder for future implementation
- **Mixer Section**: Crossfader and master volume controls
- **Connection Status**: Shows Mixxx connection state

### OSC Message Format

The Current app expects OSC messages in this format:
```
/mixxx/deck/[1-2]/[property] [value]
```

Supported properties:
- `playing`: 0 or 1 (boolean)
- `title`: string (track title)
- `volume`: float (0.0 to 1.0)
- `playposition`: float (0.0 to 1.0)
- `duration`: float (seconds)

Example messages:
```
/mixxx/deck/1/playing 1
/mixxx/deck/1/title "My Track"
/mixxx/deck/1/volume 0.75
/mixxx/deck/1/playposition 0.5
/mixxx/deck/1/duration 180.0
```

## Troubleshooting

### Mixxx Not Sending OSC Messages
- Verify Mixxx OSC is enabled in preferences
- Check that Mixxx is sending to port 7777
- Try running Mixxx with `--controller-debug` flag to see OSC messages

### DDJ SR Not Working
- Ensure controller is in non-Serato mode (Step 1.3)
- Check USB connection
- Verify mapping files are in correct location
- Restart Mixxx after connecting controller

### Current App Not Receiving Messages
- Check console logs in Current app (Developer Tools)
- Verify OSC server is running (check terminal output)
- Ensure no firewall blocking port 7777
- Test with OSC sender tool

### Connection Status Shows "Disconnected"
- This is normal if Mixxx isn't running or not configured
- The demo mode will simulate deck activity after 3 seconds
- Real-time updates require actual Mixxx OSC connection

## Future Enhancements

- **Bidirectional OSC**: Send control commands from Current to Mixxx
- **Waveform Visualization**: Real-time waveform display from Mixxx
- **Controller LED Sync**: Update DDJ SR LEDs from Current UI
- **Library Integration**: Load tracks from Current library into Mixxx
- **Custom Skins**: Apply your design system to Mixxx directly via QML

## Resources

- Mixxx GitHub: https://github.com/mixxxdj/mixxx
- DDJ SR Mapping: https://github.com/hrudham/Mixxx-Pioneer-DDJ-SR
- Mixxx Manual: https://manual.mixxx.org/
- Mixxx Forum: https://mixxx.discourse.group/
- OSC Protocol: https://en.wikipedia.org/wiki/Open_Sound_Control

## License

This integration follows the same license as the Current app (MIT) and Mixxx (GPLv2).
