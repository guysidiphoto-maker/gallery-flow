import { useState } from 'react'
import { exportGalleryAsZip, ExportCapExceededError, type ExportProgress } from '../lib/galleryExport'
import type { Confirm, Gallery, GalleryImage } from '../types'

// Browser-side portable ZIP of every original + metadata.json.
export function useGalleryExport(deps: {
  editingGallery: Gallery | null
  galleryImages: GalleryImage[]
  confirm: Confirm
}) {
  const { editingGallery, galleryImages, confirm } = deps
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)

  async function handleGalleryExport() {
    if (!editingGallery || exporting) return
    const count = galleryImages.length || editingGallery.image_count || 0
    if (count === 0) {
      alert('אין תמונות בגלריה לייצוא')
      return
    }
    const ok = await confirm({
      title: 'ייצוא הגלריה',
      body: `ייצא את כל ה-${count} תמונות? זה ייקח כמה דקות וייצור קובץ ZIP גדול.`,
      confirmLabel: 'ייצא',
    })
    if (!ok) return
    setExporting(true)
    setExportProgress({ phase: 'metadata', current: 0, total: 1 })
    try {
      const result = await exportGalleryAsZip(editingGallery.id, {
        onProgress: setExportProgress,
      })
      const tail = result.failedCount
        ? `\n(${result.failedCount} תמונות נכשלו ולא נכללו בקובץ)`
        : ''
      alert(`הייצוא הושלם: ${result.filename}${tail}`)
    } catch (err) {
      if (err instanceof ExportCapExceededError) {
        alert(
          `הגלריה גדולה מדי לייצוא בדפדפן (יותר מ-${Math.round(err.cap / 1024 / 1024 / 1024)}GB). ` +
            `נדרשת גרסת שרת — נשלח עדכון בקרוב.`,
        )
      } else {
        console.error('[exportGallery] failed:', err)
        alert(`שגיאה בייצוא הגלריה: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  return { exporting, exportProgress, handleGalleryExport }
}
