import jsPDF from 'jspdf'

export interface PdfGallerySection {
  title: string
  photos: string[]
  photoSize?: 'small' | 'medium' | 'large'  // per-gallery override of default
}

export interface PdfOptions {
  galleries: PdfGallerySection[]
  bgColor: string
  logoBase64?: string
  businessName: string
  photoSize?: 'small' | 'medium' | 'large'  // controls target row height
}

// Number of ROWS per page for each size preset. Row height is computed
// dynamically so N rows always fill the page exactly (no empty bottom space).
const ROWS_PER_PAGE = {
  small: 4,    // 4 rows × ~3 images = ~12 per page
  medium: 3,   // 3 rows × ~3 images = ~9 per page
  large: 2,    // 2 rows × ~3 images = ~6 per page
}

// ── 16:9 widescreen page (presentation format) ─────────────────────────
const PAGE_W = 280          // mm
const PAGE_H = 157.5        // mm (280 * 9/16 = 157.5)
const MARGIN = 8            // small margins — photos fill the page
const TITLE_H = 10          // compact title bar
const PHOTO_GAP = 2.5

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

interface LoadedImage { data: string; w: number; h: number }

/**
 * Loads image, draws to canvas at max 1600px on longest side, returns JPEG base64.
 * Preserves original aspect ratio (no cropping).
 */
async function loadImageAsBase64(url: string, maxSide = 1600): Promise<LoadedImage | null> {
  const img = await loadImage(url)
  if (!img) return null
  const ratio = img.width / img.height

  let w: number, h: number
  if (img.width >= img.height) {
    w = Math.min(maxSide, img.width)
    h = Math.round(w / ratio)
  } else {
    h = Math.min(maxSide, img.height)
    w = Math.round(h * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)

  try {
    return { data: canvas.toDataURL('image/jpeg', 0.9), w, h }
  } catch {
    return null
  }
}

/**
 * Fixed-height row layout: all rows have the same height H, images preserve
 * aspect ratio. Packs images into rows filling close to (but not exceeding)
 * content width. The total page height is always exactly N * H + (N-1) * gap,
 * so pages always fill vertically.
 */
interface LaidRow {
  items: { img: LoadedImage; displayW: number; displayH: number }[]
  width: number  // actual packed width (may be slightly less than contentW)
}

function buildFixedRows(images: LoadedImage[], contentW: number, rowH: number): LaidRow[] {
  if (images.length === 0) return []
  const rows: LaidRow[] = []
  let rowImgs: LoadedImage[] = []
  let rowWidth = 0

  const itemWidth = (img: LoadedImage) => rowH * (img.w / img.h)

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const w = itemWidth(img)
    const gapIfAdd = rowImgs.length > 0 ? PHOTO_GAP : 0

    // Would adding this image overflow contentW?
    if (rowImgs.length > 0 && rowWidth + gapIfAdd + w > contentW) {
      // Finalize current row, scale down slightly to fit exactly contentW
      const scale = contentW / rowWidth
      const clampedScale = Math.min(scale, 1)  // don't stretch, only shrink
      const items = rowImgs.map(im => ({
        img: im,
        displayW: itemWidth(im) * clampedScale,
        displayH: rowH * clampedScale,
      }))
      rows.push({
        items,
        width: items.reduce((s, it) => s + it.displayW, 0) + PHOTO_GAP * (items.length - 1),
      })
      rowImgs = [img]
      rowWidth = w
    } else {
      rowImgs.push(img)
      rowWidth += gapIfAdd + w
    }
  }

  // Last row
  if (rowImgs.length > 0) {
    // Scale to exactly fill contentW
    const scale = contentW / rowWidth
    // Only scale UP if close (<= 1.3) to avoid tiny last-row single images blowing up
    const clampedScale = scale > 1.3 ? 1 : Math.min(scale, 1.15)
    const items = rowImgs.map(im => ({
      img: im,
      displayW: itemWidth(im) * clampedScale,
      displayH: rowH * clampedScale,
    }))
    rows.push({
      items,
      width: items.reduce((s, it) => s + it.displayW, 0) + PHOTO_GAP * (items.length - 1),
    })
  }

  return rows
}

