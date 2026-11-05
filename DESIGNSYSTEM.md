# Design system

Current uses the **Master Tape Ledger** direction: an archival index for a personal listening library, with matte paper surfaces, ink-blue structure, sulfur-yellow selection marks, and restrained signal-red actions.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f4f3ed` | App background |
| `--sheet` | `#fffefa` | Workspace and input surfaces |
| `--sheet-raised` | `#f8f7f1` | Hovered rows and secondary surfaces |
| `--ink` | `#14365c` | Primary structure and player surface |
| `--text` | `#202c38` | Body text on paper |
| `--text-secondary` | `#4d5965` | Supporting labels |
| `--text-faint` | `#606c77` | Placeholder and tertiary text |
| `--line` | `#d7d7cc` | Pane and row separators |
| `--link` | `#2357a6` | Text actions and tags |
| `--index` | `#e7ee67` | Selected index item |
| `--signal` | `#b8422f` | Pull and destructive emphasis |

Colors for user markers remain distinct and are toned for legibility on paper.

## Type and spacing

Use the native system sans-serif stack. The wordmark is 25px; pane titles are 14px; track titles are 11px; utility labels are 9–12px. Keep song and artist names readable and truncate only at narrow measures. Use an 8px spacing rhythm, thin dividers, and small square corners (2–6px); avoid decorative pills and glass effects.

## Workspace

The desktop shell has four adjacent panes: taxonomy, artists, albums and tracks, and player. Pane dividers carry the structure; album and track records remain plain rows rather than nested cards. The player gets a solid ink-blue surface and a large square cover, with the current title floating over its lower edge.

Below 1080px, switch to four labeled pane tabs and show one pane at a time. Keep a compact current-track strip at the bottom, including cover art when available, play/pause, and progress. Keep the full playback controls in the player pane.

## Interaction

- Selected source, color, tag, artist, and workspace pane states have a visible background or index mark.
- Buttons and inputs retain a clear keyboard focus outline.
- Download progress, errors, empty library, no matching results, and missing album metadata have explicit states.
- Motion is limited to short state transitions; reduced-motion preferences disable it.
- Use text labels and counts rather than decorative metrics or icon-only navigation.

## Components

- **Import composer** — search the local library or paste a supported link; search predictions and batch-pull controls remain attached to it.
- **Taxonomy chips** — count-bearing filters for source, color, and tags.
- **Artist index** — full-width alphabetical rows with recording counts.
- **Album group** — one cover, release title, artist context when needed, and plain playable track rows.
- **Track actions** — edit tags/color, reveal the local file, or delete the recording.
- **Player** — current cover, overlaid title and metadata, time/progress, and native audio controls.
- **Modal dialogs** — reserved for tag/color editing and audio preview, where a focused task is useful.
