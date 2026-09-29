import type { ExportProgress } from './galleryExport'

/** Compact Hebrew status label for the in-button export progress. */
export function exportProgressLabel(p: ExportProgress): string {
  switch (p.phase) {
    case 'metadata':
      return 'טוען נתונים...'
    case 'downloading':
      return `מוריד ${p.current} / ${p.total}...`
    case 'zipping':
      return `יוצר ZIP ${p.current}%...`
    case 'saving':
      return 'שומר קובץ...'
    default:
      return 'מייצא...'
  }
}
