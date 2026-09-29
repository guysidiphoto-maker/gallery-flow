import { useEffect, useState } from 'react'
import { imgUrl, type GalleryRow, type ImageRow } from './lib'

const TILES = 30

/** Up to 5 top picks per gallery (cover as fallback), repeated to at least 30 entries. */
export function buildMosaicPool(visible: GalleryRow[], topPicks: ImageRow[], covers: Map<string, string>): string[] {
  const pool: string[] = []
  visible.forEach(g => {
    const picks = topPicks.filter(p => p.gallery_id === g.id).slice(0, 5)
    if (picks.length === 0) {
      const cover = covers.get(g.id)
      if (cover) pool.push(cover)
      return
    }
    picks.forEach(p => pool.push(imgUrl(p.thumbnail_path || p.storage_path)))
  })
  while (pool.length > 0 && pool.length < TILES) {
    pool.push(pool[pool.length % pool.length])
  }
  return pool
}

/**
 * 30 hero tiles, initially shuffled without duplicates, swapping one tile every
 * 2s. Only restarts when the pick/gallery counts change, not on every render.
 */
export function useMosaic(pool: string[], topPickCount: number, visibleCount: number) {
  const [tiles, setTiles] = useState<string[]>([])

  useEffect(() => {
    if (pool.length === 0) return
    const shuffled = [...pool].sort(() => Math.random() - .5)
    const unique: string[] = []
    for (const url of shuffled) {
      if (!unique.includes(url)) unique.push(url)
      if (unique.length >= TILES) break
    }
    while (unique.length < TILES && pool.length > 0) {
      unique.push(pool[unique.length % pool.length])
    }
    setTiles(unique)

    const interval = setInterval(() => {
      setTiles(prev => {
        const next = [...prev]
        const tileIdx = Math.floor(Math.random() * TILES)
        // Prefer an image not already on screen; otherwise anything but the current one.
        const candidates = pool.filter(url => !next.includes(url))
        if (candidates.length > 0) {
          next[tileIdx] = candidates[Math.floor(Math.random() * candidates.length)]
        } else {
          const others = pool.filter(url => url !== next[tileIdx])
          if (others.length > 0) next[tileIdx] = others[Math.floor(Math.random() * others.length)]
        }
        return next
      })
    }, 2000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topPickCount, visibleCount])

  return tiles
}
