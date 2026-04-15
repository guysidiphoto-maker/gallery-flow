import jsPDF from 'jspdf'

interface GalleryEntry {
  name: string
  eventType: string
  description: string
  images: string[] // thumbnail URLs
}

interface PdfOptions {
  intro: string
  businessName: string
  galleries: GalleryEntry[]
  summary: string
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
  const { intro, businessName, galleries, summary } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const margin = 20
  const contentW = pageW - margin * 2

  // ── Cover Page ──────────────────────────────────────────────────────────

  // Background
  doc.setFillColor(10, 10, 15)
  doc.rect(0, 0, pageW, pageH, 'F')

  // Accent bar
  doc.setFillColor(99, 102, 241)
  doc.rect(0, 0, pageW, 3, 'F')

  // Business name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(28)
  doc.text(businessName, pageW / 2, 80, { align: 'center' })

  // Divider
  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.5)
  doc.line(pageW / 2 - 30, 92, pageW / 2 + 30, 92)

  // Subtitle
  doc.setFontSize(14)
  doc.setTextColor(180, 180, 200)
  doc.text('Portfolio', pageW / 2, 104, { align: 'center' })

  // Summary
  if (summary) {
    doc.setFontSize(11)
    doc.setTextColor(160, 160, 180)
    const summaryLines = doc.splitTextToSize(summary, contentW - 20)
    doc.text(summaryLines, pageW / 2, 120, { align: 'center' })
  }

  // Gallery count
  doc.setFontSize(10)
  doc.setTextColor(130, 130, 150)
  doc.text(
    `${galleries.length} galleries | ${galleries.reduce((sum, g) => sum + g.images.length, 0)} selected photos`,
    pageW / 2,
    pageH - 40,
    { align: 'center' }
  )

  // Date
  const dateStr = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.text(dateStr, pageW / 2, pageH - 30, { align: 'center' })

  // ── Intro Page ────────────────────────────────────────────────────────

  if (intro) {
    doc.addPage()
    doc.setFillColor(10, 10, 15)
    doc.rect(0, 0, pageW, pageH, 'F')

    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text('About', margin, 35)

    doc.setDrawColor(99, 102, 241)
    doc.setLineWidth(0.3)
    doc.line(margin, 40, margin + 40, 40)

    doc.setFontSize(11)
    doc.setTextColor(200, 200, 210)
    const introLines = doc.splitTextToSize(intro, contentW)
    doc.text(introLines, margin, 52)
  }

  // ── Gallery Pages ─────────────────────────────────────────────────────

  for (const gallery of galleries) {
    doc.addPage()
    doc.setFillColor(10, 10, 15)
    doc.rect(0, 0, pageW, pageH, 'F')

    // Gallery title
    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text(gallery.name, margin, 30)

    // Event type badge
    if (gallery.eventType) {
      doc.setFontSize(9)
      doc.setTextColor(129, 140, 248)
      doc.text(gallery.eventType.replace(/-/g, ' '), margin, 38)
    }

    // Description
    let yOffset = 46
    if (gallery.description) {
      doc.setFontSize(10)
      doc.setTextColor(180, 180, 195)
      const descLines = doc.splitTextToSize(gallery.description, contentW)
      doc.text(descLines, margin, yOffset)
      yOffset += descLines.length * 5 + 8
    }

    // Image grid
    const imgSize = 40
    const gap = 4
    const cols = Math.floor((contentW + gap) / (imgSize + gap))
    let col = 0
    let row = 0

    for (let i = 0; i < Math.min(gallery.images.length, 20); i++) {
      const base64 = await loadImageAsBase64(gallery.images[i])
      if (!base64) continue

      const x = margin + col * (imgSize + gap)
      const y = yOffset + row * (imgSize + gap)

      // Check if we need a new page
      if (y + imgSize > pageH - margin) {
        doc.addPage()
        doc.setFillColor(10, 10, 15)
        doc.rect(0, 0, pageW, pageH, 'F')
        row = 0
        col = 0
        yOffset = margin
      }

      const finalX = margin + col * (imgSize + gap)
      const finalY = yOffset + row * (imgSize + gap)

      try {
        doc.addImage(base64, 'JPEG', finalX, finalY, imgSize, imgSize)
      } catch {
        // Skip broken images
      }

      col++
      if (col >= cols) {
        col = 0
        row++
      }
    }
  }

  return doc.output('blob')
}
