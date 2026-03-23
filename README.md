# GalleryFlow

A Mac desktop app for photographers to visually organize and prepare image galleries for delivery.

## Quick Start

### 1. Install Node.js (if not already installed)

```bash
# Using Homebrew (recommended)
brew install node

# Or download from https://nodejs.org (LTS version)
```

### 2. Install dependencies & run

```bash
cd gallery-flow
npm install
npm run dev
```

### 3. Build a distributable .dmg

```bash
npm run dist
# Output in: dist/
```

---

## Features

| Feature | How to use |
|--------|-----------|
| **Open folder** | Toolbar button or `Cmd+O` |
| **Drag & drop reorder** | Drag any image to new position — file is renamed instantly |
| **Move to top** | Right-click → Move to Top, or select + `Home` key |
| **Move to bottom** | Right-click → Move to Bottom, or select + `End` key |
| **Sort by filename** | Sort menu → By Filename |
| **Sort by capture date** | Sort menu → By Date (loads EXIF) |
| **Shuffle** | Sort menu → Shuffle |
| **Apply order to filenames** | "Apply Order" button → preview → confirm |
| **Undo rename** | `Cmd+Z` or click "Undo" in toolbar |
| **Preview mode** | Eye icon in toolbar or `Cmd+P` |
| **Duplicate detection** | "Duplicates" button in toolbar |
| **Delete selected** | `Delete` or `Backspace` key |
| **Select multiple** | `Cmd+click` or `Cmd+A` |

---

## Smart Naming System

When you drag an image to a new position, **only that image is renamed**. No other files are touched.

### How it works

```
Before:                After moving 0010 after 0002:
0001.jpg               0001.jpg
0002.jpg               0002.jpg
0003.jpg               0002_001.jpg   ← renamed (was 0010.jpg)
0010.jpg               0003.jpg
```

### Naming rules

| Situation | Result |
|-----------|--------|
| Insert after `0002.jpg` | `0002_001.jpg` |
| Insert after `0002.jpg` again | `0002_002.jpg` |
| Insert after `0002_001.jpg` | `0002_001_001.jpg` |
| Move to top (before `0001.jpg`) | `0000_001.jpg` |

### Why this always sorts correctly

- `0002.jpg` → sorts before `0002_001.jpg` (shorter prefix wins)
- `0002_001.jpg` → sorts before `0003.jpg` (`0002` < `0003`)
- Works in Finder, Google Drive, Dropbox, any file system

### Apply current order

When you're happy with the arrangement, "Apply Order" renames ALL files sequentially:
```
0001.jpg, 0002.jpg, 0003.jpg, ...
```
Optionally add a prefix: `wedding_0001.jpg`, `wedding_0002.jpg`, ...

This operation is undoable via `Cmd+Z`.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+O` | Open folder |
| `Cmd+Z` | Undo last rename |
| `Cmd+A` | Select all |
| `Escape` | Deselect all |
| `Cmd+P` | Toggle preview mode |
| `Cmd+Enter` | Open Apply Order dialog |
| `Home` | Move selected image to top |
| `End` | Move selected image to bottom |
| `Delete` / `Backspace` | Move selected to Trash |

---

## Supported Formats

JPG, JPEG, PNG, HEIC, HEIF, WebP

HEIC requires macOS (uses the native image decoder).

---

## Architecture

```
src/
├── main/index.ts          # Electron main process
│                          # File I/O, IPC, custom protocol
├── preload/index.ts       # Bridge: exposes api.* to renderer
└── renderer/src/
    ├── store/gallery.ts   # Zustand state + all actions
    ├── utils/naming.ts    # Smart naming algorithm
    ├── utils/imageUtils.ts # EXIF, perceptual hashing
    └── components/        # React UI components
```

**Stack:** Electron + React + TypeScript + Vite (`electron-vite`)

**State:** Zustand — no Redux boilerplate, minimal re-renders

**Drag & Drop:** @dnd-kit — smooth, accessible, grid-optimized

**EXIF:** exifr — works in renderer, no native modules needed

**Image display:** `localfile://` custom protocol — secure, no `webSecurity: false`
