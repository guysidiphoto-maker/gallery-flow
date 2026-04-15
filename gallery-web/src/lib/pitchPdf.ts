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

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
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

  const imgW = (contentW - 4) / 2  // 2 columns with 4mm gap
  const imgH = imgW * 0.67         // 3:2 aspect ratio
  const gap = 4

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

    const base64 = await loadImageAsBase64(photos[i])
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
