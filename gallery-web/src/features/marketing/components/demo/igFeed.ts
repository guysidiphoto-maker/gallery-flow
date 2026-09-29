// Instagram grid is always 3 columns, so a split must span whole rows.
export const IG_LAYOUTS = [
  { id: '1x3', rows: 1, cols: 3, label: '1×3' },
  { id: '2x3', rows: 2, cols: 3, label: '2×3' },
  { id: '3x3', rows: 3, cols: 3, label: '3×3' },
]

export interface PhotoItem { id: string; url: string }

/** A feed cell: a whole photo, or one tile of a photo split across rows×cols. */
export interface FeedItem {
  id: string
  url: string
  isTile?: boolean
  tileRow?: number
  tileCol?: number
  tileRows?: number
  tileCols?: number
}

export const feedFromPhotos = (photos: PhotoItem[]): FeedItem[] =>
  photos.slice(0, 15).map((p, i) => ({ id: `ig-${i}`, url: p.url }))

/** Renders each feed cell to a 1080² JPEG and downloads it (sequentially). */
export async function exportFeed(feed: FeedItem[]) {
  for (const [index, item] of feed.entries()) {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous'
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = item.url })
      const cv = document.createElement('canvas'); const sz = 1080; cv.width = sz; cv.height = sz
      const ctx = cv.getContext('2d')!
      if (item.isTile) {
        const cols = item.tileCols || 1, rows = item.tileRows || 1, c = item.tileCol || 0, r = item.tileRow || 0
        const sw = img.width / cols, sh = img.height / rows
        ctx.drawImage(img, c * sw, r * sh, sw, sh, 0, 0, sz, sz)
      } else {
        const s = Math.min(img.width, img.height)
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, sz, sz)
      }
      const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/jpeg', 0.92))
      if (blob) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `ig_post_${index + 1}.jpg`; a.click(); URL.revokeObjectURL(a.href)
      }
      await new Promise(r => setTimeout(r, 200))
    } catch {}
  }
}
