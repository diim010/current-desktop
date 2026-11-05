# Current interface direction

## Product and use scene

Current is a desktop music library for collecting, organizing, and playing locally saved tracks. People use it while listening at a desk, moving between their own collection and imports from YouTube, YouTube Music, SoundCloud, and Soulseek. The interface should keep collection context and playback visible without turning the library into a streaming-service storefront.

## Chosen visual world: Master Tape Ledger

The approved reference is a broadcast-station tape vault and transfer log. Each saved recording reads as a source-marked entry in a personal archive. Matte warm-white sheets, ink-blue index structure, sulfur-yellow selection marks, and restrained signal-red actions replace the previous glass-and-gradient styling.

The ledger is a framing device, not a new workflow: no tape handling, mastering, or broadcast controls are implied.

## First-screen composition

On a desktop window the workspace is exactly four adjacent panes:

1. **Sources & tags** — source, color, and tag filters plus reset.
2. **Artists** — a counted, alphabetical artist index.
3. **Albums & tracks** — album groups and playable track rows, with sorting and file/tag/delete actions.
4. **Now playing** — album artwork, floating track and artist information, progress, and audio controls.

Search and link import stay above the panes. Import queue and error feedback remain in that header area.

At narrow widths the same four panes become named tabs so the content remains readable. A compact current-track strip stays available across panes, with play/pause and progress; the full player remains one tap away. The pane sequence and their existing actions do not change.

## Library data

Albums are grouped from source metadata when available. Supported audio files in the selected library folder and its subfolders are indexed alongside app downloads; nested folder symlinks are not followed. Tags, duration, and embedded artwork are read when available, with filenames used as a safe title fallback. Removing a discovered local file from Current hides its library entry but keeps the file on disk. Existing database records migrate with an empty album value and appear under “Unfiled recordings.” Artist browsing uses the existing artist field, falling back to uploader and then “Unknown artist.”

## Interaction and accessibility

Source, color, tag, artist, sort, search, preview, import, tag editing, file reveal, deletion, and playback keep their existing behavior. Controls remain keyboard-focusable with visible focus rings. Text and controls use high-contrast ink on paper or white on the player surface; reduced-motion preferences are respected.
