# Design System

## Color Palette

### Surface Colors
- `--surface-ink`: `#0d0d10` - Deepest background
- `--surface-charcoal`: `#181716` - Charcoal surface
- `--surface-moss`: `#15211d` - Moss green surface

### Text Colors
- `--text-primary`: `#f5f7fb` - Main text
- `--text-secondary`: `#d4dae3` - Secondary text
- `--text-faint`: `#9aa5b4` - Muted text

### Accent Colors
- `--accent-youtube`: `#ff667d` - YouTube red
- `--accent-ytmusic`: `#b69cff` - YouTube Music purple
- `--accent-soundcloud`: `#ffb769` - SoundCloud orange
- `--accent-cyan`: `#69f5d4` - Cyan accent
- `--accent-green`: `#41dda4` - Green accent

### Glass Colors
- `--glass-fill`: `rgba(255,255,255,0.11)` - Base glass fill
- `--glass-fill-soft`: `rgba(255,255,255,0.07)` - Soft glass fill
- `--glass-fill-strong`: `rgba(255,255,255,0.17)` - Strong glass fill
- `--glass-border`: `rgba(255,255,255,0.23)` - Base glass border
- `--glass-border-strong`: `rgba(255,255,255,0.36)` - Strong glass border
- `--glass-highlight`: `rgba(255,255,255,0.62)` - Glass highlight
- `--glass-shadow`: `rgba(0,0,0,0.34)` - Glass shadow

## Typography

- **Primary Font**: `-apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif`
- **Mono Font**: `'SF Mono', 'JetBrains Mono', monospace`

### Sizes
- Display: 28px (brand heading)
- Heading: 18px (panel titles)
- Subheading: 15px (track titles)
- Body: 13px, 12.5px, 11px, 10.5px, 10px, 9px
- Mono: 12px (meta info), 11px (status), 10px (labels), 9px (small labels)

## Spacing & Layout

- Container max-width: 680px
- Shell padding: 6px 24px
- Shell height: `calc(100vh - 90px)`
- Gaps: 8px, 12px, 16px, 22px

## Border Radius

- `--radius-lg`: 22px - Large containers, modals
- `--radius-md`: 16px - Panels, dropdowns
- `--radius-sm`: 11px - Small elements, inputs
- Pill: 999px - Buttons, status badges, progress bars

## Components

### Glass Panel
`.glass` - Frosted glass container with blur effect

Used on: `.composer`, `.panel`, `.deck-header`, `.track-info`, `.waveform-placeholder`, `.controls-row`, `.mixer-title`, `.crossfader-container`, `.modal-card`
```css
background: linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.065) 46%, rgba(255,255,255,0.11)), var(--glass-fill);
border: 1px solid var(--glass-border);
border-radius: var(--radius-lg);
backdrop-filter: blur(28px) saturate(165%);
box-shadow: inset 0 1px 0 var(--glass-highlight), inset 0 -1px 0 rgba(255,255,255,0.08), 0 18px 48px var(--glass-shadow);
```

### Liquid Button
`.liquid-button` - Pill-shaped button with glass styling
```css
display: inline-flex;
align-items: center;
justify-content: center;
min-height: 30px;
padding: 7px 13px;
border-radius: 999px;
border: 1px solid var(--glass-border);
backdrop-filter: blur(28px) saturate(165%);
font-size: 11px;
font-weight: 700;
transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
```

Variants:
- `.primary` - Cyan/green gradient with dark text
- `.secondary` - Standard glass styling
- `.danger` - Red hover state

### Composer (Input Row)
`.composer` - Search/input container
```css
display: flex;
align-items: center;
gap: 8px;
padding: 7px 7px 7px 17px;
border-radius: 999px;
min-height: 48px;
```

### Job Card (Queue Item)
`.job-card` - Download/queue item
```css
padding: 10px 14px;
border-radius: var(--radius-md);
background: linear-gradient(145deg, rgba(255,255,255,0.14), rgba(255,255,255,0.055)), var(--glass-fill-soft);
backdrop-filter: blur(20px) saturate(155%);
```

### File Row (Library Item)
`.file-row` - Library track row
```css
display: flex;
align-items: center;
gap: 10px;
padding: 10px;
border-radius: var(--radius-sm);
cursor: pointer;
transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
```

