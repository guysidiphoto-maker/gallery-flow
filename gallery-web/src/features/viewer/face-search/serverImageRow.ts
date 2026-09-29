export interface ServerImageRow {
  id: string
  filename: string
  storage_path: string
  original_path: string | null
  thumbnail_path: string | null
  is_top_pick: boolean
  sort_order: number
  section_id: string | null
}

// The rekognition function is trusted, but its rows feed <img src> and download
// handlers, so a malformed response must not reach `images` state.
export function isServerImageRow(v: unknown): v is ServerImageRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  const isStr = (x: unknown) => typeof x === 'string'
  const isStrOrNull = (x: unknown) => x === null || typeof x === 'string'
  return (
    isStr(r.id) &&
    isStr(r.filename) &&
    isStr(r.storage_path) &&
    isStrOrNull(r.original_path) &&
    isStrOrNull(r.thumbnail_path) &&
    typeof r.is_top_pick === 'boolean' &&
    typeof r.sort_order === 'number' &&
    isStrOrNull(r.section_id)
  )
}
