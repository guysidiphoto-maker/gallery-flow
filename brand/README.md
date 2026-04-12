# Pixflow brand assets

Generated for the launch of the Pixflow desktop app and marketing site.
All vector originals are SVG; PNG exports are provided at common sizes.

## Files

### Icon mark only (no text)
Use as the app icon, favicon, social profile picture, or anywhere a square mark is needed.

| File | Use case |
|---|---|
| `pixflow-icon.svg`         | Vector master, 1024×1024 viewBox |
| `pixflow-icon-1024.png`    | App store, large preview |
| `pixflow-icon-512.png`     | Social profile, hero |
| `pixflow-icon-256.png`     | macOS Finder retina |
| `pixflow-icon-192.png`     | PWA / web manifest |
| `pixflow-icon-128.png`     | macOS Finder standard |
| `pixflow-icon-64.png`      | Toolbar / tray |
| `pixflow-icon-32.png`      | Tray icon, small UI chrome |
| `favicon.svg`              | Browser favicon (vector, modern browsers) |
| `favicon-32.png`           | Legacy browser favicon |

### Wordmark (text only, no icon)
Use when the icon is shown elsewhere on the same surface, or when you only need the brand name.

| File | Use case |
|---|---|
| `pixflow-wordmark-light.svg`     | White text on dark background |
| `pixflow-wordmark-light-1200.png`| Web hero (light) |
| `pixflow-wordmark-light-600.png` | Web nav (light) |
| `pixflow-wordmark-dark.svg`      | Dark text on light background |
| `pixflow-wordmark-dark-1200.png` | Web hero (dark) |
| `pixflow-wordmark-dark-600.png`  | Web nav (dark) |

### Horizontal lockup (icon + wordmark)
Use as the primary header logo on the marketing site, in emails, in the app's About dialog, on invoices.

| File | Use case |
|---|---|
| `pixflow-horizontal-light.svg`     | Vector master, light variant |
| `pixflow-horizontal-light-1600.png`| Web hero, retina |
| `pixflow-horizontal-light-800.png` | Web nav, standard |
| `pixflow-horizontal-dark.svg`      | Vector master, dark variant |
| `pixflow-horizontal-dark-1600.png` | Light bg surfaces |
| `pixflow-horizontal-dark-800.png`  | Light bg surfaces, standard |

## Brand colors

```
Background:        #0a0a0f  (page background)
Background card:   #1a1a2e → #16162a  (icon background gradient)
Primary indigo:    #818cf8
Primary sky:       #38bdf8
Primary violet:    #a78bfa
Accent dot:        #38bdf8
Text light:        #ffffff
Text dark:         #0a0a0f
Subtle text:       rgba(255,255,255,0.55)  on dark
```

The icon's signature gradient is the indigo→sky→violet blend running from top-left to bottom-right.

## Typography

- **Primary:** Inter
- **Weight in wordmark:** 800 (Extra Bold)
- **Letter spacing:** -0.025em
- **Fallback stack:** `Inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif`

The wordmark SVGs reference Inter via `font-family`. If Inter is not installed on the rendering machine, browsers will fall back to the system font (San Francisco on Mac, Segoe UI on Windows). For pixel-perfect rendering across all surfaces, install Inter on your design machine: https://rsms.me/inter/

If you need a wordmark that's font-independent (no fallback risk), ask me to convert the text to vector paths — that produces a fully self-contained SVG at the cost of being un-editable as text.

## What's NOT in this folder yet

- `pixflow-icon.icns` — already in `build/icon.icns`, used by electron-builder
- Apple Touch Icon (180×180) — generate from `pixflow-icon-256.png`
- Open Graph image (1200×630) — needs custom layout (not just the icon)
- Twitter card (1200×675) — needs custom layout
- Email header — needs to be 600px wide on white bg

If you need any of those, ask me and I'll add them.
