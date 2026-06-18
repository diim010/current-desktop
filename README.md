# Current — macOS app

A native-feeling macOS app (Electron + vibrancy) that pulls audio from
YouTube, YouTube Music, and SoundCloud, converts to MP3 via yt-dlp, and
keeps a searchable, taggable local library (SQLite) with built-in playback.

## What's different from the web/bot versions

- **Local SQLite library** (`library.db` in the app's data folder) instead
  of just scanning a folder — gives you search, tags, and de-duplication
  (won't re-download a video you already have).
- **Built-in player** — click a track to play it right in the app.
- Saves files to `~/Music/Current/<source>/` by default; change it via
  **Current → Choose Library Folder…**.

## 1. Prerequisites (development machine)

```bash
# Node.js 18+ and Xcode command line tools
xcode-select --install

# yt-dlp + ffmpeg — the app shells out to these, so they must be on PATH
brew install yt-dlp ffmpeg
```

## 2. Install dependencies

```bash
cd current-desktop
npm install
```

`better-sqlite3` is a native module — `npm install` compiles it for your
Node/Electron ABI automatically via its install script. If you hit a
version mismatch error when running, rebuild for Electron's Node version:

```bash
npm run rebuild
```

## 3. Run in development

```bash
npm start
```

## 4. Build a distributable .app / .dmg

```bash
npm run dist
```

Output lands in `dist/` — `Current-1.0.0.dmg` and a `.zip` for the `.app`
bundle (`mac` target in `package.json`).

### Code signing & notarization

The build config sets `hardenedRuntime: true` for Gatekeeper compatibility,
but doesn't sign by default. To distribute outside your own Macs without
Gatekeeper warnings, you'll need an Apple Developer ID:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-cert-password
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist
```

electron-builder will sign and notarize automatically if those env vars are
set. Without a Developer ID, the built app runs fine on your own Mac
(right-click → Open the first time to bypass Gatekeeper) but isn't suitable
for wider distribution.

### App icon

Drop a 1024×1024 `icon.png` into `build/` and convert it to `.icns`:

```bash
mkdir build/icon.iconset
sips -z 1024 1024 build/icon.png --out build/icon.iconset/icon_512x512@2x.png
# (repeat sips for other required sizes, or use an icon generator tool)
iconutil -c icns build/icon.iconset -o build/icon.icns
```

Or use a tool like `npx electron-icon-builder --input=build/icon.png --output=build`.

## 5. Bundling yt-dlp/ffmpeg with the app (optional)

By default the app expects `yt-dlp` and `ffmpeg` on the user's `PATH`
(fine if they're already a Homebrew user). To ship self-contained binaries
instead:

1. Download static `yt-dlp` and `ffmpeg` binaries for macOS (arm64/x86_64).
2. Place them in `resources/bin/`.
3. Add `"extraResources": [{ "from": "resources/bin", "to": "bin" }]` to the
   `build` section of `package.json`.
4. In `src/ytdlp.js`, change the default binary paths to
   `path.join(process.resourcesPath, 'bin', 'yt-dlp')` (and same for
   ffmpeg, setting `--ffmpeg-location`).

This avoids any Homebrew dependency for end users, at the cost of a larger
app bundle and needing separate Intel/Apple Silicon builds (or a universal
binary).

## 6. Keeping yt-dlp current

yt-dlp breaks periodically when YouTube/SoundCloud change things. If
relying on a Homebrew install:

```bash
brew upgrade yt-dlp
```

If bundling binaries, you'll need to rebuild/release the app to update —
or have `src/ytdlp.js` check `yt-dlp -U` on startup if you bundled a
non-static install.

## 7. File layout

```
current-desktop/
├── package.json
├── main.js              ← Electron main process: windows, IPC, downloads
├── preload.js           ← contextBridge API exposed to renderer
├── src/
│   ├── db.js             ← SQLite schema + queries (library, tags, search)
│   └── ytdlp.js           ← yt-dlp spawn wrappers (info lookup, download)
└── renderer/
    ├── index.html
    ├── style.css          ← liquid-glass UI tuned for macOS vibrancy
    └── renderer.js
```

## A note on usage

Same as the other versions: best for your own uploads, royalty-free, or
Creative Commons tracks. Downloading copyrighted material from these
platforms may conflict with their terms of service.
