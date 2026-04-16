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
}

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

/**
 * Loads image, draws to canvas at max 1600px on longest side, returns JPEG base64.
 * Preserves original aspect ratio (no cropping).
 */
async function loadImageAsBase64(url: string, maxSide = 1600): Promise<{ data: string; w: number; h: number } | null> {
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
    return { data: canvas.toDataURL('image/jpeg', 0.88), w, h }
  } catch {
    return null
  }
}

export async function generatePitchPdf(options: PdfOptions): Promise<Blob> {
  const { galleries, bgColor, logoBase64, businessName } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const margin = 16
  const contentW = pageW - margin * 2
  const dark = isDark(bgColor)
  const [bgR, bgG, bgB] = hexToRgb(bgColor)

  const paintBg = () => {
    doc.setFillColor(bgR, bgG, bgB)
    doc.rect(0, 0, pageW, pageH, 'F')
  }

  // ── Cover Page ──────────────────────────────────────────────────────

  paintBg()

  // Accent bar at top
  doc.setFillColor(99, 102, 241)
  doc.rect(0, 0, pageW, 2.5, 'F')

  let y = 80

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageW / 2 - 25, y, 50, 25)
      y += 35
    } catch { y += 5 }
  }

  // Business name big title
  doc.setFontSize(28)
  if (dark) doc.setTextColor(255, 255, 255); else doc.setTextColor(20, 20, 30)
  doc.text(businessName, pageW / 2, y, { align: 'center' })
  y += 12

  // Accent line
  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.4)
  doc.line(pageW / 2 - 25, y, pageW / 2 + 25, y)
  y += 12

  // Gallery/photo stats
  const totalPhotos = galleries.reduce((sum, g) => sum + g.photos.length, 0)
  doc.setFontSize(11)
  if (dark) doc.setTextColor(160, 160, 180); else doc.setTextColor(100, 100, 120)
  doc.text(`${galleries.length} events · ${totalPhotos} photos`, pageW / 2, y, { align: 'center' })

  // Date at bottom
  const dateStr = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.setFontSize(9)
  doc.text(dateStr, pageW / 2, pageH - 20, { align: 'center' })

  // ── Per-Gallery Pages ───────────────────────────────────────────────

  for (let gi = 0; gi < galleries.length; gi++) {
    const gallery = galleries[gi]
    if (gallery.photos.length === 0) continue

    doc.addPage()
    paintBg()

    // Title at top of first page of this gallery
    doc.setFontSize(20)
    if (dark) doc.setTextColor(255, 255, 255); else doc.setTextColor(20, 20, 30)
    doc.text(gallery.title || 'Gallery', margin, margin + 8)

    // Accent line under title
    doc.setDrawColor(99, 102, 241)
    doc.setLineWidth(0.4)
    doc.line(margin, margin + 13, margin + 40, margin + 13)

    let cursorY = margin + 22

    // Pre-load all images with their aspect ratios
    const gap = 4
    const colW = (contentW - gap) / 2

    // Two-column flow layout with aspect ratio preservation.
    // We fill by row: pair photos two at a time, using the same row height
    // equal to the smaller of their natural heights so they align nicely.
    const images: Array<{ data: string; w: number; h: number } | null> = []
    for (const url of gallery.photos) {
      images.push(await loadImageAsBase64(url))
    }

    let i = 0
    while (i < images.length) {
      const a = images[i]
      const b = i + 1 < images.length ? images[i + 1] : null
      if (!a) { i++; continue }

      // Compute display heights based on aspect ratio so each fills colW width
      const aH = colW / (a.w / a.h)
      const bH = b ? colW / (b.w / b.h) : 0

      // Use the MAX height so neither gets cropped. Remaining space stays empty.
      // Actually we preserve each image's own aspect — so they may have different heights
      // in the same row. Align tops to cursorY.
      const rowH = Math.max(aH, bH)

      // Check page break
      if (cursorY + rowH > pageH - margin) {
        doc.addPage()
        paintBg()
        cursorY = margin
      }

      try {
        doc.addImage(a.data, 'JPEG', margin, cursorY, colW, aH)
      } catch { /* skip */ }

      if (b) {
        try {
          doc.addImage(b.data, 'JPEG', margin + colW + gap, cursorY, colW, bH)
        } catch { /* skip */ }
      }

      cursorY += rowH + gap
      i += 2
    }
  }

  return doc.output('blob')
}
