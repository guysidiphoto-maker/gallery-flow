import jsPDF from 'jspdf'

export interface PdfOptions {
  photos: string[]
  bgColor: string
  logoBase64?: string
  title?: string
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
 * Loads an image and crops it to match the target aspect ratio (like object-fit: cover),
 * then returns a base64 JPEG string sized to fit the target dimensions in the PDF.
 */
async function loadImageCropped(url: string, targetAspect: number, targetPx = 1200): Promise<string | null> {
  const img = await loadImage(url)
  if (!img) return null

  const srcAspect = img.width / img.height

  // Figure out the crop region in source coords (cover logic)
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (srcAspect > targetAspect) {
    // Source is wider — crop sides
    sw = img.height * targetAspect
    sx = (img.width - sw) / 2
  } else {
    // Source is taller — crop top/bottom
    sh = img.width / targetAspect
    sy = (img.height - sh) / 2
  }

  // Output canvas sized by targetPx (longest side)
  const outW = targetAspect >= 1 ? targetPx : Math.round(targetPx * targetAspect)
  const outH = targetAspect >= 1 ? Math.round(targetPx / targetAspect) : targetPx
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)

  try {
    return canvas.toDataURL('image/jpeg', 0.88)
  } catch {
    return null
  }
}

export async function generatePitchPdf(options: PdfOptions): Promise<Blob> {
  const { photos, bgColor, logoBase64, title, businessName } = options
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

  let y = 60

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageW / 2 - 25, y, 50, 25)
      y += 35
    } catch { y += 5 }
  }

  // Title
  if (title) {
    doc.setFontSize(26)
    if (dark) doc.setTextColor(255, 255, 255); else doc.setTextColor(20, 20, 30)
    doc.text(title, pageW / 2, y, { align: 'center' })
    y += 14
  }

  // Business name
  doc.setFontSize(13)
  if (dark) doc.setTextColor(160, 160, 180); else doc.setTextColor(100, 100, 120)
  doc.text(businessName, pageW / 2, y, { align: 'center' })
  y += 10

  // Accent line
  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.4)
  doc.line(pageW / 2 - 25, y, pageW / 2 + 25, y)
  y += 12

  // Photo count
  doc.setFontSize(11)
  if (dark) doc.setTextColor(130, 130, 150); else doc.setTextColor(140, 140, 160)
  doc.text(`${photos.length} photos`, pageW / 2, y, { align: 'center' })

  // Date at bottom
  const dateStr = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.setFontSize(9)
  doc.text(dateStr, pageW / 2, pageH - 20, { align: 'center' })

  // ── Photo Pages ─────────────────────────────────────────────────────

  const gap = 4
  const imgW = (contentW - gap) / 2   // 2 columns with gap
  const targetAspect = 3 / 2          // 3:2 landscape
  const imgH = imgW / targetAspect

  let col = 0
  let rowY = margin

  for (let i = 0; i < photos.length; i++) {
    // New page at start or when full
    if (i === 0 || rowY + imgH > pageH - margin) {
      if (i > 0) doc.addPage()
      paintBg()
      rowY = margin
      col = 0
    }

    const base64 = await loadImageCropped(photos[i], targetAspect)
    if (!base64) continue

    const x = margin + col * (imgW + gap)

    try {
      doc.addImage(base64, 'JPEG', x, rowY, imgW, imgH)
    } catch {
      // Skip broken images
    }

    col++
    if (col >= 2) {
      col = 0
      rowY += imgH + gap
    }
  }

  return doc.output('blob')
}
