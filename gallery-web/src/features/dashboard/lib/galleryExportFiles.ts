// Pure helpers for the gallery ZIP export: names, README text and the browser save.

export function safeFolderName(raw: string): string {
  // Keep Hebrew / Latin letters and digits; collapse the rest to "-".
  return (
    raw
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'gallery'
  )
}

export function uniqueFilename(name: string, sortOrder: number, used: Set<string>): string {
  let candidate = name
  if (used.has(candidate)) {
    const dot = candidate.lastIndexOf('.')
    const base = dot > 0 ? candidate.slice(0, dot) : candidate
    const ext = dot > 0 ? candidate.slice(dot) : ''
    candidate = `${base}-${sortOrder}${ext}`
  }
  used.add(candidate)
  return candidate
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoking synchronously can cancel a large download before the browser reads it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function buildReadme(galleryName: string, imageCount: number, exportedAt: string): string {
  return [
    '================================================================',
    `  Pixflow Gallery Export — ${galleryName}`,
    `  Exported: ${exportedAt}`,
    `  Photos:   ${imageCount}`,
    '================================================================',
    '',
    'STRUCTURE / מבנה הקובץ',
    '----------------------',
    '  photos/<section_name>/<sort_order>_<filename>.jpg',
    '      The original photos (falls back to the web preview when an',
    '      original was not uploaded to storage).',
    '',
    '  metadata.json',
    '      Full gallery shape: settings, sections, and the ordered',
    '      image list with section + top-pick flags. schema_version: 1.',
    '',
    '  README.txt',
    '      This file.',
    '',
    'RESTORE / שחזור',
    '---------------',
    '  This archive is portable: the photos are standard JPEG/PNG/etc.',
    '  files and metadata.json is plain JSON. Any future tool — Pixflow',
    '  or otherwise — can rebuild the gallery from these two pieces.',
    '',
    '  הקובץ הזה נייד: התמונות הן קבצי JPEG רגילים ו-metadata.json',
    '  הוא JSON פשוט. כל כלי עתידי (פיקספלו או אחר) יכול לשחזר את',
    '  הגלריה מהשניים האלה.',
    '',
    'NOTES / הערות',
    '-------------',
    '  - Images whose "served_from" is "web_preview" in metadata.json',
    '    are compressed copies (the original was never uploaded).',
    '  - Section folders use safe-slug names; the human-readable name',
    '    lives in metadata.json under sections[].name.',
    '',
  ].join('\n')
}
