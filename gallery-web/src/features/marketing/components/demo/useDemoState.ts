import { useCallback, useEffect, useRef, useState } from 'react'
import { exportFeed, feedFromPhotos, IG_LAYOUTS, type FeedItem, type PhotoItem } from './igFeed'

export type DemoView = 'grid' | 'stories' | 'instagram'
export type StoryStyle = 'clean' | 'dynamic' | 'vintage'
interface Section { name: string; ids: Set<string> }

const toggled = (set: Set<string>, id: string) => {
  const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** All state + actions of the fullscreen editor demo (nothing leaves the browser). */
export function useDemoState(samplePhotos: string[]) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [topPicks, setTopPicks] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'picks'>('all')
  const [published, setPublished] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [view, setView] = useState<DemoView>('grid')
  const [igLayout, setIgLayout] = useState('1x3')
  const [igExporting, setIgExporting] = useState(false)
  const [igFeed, setIgFeed] = useState<FeedItem[]>([])
  const [igDragIdx, setIgDragIdx] = useState<number | null>(null)
  const [storyStyle, setStoryStyle] = useState<StoryStyle>('clean')
  const [storyDuration, setStoryDuration] = useState(15)
  const [dragId, setDragId] = useState<string | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [newSecName, setNewSecName] = useState('')
  const [activeSection, setActiveSection] = useState<number | null>(null)
  // T/Escape only act while the pointer is over the demo.
  const hoverRef = useRef(false)

  const loadSamples = useCallback(() => {
    setPhotos(samplePhotos.map((url, i) => ({ id: `s-${i}`, url })))
    setSelected(new Set()); setTopPicks(new Set()); setFilter('all')
    setPublished(false); setView('grid'); setFullscreen(true)
  }, [samplePhotos])

  const addFiles = useCallback((files: FileList) => {
    const items: PhotoItem[] = []
    const max = 30 - photos.length
    for (let i = 0; i < Math.min(files.length, max); i++) {
      if (!files[i].type.startsWith('image/')) continue
      items.push({ id: `u-${Date.now()}-${i}`, url: URL.createObjectURL(files[i]) })
    }
    setPhotos(p => [...p, ...items]); setFullscreen(true)
  }, [photos.length])

  const toggleSelect = useCallback((id: string) => setSelected(prev => toggled(prev, id)), [])

  useEffect(() => {
    if (!fullscreen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [fullscreen])

  // T toggles top pick on the selection and moves it to the top; Escape exits.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!hoverRef.current || selected.size === 0) return
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        const sel = [...selected]
        setTopPicks(prev => {
          const n = new Set(prev)
          const allPicked = sel.every(id => n.has(id))
          sel.forEach(id => { if (allPicked) n.delete(id); else n.add(id) })
          return n
        })
        setPhotos(prev => [...prev.filter(p => sel.includes(p.id)), ...prev.filter(p => !sel.includes(p.id))])
        setSelected(new Set())
      }
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

  const dropOnPhoto = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) return
    setPhotos(prev => {
      const from = prev.findIndex(p => p.id === dragId)
      const to = prev.findIndex(p => p.id === targetId)
      return from < 0 || to < 0 ? prev : moveItem(prev, from, to)
    })
    setDragId(null)
  }, [dragId])

  useEffect(() => {
    if (view === 'instagram' && igFeed.length === 0 && photos.length > 0) setIgFeed(feedFromPhotos(photos))
  }, [view, photos, igFeed.length])

  const splitFeedItem = useCallback((feedIdx: number) => {
    const lay = IG_LAYOUTS.find(l => l.id === igLayout) || IG_LAYOUTS[0]
    setIgFeed(prev => {
      const item = prev[feedIdx]
      if (!item || item.isTile) return prev
      const tiles: FeedItem[] = []
      for (let r = 0; r < lay.rows; r++)
        for (let c = 0; c < lay.cols; c++)
          tiles.push({ id: `tile-${feedIdx}-${r}-${c}`, url: item.url, isTile: true, tileRow: r, tileCol: c, tileRows: lay.rows, tileCols: lay.cols })
      const next = [...prev]
      next.splice(feedIdx, 1, ...tiles)
      return next
    })
  }, [igLayout])

  const dropOnFeedItem = useCallback((targetIdx: number) => {
    if (igDragIdx === null || igDragIdx === targetIdx) return
    setIgFeed(prev => moveItem(prev, igDragIdx, targetIdx))
    setIgDragIdx(null)
  }, [igDragIdx])

  const exportAll = useCallback(async () => {
    setIgExporting(true)
    await exportFeed(igFeed)
    setIgExporting(false)
  }, [igFeed])

  const addSection = useCallback(() => {
    if (!newSecName.trim()) return
    setSections(p => [...p, { name: newSecName.trim(), ids: new Set(selected) }])
    setNewSecName(''); setSelected(new Set())
  }, [newSecName, selected])

  let visible = filter === 'picks' ? photos.filter(p => topPicks.has(p.id)) : photos
  if (activeSection !== null && sections[activeSection]) {
    visible = visible.filter(p => sections[activeSection].ids.has(p.id))
  }

  return {
    photos, visible, selected, topPicks, filter, published, fullscreen, view, sections, newSecName, activeSection,
    igLayout, igExporting, igFeed, storyStyle, storyDuration, hoverRef,
    storyPhotos: photos.filter(p => topPicks.has(p.id)),
    setFilter, setPublished, setFullscreen, setView, setNewSecName, setActiveSection, setIgLayout, setIgFeed,
    setIgDragIdx, setStoryStyle, setStoryDuration, setDragId,
    loadSamples, addFiles, toggleSelect, dropOnPhoto, splitFeedItem, dropOnFeedItem, exportAll, addSection,
    resetFeed: () => setIgFeed(feedFromPhotos(photos)),
  }
}

export type DemoState = ReturnType<typeof useDemoState>