States:
- `.playing` - Shows active track with cyan border
- `.color-{red|orange|yellow|green|blue|purple}` - Color markers for tags

### Deck (DJ View)
`.deck` - DJ deck container
```css
flex: 1;
min-width: 0;
display: flex;
flex-direction: column;
gap: 12px;
```

`.deck-header` - Deck title bar
- `.deck-title` - 18px, font-weight 800
- `.deck-status` - 11px, mono, pill shape, `.playing` class for active state

`.track-info` - Track information panel
- `.track-title` - 15px, font-weight 650
- `.track-meta` - 11px, mono, faint color

`.waveform-placeholder` - Waveform visualization area, 140px min-height

`.control-group` - Control with label and progress bar
- `.control-label` - 10px, uppercase, mono, faint color

### Modal
`.modal-overlay` + `.modal-card` - Modal dialog
```css
.modal-overlay {
  background: linear-gradient(135deg, rgba(11,11,14,0.72), rgba(16,31,27,0.56)), rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(24px) saturate(140%);
}

.modal-card {
  padding: 24px;
  border-radius: var(--radius-lg);
  max-width: 400px;
}
```

### Color Picker
`.color-picker` - Tag color selection
- `.color-option` - 24px circle with 50% radius
- `.selected` - Scaled 1.15x with white border

### Progress Bar
`.progress-track` + `.progress-fill`
```css
.progress-track {
  height: 5px;
  border-radius: 999px;
  background: rgba(0,0,0,0.24);
}
.progress-fill {
  background: linear-gradient(90deg, var(--accent-ytmusic), var(--accent-cyan), var(--accent-soundcloud));
  transition: width 0.4s ease;
}
```

### Volume Bar
`.volume-bar` + `.volume-fill`
```css
.volume-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(0,0,0,0.28);
}
.volume-fill {
  background: linear-gradient(90deg, var(--accent-ytmusic), var(--accent-cyan), var(--accent-soundcloud));
}
```

### Mixer (DJ View)
`.mixer-section` - Mixer controls container, 205px width

`.crossfader` - Horizontal crossfader control
- `.crossfader-fill` - Gradient from cyan to purple, 50% default position

### Connection Status
`.connection-status` - Fixed position connection indicator
- 11px mono, pill shape, backdrop-filter blur
- `.connected` - Green styling for connected state

### Library Filters
`.library-nav` - Filter container, flex column with gap

`.library-nav-main` - Horizontal layout with heading and tools

`.library-heading` - Vertical stack for title/summary
- `.library-title` - 14px, font-weight 700
- `.library-summary` - 11px, mono, faint color

`.library-tools` - Inline tools with gap
- `.sort-select` - Glass-style select dropdown, 11px mono
- `.filter-reset` - Reset button, shown when filters active

`.filter-row` - Flex wrap row of filter chips

`.filter-chip` - Filter button style
- `.active` - Selected state with cyan border
- `.color-filter-chip.active` - Selected with accent-cyan
- `.tag-filter-chip.active` - Selected with accent-ytmusic
- `.filter-count` - Small count badge inside chip

`.color-swatch` - 12px color dot for filter chips
- `.color-swatch.active` - Uses matching accent color as border (cyan for all source filters, specific color for each color filter)

## Animations

- Button hover: Opacity, border-color, background transitions
- Button active: Scale 0.97 (0.96 for primary)
- Shimmer: `linear-gradient` animation on progress bars (1.6s infinite)
- Spinner: Rotation animation (1s linear infinite)
- Modal: Scale transform with custom easing

## Background Gradients

### Body Background
```css
linear-gradient(125deg, rgba(9,9,12,0.98) 0%, rgba(31,27,23,0.93) 34%, rgba(16,31,27,0.92) 65%, rgba(23,18,28,0.96) 100%)
conic-gradient(from 150deg at 52% 48%, rgba(105,245,212,0.26), rgba(255,183,105,0.17), rgba(182,156,255,0.22), rgba(255,102,125,0.14), rgba(105,245,212,0.26))
```

### Brand Gradient
```css
linear-gradient(92deg, #ffffff 0%, #d7fff6 48%, #ffe1af 100%)
```