export async function generatePitchPdf(options: PdfOptions): Promise<Blob> {
  const { galleries, bgColor, logoBase64, businessName, photoSize = 'medium' } = options
  const defaultRowsPerPage = ROWS_PER_PAGE[photoSize]
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_W, PAGE_H] })
  const contentW = PAGE_W - MARGIN * 2
  const contentH = PAGE_H - MARGIN * 2 - TITLE_H
  const dark = isDark(bgColor)
  const [bgR, bgG, bgB] = hexToRgb(bgColor)

  const paintBg = () => {
    doc.setFillColor(bgR, bgG, bgB)
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F')
  }

  // ── Cover Page ──────────────────────────────────────────────────────

  paintBg()
  doc.setFillColor(99, 102, 241)
  doc.rect(0, 0, PAGE_W, 2, 'F')

  let y = PAGE_H / 2 - 25

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', PAGE_W / 2 - 22, y, 44, 22)
      y += 32
    } catch { y += 5 }
  }

  doc.setFontSize(30)
  if (dark) doc.setTextColor(255, 255, 255); else doc.setTextColor(20, 20, 30)
  doc.text(businessName, PAGE_W / 2, y, { align: 'center' })
  y += 11

  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.4)
  doc.line(PAGE_W / 2 - 22, y, PAGE_W / 2 + 22, y)
  y += 10

  const totalPhotos = galleries.reduce((sum, g) => sum + g.photos.length, 0)
  doc.setFontSize(11)
  if (dark) doc.setTextColor(160, 160, 180); else doc.setTextColor(110, 110, 130)
  doc.text(`${galleries.length} events · ${totalPhotos} photos`, PAGE_W / 2, y, { align: 'center' })

  const dateStr = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.setFontSize(9)
  doc.text(dateStr, PAGE_W / 2, PAGE_H - 10, { align: 'center' })

  // ── Per-Gallery Pages ───────────────────────────────────────────────

  for (const gallery of galleries) {
    if (gallery.photos.length === 0) continue

    // Load all photos upfront with dimensions
    const loaded: LoadedImage[] = []
    for (const url of gallery.photos) {
      const img = await loadImageAsBase64(url)
      if (img) loaded.push(img)
    }
    if (loaded.length === 0) continue

    // Build fixed-height rows. Row height computed so N rows always fill
    // the page vertically (no empty bottom space).
    const rowsPerPage = gallery.photoSize ? ROWS_PER_PAGE[gallery.photoSize] : defaultRowsPerPage
    const rowH = (contentH - (rowsPerPage - 1) * PHOTO_GAP) / rowsPerPage
    const rows = buildFixedRows(loaded, contentW, rowH)

    let firstPageOfGallery = true

    const renderPage = (pageRows: LaidRow[], isFirst: boolean, pageIdx: number, totalPages: number) => {
      doc.addPage([PAGE_W, PAGE_H], 'landscape')
      paintBg()

      // Title (small, single line — pagination inline if multi-page)
      doc.setFontSize(12)
      if (dark) doc.setTextColor(255, 255, 255); else doc.setTextColor(20, 20, 30)
      const titleText = totalPages > 1 ? `${gallery.title}  ·  ${pageIdx}/${totalPages}` : gallery.title
      doc.text(titleText, MARGIN, MARGIN + 5)

      // Render rows: fixed height, centered horizontally if narrower than contentW
      let cursorY = MARGIN + TITLE_H
      for (const row of pageRows) {
        // Horizontal offset to center row
        const xOffset = (contentW - row.width) / 2
        let x = MARGIN + xOffset
        for (const item of row.items) {
          try {
            doc.addImage(item.img.data, 'JPEG', x, cursorY, item.displayW, item.displayH)
          } catch { /* skip */ }
          x += item.displayW + PHOTO_GAP
        }
        // All rows have the same height (rowH), advance by that amount
        cursorY += rowH + PHOTO_GAP
      }
      void isFirst
    }

    // Pack rows into pages: exactly rowsPerPage rows per page
    const pages: LaidRow[][] = []
    for (let i = 0; i < rows.length; i += rowsPerPage) {
      pages.push(rows.slice(i, i + rowsPerPage))
    }

    pages.forEach((pr, idx) => {
      renderPage(pr, firstPageOfGallery, idx + 1, pages.length)
      firstPageOfGallery = false
    })
  }

  return doc.output('blob')
}
