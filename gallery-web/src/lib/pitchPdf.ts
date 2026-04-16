import jsPDF from 'jspdf'

export interface PdfGallerySection {
  title: string
  photos: string[]
}

export interface PdfOptions {
  galleries: PdfGallerySection[]
  bgColor: string
  logoBase64?: string
  businessName: string
  photoSize?: 'small' | 'medium' | 'large'  // controls target row height
}

// Target row heights in mm (bigger = fewer, larger photos per row)
const ROW_HEIGHTS = {
  small: 42,    // ~8-10 photos per page
  medium: 58,   // ~6 photos per page
  large: 80,    // ~3-4 photos per page
}

// ── 16:9 widescreen page (presentation format) ─────────────────────────
const PAGE_W = 280          // mm
const PAGE_H = 157.5        // mm (280 * 9/16 = 157.5)
const MARGIN = 10
const TITLE_H = 14
const PHOTO_GAP = 3

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
 * Justified layout: packs images into rows that span full content width.
 * Each image preserves aspect ratio. Row height computed so total scaled
 * widths (plus gaps) equal content width.
 */
interface LaidRow {
  items: { img: LoadedImage; displayW: number; displayH: number }[]
  height: number
}

function buildJustifiedRows(images: LoadedImage[], contentW: number, targetH: number): LaidRow[] {
  if (images.length === 0) return []
  const rows: LaidRow[] = []
  let rowImgs: LoadedImage[] = []
  let sumAspect = 0

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const aspect = img.w / img.h
    rowImgs.push(img)
    sumAspect += aspect

    // Natural row width at target height
    const naturalW = sumAspect * targetH + (rowImgs.length - 1) * PHOTO_GAP
    const isLast = i === images.length - 1

    if (naturalW >= contentW || isLast) {
      // Compute actual row height to fill contentW
      const avail = contentW - (rowImgs.length - 1) * PHOTO_GAP
      const rowH = isLast && naturalW < contentW
        ? targetH  // last row, don't stretch
        : avail / sumAspect

      // Clamp: don't let rows get absurdly tall
      const h = Math.min(Math.max(rowH, targetH * 0.6), targetH * 1.8)
      const items = rowImgs.map(im => ({
        img: im,
        displayW: h * (im.w / im.h),
        displayH: h,
      }))

      rows.push({ items, height: h })
      rowImgs = []
      sumAspect = 0
    }
  }

  return rows
}

export async function generatePitchPdf(options: PdfOptions): Promise<Blob> {
  const { galleries, bgColor, logoBase64, businessName, photoSize = 'medium' } = options
  const targetRowH = ROW_HEIGHTS[photoSize]
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

    // Build justified rows
    const rows = buildJustifiedRows(loaded, contentW, targetRowH)

    // Split rows into pages by height
    let pageRows: LaidRow[] = []
    let pageHSum = 0
    let firstPageOfGallery = true

    const renderPage = (pageRows: LaidRow[], isFirst: boolean, pageIdx: number, totalPages: number) => {
      doc.addPage([PAGE_W, PAGE_H], 'landscape')
      paintBg()

      // Title (with pagination if multi-page)
      doc.setFontSize(16)
      if (dark) doc.setTextColor(255, 255, 255); else doc.setTextColor(20, 20, 30)
      const titleText = totalPages > 1 ? `${gallery.title}  ·  ${pageIdx}/${totalPages}` : gallery.title
      doc.text(titleText, MARGIN, MARGIN + 7)

      doc.setDrawColor(99, 102, 241)
      doc.setLineWidth(0.3)
      doc.line(MARGIN, MARGIN + 10, MARGIN + 25, MARGIN + 10)

      // Render rows
      let cursorY = MARGIN + TITLE_H
      for (const row of pageRows) {
        let x = MARGIN
        for (const item of row.items) {
          try {
            doc.addImage(item.img.data, 'JPEG', x, cursorY, item.displayW, item.displayH)
          } catch { /* skip */ }
          x += item.displayW + PHOTO_GAP
        }
        cursorY += row.height + PHOTO_GAP
      }
      void isFirst
    }

    // Pack rows into pages
    const pages: LaidRow[][] = []
    for (const row of rows) {
      const rowTotal = row.height + (pageRows.length > 0 ? PHOTO_GAP : 0)
      if (pageHSum + rowTotal > contentH && pageRows.length > 0) {
        pages.push(pageRows)
        pageRows = [row]
        pageHSum = row.height
      } else {
        pageRows.push(row)
        pageHSum += rowTotal
      }
    }
    if (pageRows.length > 0) pages.push(pageRows)

    pages.forEach((pr, idx) => {
      renderPage(pr, firstPageOfGallery, idx + 1, pages.length)
      firstPageOfGallery = false
    })
  }

  return doc.output('blob')
}
