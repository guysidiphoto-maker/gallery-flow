import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StoryPreview } from './StoryPreview'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DemoProps { samplePhotos: string[]; lang: 'en' | 'he'; galleryUrl: string }
interface PhotoItem { id: string; url: string }

// Instagram standard: grid is ALWAYS 3 columns. Splits must span full rows.
const IG_LAYOUTS = [
  { id: '1x3', rows: 1, cols: 3, tiles: 3, label: '1\u00d73' },   // 1 row = 3 posts
  { id: '2x3', rows: 2, cols: 3, tiles: 6, label: '2\u00d73' },   // 2 rows = 6 posts
  { id: '3x3', rows: 3, cols: 3, tiles: 9, label: '3\u00d73' },   // 3 rows = 9 posts
]

function SplitPreview({ src, rows, cols }: { src: string; rows: number; cols: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 3, width: '100%', maxWidth: 280, aspectRatio: cols >= rows ? `${cols}/${rows}` : `1/${rows/cols}`, margin: '0 auto' }}>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const r = Math.floor(i / cols), c = i % cols
        return (<div key={i} style={{ overflow: 'hidden', borderRadius: 4, position: 'relative', background: 'rgba(255,255,255,.03)' }}>
          <img src={src} alt="" draggable={false} crossOrigin="anonymous" style={{ position: 'absolute', width: `${cols*100}%`, height: `${rows*100}%`, left: `${-c*100}%`, top: `${-r*100}%`, objectFit: 'cover' }} />
        </div>)
      })}
    </div>
  )
}

async function exportSplitTiles(src: string, rows: number, cols: number) {
  const img = new Image(); img.crossOrigin = 'anonymous'
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = src })
  const tw = Math.floor(img.width / cols), th = Math.floor(img.height / rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cv = document.createElement('canvas'); cv.width = tw; cv.height = th
    cv.getContext('2d')!.drawImage(img, c*tw, r*th, tw, th, 0, 0, tw, th)
    const blob = await new Promise<Blob|null>(res => cv.toBlob(res, 'image/jpeg', 0.92))
    if (!blob) continue
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `grid_${r+1}x${c+1}.jpg`; a.click(); URL.revokeObjectURL(a.href)
    await new Promise(r => setTimeout(r, 200))
  }
}

/* ---- Translations ---- */
const tx = {
  en: {
    title: 'Try it live', sub: 'Load sample photos or drop yours. Full screen experience.',
    loadSample: 'Load sample photos', dropOr: 'or drop yours here', chooseFiles: 'Choose files',
    dropNote: 'Nothing leaves your device.', allPhotos: 'All Photos', topPicks: 'Top Picks',
    stories: 'Create Story', instagram: 'IG Grid', publish: 'Publish',
    published: 'Published!', backToEditor: 'Back', backToGrid: '\u2190 Back',
    storiesTitle: 'AI Story Generator', storiesMin: 'Mark at least 10 top picks with T to generate a story',
    generating: 'Generating story...', storyReady: 'Story ready!', downloadStory: 'Download Story',
    igTitle: 'Instagram Grid Split', igPick: 'Pick a photo to split',
    igExport: 'Export tiles', igExporting: 'Exporting...', changePhoto: 'Change',
    photos: 'photos', selected: 'selected', picks: 'picks',
    hint: 'Click = Select \u00b7 T = Top Pick (jumps to top) \u00b7 Drag to reorder',
    exitDemo: 'Exit demo',
  },
  he: {
    title: '\u05ea\u05e0\u05e1\u05d4 \u05d1\u05dc\u05d9\u05d9\u05d1', sub: '\u05d8\u05e2\u05df \u05ea\u05de\u05d5\u05e0\u05d5\u05ea \u05d3\u05d5\u05d2\u05de\u05d4 \u05d0\u05d5 \u05d2\u05e8\u05d5\u05e8 \u05de\u05e9\u05dc\u05da. \u05d7\u05d5\u05d5\u05d9\u05d4 \u05de\u05dc\u05d0\u05d4.',
    loadSample: '\u05d8\u05e2\u05df \u05d3\u05d5\u05d2\u05de\u05d0\u05d5\u05ea', dropOr: '\u05d0\u05d5 \u05d2\u05e8\u05d5\u05e8 \u05dc\u05db\u05d0\u05df', chooseFiles: '\u05d1\u05d7\u05e8 \u05e7\u05d1\u05e6\u05d9\u05dd',
    dropNote: '\u05e9\u05d5\u05dd \u05d3\u05d1\u05e8 \u05dc\u05d0 \u05e2\u05d5\u05d6\u05d1 \u05d0\u05ea \u05d4\u05de\u05db\u05e9\u05d9\u05e8.',
    allPhotos: '\u05db\u05dc \u05d4\u05ea\u05de\u05d5\u05e0\u05d5\u05ea', topPicks: '\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd',
    stories: '\u05e6\u05d5\u05e8 \u05e1\u05d8\u05d5\u05e8\u05d9', instagram: '\u05d2\u05e8\u05d9\u05d3 IG',
    publish: '\u05e4\u05e8\u05e1\u05dd', published: '\u05e4\u05d5\u05e8\u05e1\u05dd!',
    backToEditor: '\u05d7\u05d6\u05e8\u05d4', backToGrid: '\u2190 \u05d7\u05d6\u05e8\u05d4',
    storiesTitle: '\u05de\u05d7\u05d5\u05dc\u05dc \u05e1\u05d8\u05d5\u05e8\u05d9\u05d6 AI',
    storiesMin: '\u05e1\u05de\u05df \u05dc\u05e4\u05d7\u05d5\u05ea 10 \u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd \u05e2\u05dd T \u05db\u05d3\u05d9 \u05dc\u05d9\u05d9\u05e6\u05e8 \u05e1\u05d8\u05d5\u05e8\u05d9',
    generating: '\u05de\u05d9\u05d9\u05e6\u05e8 \u05e1\u05d8\u05d5\u05e8\u05d9...', storyReady: '\u05d4\u05e1\u05d8\u05d5\u05e8\u05d9 \u05de\u05d5\u05db\u05df!',
    downloadStory: '\u05d4\u05d5\u05e8\u05d3 \u05e1\u05d8\u05d5\u05e8\u05d9',
    igTitle: '\u05d2\u05e8\u05d9\u05d3 \u05d0\u05d9\u05e0\u05e1\u05d8\u05d2\u05e8\u05dd', igPick: '\u05d1\u05d7\u05e8 \u05ea\u05de\u05d5\u05e0\u05d4 \u05dc\u05e4\u05d9\u05e6\u05d5\u05dc',
    igExport: '\u05d9\u05d9\u05e6\u05d5\u05d0', igExporting: '\u05de\u05d9\u05d9\u05e6\u05d0...', changePhoto: '\u05d4\u05d7\u05dc\u05e3',
    photos: '\u05ea\u05de\u05d5\u05e0\u05d5\u05ea', selected: '\u05e0\u05d1\u05d7\u05e8\u05d5', picks: '\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd',
    hint: '\u05dc\u05d7\u05d9\u05e6\u05d4 = \u05d1\u05d7\u05d9\u05e8\u05d4 \u00b7 T = \u05de\u05d5\u05e2\u05d3\u05e3 (\u05e7\u05d5\u05e4\u05e5 \u05dc\u05de\u05e2\u05dc\u05d4) \u00b7 \u05d2\u05e8\u05d5\u05e8 \u05dc\u05e1\u05d9\u05d3\u05d5\u05e8',
    exitDemo: '\u05e6\u05d0 \u05de\u05d4\u05d3\u05de\u05d5',
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function InteractiveDemo({ samplePhotos, lang, galleryUrl }: DemoProps) {
  const t = tx[lang]
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [topPicks, setTopPicks] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all'|'picks'>('all')
  const [published, setPublished] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [view, setView] = useState<'grid'|'stories'|'instagram'>('grid')
  const [igPhoto, setIgPhoto] = useState<string|null>(null)
  const [igLayout, setIgLayout] = useState('1x3')
  const [igExporting, setIgExporting] = useState(false)
  // IG feed: array of grid cells. Each is either a full photo or a tile (portion of a split photo).
  const [igFeed, setIgFeed] = useState<{id:string;url:string;isTile?:boolean;tileRow?:number;tileCol?:number;tileRows?:number;tileCols?:number}[]>([])
  const [igDragIdx, setIgDragIdx] = useState<number|null>(null)
  const [storyStyle, setStoryStyle] = useState<'clean'|'dynamic'|'vintage'>('clean')
  const [storyDuration, setStoryDuration] = useState(15)
  const [dragId, setDragId] = useState<string|null>(null)
  const [sections, setSections] = useState<{name:string;ids:Set<string>}[]>([])
  const [newSecName, setNewSecName] = useState('')
  const [activeSection, setActiveSection] = useState<number|null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const hoverRef = useRef(false)

  const loadSamples = useCallback(() => {
    setPhotos(samplePhotos.map((url, i) => ({ id: `s-${i}`, url })))
    setSelected(new Set()); setTopPicks(new Set()); setFilter('all')
    setPublished(false); setLoaded(true); setView('grid'); setFullscreen(true)
  }, [samplePhotos])

  const addFiles = useCallback((files: FileList) => {
    const items: PhotoItem[] = []
    const max = 30 - photos.length
    for (let i = 0; i < Math.min(files.length, max); i++) {
      if (!files[i].type.startsWith('image/')) continue
      items.push({ id: `u-${Date.now()}-${i}`, url: URL.createObjectURL(files[i]) })
    }
    setPhotos(p => [...p, ...items]); setLoaded(true); setFullscreen(true)
  }, [photos.length])

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])

  // Lock body scroll when fullscreen demo is open
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [fullscreen])

  // T key: toggle top pick AND move to top of gallery
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
        // Move selected photos to the TOP of the gallery
        setPhotos(prev => {
          const picked = prev.filter(p => sel.includes(p.id))
          const rest = prev.filter(p => !sel.includes(p.id))
          return [...picked, ...rest]
        })
        // Clear selection after marking
        setSelected(new Set())
      }
      if (e.key === 'Escape') { setFullscreen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

  // Drag to reorder
  const onPhotoDragStart = useCallback((id: string) => setDragId(id), [])
  const onPhotoDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])
  const onPhotoDrop = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) return
    setPhotos(prev => {
      const arr = [...prev]
      const fromIdx = arr.findIndex(p => p.id === dragId)
      const toIdx = arr.findIndex(p => p.id === targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
    setDragId(null)
  }, [dragId])

  const handleIgExport = useCallback(async () => {
    if (!igPhoto) return
    setIgExporting(true)
    const lay = IG_LAYOUTS.find(l => l.id === igLayout) || IG_LAYOUTS[0]
    try { await exportSplitTiles(igPhoto, lay.rows, lay.cols) } catch {}
    setIgExporting(false)
  }, [igPhoto, igLayout])

  // Build IG feed when entering IG view
  useEffect(() => {
    if (view === 'instagram' && igFeed.length === 0 && photos.length > 0) {
      setIgFeed(photos.slice(0, 15).map((p, i) => ({ id: `ig-${i}`, url: p.url })))
    }
  }, [view, photos, igFeed.length])

  // Split a photo in the IG feed
  const splitPhotoInFeed = useCallback((feedIdx: number) => {
    const lay = IG_LAYOUTS.find(l => l.id === igLayout) || IG_LAYOUTS[0]
    setIgFeed(prev => {
      const item = prev[feedIdx]
      if (!item || item.isTile) return prev
      const tiles = []
      for (let r = 0; r < lay.rows; r++)
        for (let c = 0; c < lay.cols; c++)
          tiles.push({ id: `tile-${feedIdx}-${r}-${c}`, url: item.url, isTile: true, tileRow: r, tileCol: c, tileRows: lay.rows, tileCols: lay.cols })
      const next = [...prev]
      next.splice(feedIdx, 1, ...tiles)
      return next
    })
    setIgPhoto(null)
  }, [igLayout])

  // Drag reorder in IG feed
  const igDragDrop = useCallback((targetIdx: number) => {
    if (igDragIdx === null || igDragIdx === targetIdx) return
    setIgFeed(prev => {
      const arr = [...prev]
      const [item] = arr.splice(igDragIdx, 1)
      arr.splice(targetIdx, 0, item)
      return arr
    })
    setIgDragIdx(null)
  }, [igDragIdx])

  let visible = filter === 'picks' ? photos.filter(p => topPicks.has(p.id)) : photos
  if (activeSection !== null && sections[activeSection]) {
    visible = visible.filter(p => sections[activeSection].ids.has(p.id))
  }
  const storyPhotos = photos.filter(p => topPicks.has(p.id))
  const curIgLayout = IG_LAYOUTS.find(l => l.id === igLayout) || IG_LAYOUTS[0]

  // ---- Render ----
  if (!fullscreen) {
    // Compact CTA with app preview background
    return (
      <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', padding: '64px 24px', textAlign: 'center' }}>
        {/* Background: grid of sample photos blurred */}
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3, opacity: 0.15,
          filter: 'blur(2px)', pointerEvents: 'none',
        }}>
          {samplePhotos.slice(0, 15).map((url, i) => (
            <img key={i} src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,10,15,.7), rgba(10,10,15,.9))', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="lp-section-title">{t.title}</h2>
          <p className="lp-section-sub">{t.sub}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-glow btn-lg" onClick={loadSamples}>{t.loadSample}</button>
            <button className="btn btn-ghost btn-lg" onClick={() => fileRef.current?.click()}>{t.chooseFiles}</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files) addFiles(e.target.files) }} />
      </div>
    )
  }

  // Use a portal to render fullscreen demo directly under document.body,
  // bypassing any CSS containment (overflow, filter, transform) from parents.
  return createPortal(
    <div className="lp-demo-fullscreen" dir={lang === 'he' ? 'rtl' : 'ltr'} onMouseEnter={() => { hoverRef.current = true }} onMouseLeave={() => { hoverRef.current = false }}>
      {/* Top bar */}
      <div className="lp-demo-topbar">
        <span className="lp-demo-topbar-brand">Pixflow Demo</span>
        <span className="lp-demo-topbar-stats">
          {photos.length} {t.photos} &middot; {selected.size} {t.selected} &middot; {topPicks.size} {t.picks}
        </span>
        <button className="lp-demo-topbar-exit" onClick={() => setFullscreen(false)}>{t.exitDemo}</button>
      </div>

      <div className="lp-demo-body">
        {/* Sidebar */}
        <div className="lp-demo-sidebar">
          <button className={`lp-demo-sb ${view==='grid'&&filter==='all'?'lp-demo-sb--a':''}`} onClick={() => {setFilter('all');setView('grid')}}>{t.allPhotos} ({photos.length})</button>
          <button className={`lp-demo-sb ${view==='grid'&&filter==='picks'?'lp-demo-sb--a':''}`} onClick={() => {setFilter('picks');setView('grid')}}>{t.topPicks} ({topPicks.size})</button>
          <div className="lp-demo-div" />
          {/* Sections */}
          <div style={{fontSize:'0.7rem',color:'rgba(255,255,255,.3)',padding:'4px 10px 2px',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            {lang==='he'?'\u05e1\u05e7\u05e9\u05e0\u05d9\u05dd':'Sections'}
          </div>
          {sections.map((sec, idx) => (
            <button key={idx} className={`lp-demo-sb ${activeSection===idx&&view==='grid'?'lp-demo-sb--a':''}`}
              onClick={() => {setActiveSection(activeSection===idx?null:idx);setFilter('all');setView('grid')}}>
              {sec.name} ({sec.ids.size})
            </button>
          ))}
          <div style={{display:'flex',gap:4,padding:'0 4px'}}>
            <input value={newSecName} onChange={e=>setNewSecName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&newSecName.trim()){setSections(p=>[...p,{name:newSecName.trim(),ids:new Set(selected)}]);setNewSecName('');setSelected(new Set())}}}
              placeholder={lang==='he'?'\u05e1\u05e7\u05e9\u05df \u05d7\u05d3\u05e9...':'New section...'}
              style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.03)',color:'#fff',fontSize:'0.75rem',fontFamily:'inherit',outline:'none'}} />
          </div>
          <div className="lp-demo-div" />
          <button className={`lp-demo-sb ${view==='stories'?'lp-demo-sb--a':''}`} onClick={() => {setView('stories');setActiveSection(null)}}>{t.stories}</button>
          <button className={`lp-demo-sb ${view==='instagram'?'lp-demo-sb--a':''}`} onClick={() => {setView('instagram');setActiveSection(null)}}>{t.instagram}</button>
          <div className="lp-demo-div" />
          {!published ? (
            <button className="lp-demo-pub" onClick={() => { window.open(galleryUrl,'_blank'); setPublished(true) }}>{t.publish}</button>
          ) : (
            <><div style={{color:'#28c840',fontSize:'0.8rem',textAlign:'center'}}>{t.published}</div>
            <button className="lp-demo-sb" onClick={() => setPublished(false)}>{t.backToEditor}</button></>
          )}
        </div>

        {/* Main */}
        <div className="lp-demo-main">
          {view === 'grid' ? (
            <div className="lp-demo-grid" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
              {visible.map((p, i) => (
                <div key={p.id}
                  className={`lp-demo-ph ${selected.has(p.id)?'lp-demo-ph--sel':''}`}
                  onClick={() => toggleSelect(p.id)}
                  draggable
                  onDragStart={() => onPhotoDragStart(p.id)}
                  onDragOver={onPhotoDragOver}
                  onDrop={(e) => { e.stopPropagation(); onPhotoDrop(p.id) }}
                  style={{ animationDelay: `${i*30}ms` }}>
                  <img src={p.url} alt="" loading="lazy" draggable={false} />
                  {selected.has(p.id) && <span className="lp-demo-ck">&#10003;</span>}
                  {topPicks.has(p.id) && <span className="lp-demo-st">&#9733;</span>}
                </div>
              ))}
            </div>
          ) : view === 'stories' ? (
            <div className="lp-demo-stories-panel" style={{padding:20}}>
              <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:16}}>{t.storiesTitle}</h3>

              {storyPhotos.length < 3 ? (
                <p style={{color:'rgba(255,255,255,.4)',margin:'32px 0',fontSize:'0.85rem'}}>
                  {lang==='he'?'\u05e1\u05de\u05df \u05dc\u05e4\u05d7\u05d5\u05ea 3 \u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd \u05e2\u05dd T':'Mark at least 3 top picks with T'}
                </p>
              ) : (
                <div>
                  {/* Style + Duration selectors */}
                  <div style={{display:'flex',gap:16,marginBottom:16,flexWrap:'wrap'}}>
                    <div style={{flex:1,minWidth:120}}>
                      <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>
                        {lang==='he'?'\u05e1\u05d2\u05e0\u05d5\u05df':'Style'}
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        {(['clean','dynamic','vintage'] as const).map(s => (
                          <button key={s} className={`lp-demo-ig-lb ${storyStyle===s?'lp-demo-ig-lb--a':''}`}
                            onClick={() => setStoryStyle(s)} style={{flex:1,textAlign:'center',padding:'6px 0',fontSize:'0.75rem'}}>
                            {s==='clean'?'Clean':s==='dynamic'?'Dynamic':'Vintage'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:120}}>
                      <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>
                        {lang==='he'?'\u05de\u05e9\u05da':'Duration'}
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        {[10,15,20,30].map(d => (
                          <button key={d} className={`lp-demo-ig-lb ${storyDuration===d?'lp-demo-ig-lb--a':''}`}
                            onClick={() => setStoryDuration(d)} style={{flex:1,textAlign:'center',padding:'6px 0',fontSize:'0.75rem'}}>
                            {d}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Live preview */}
                  <StoryPreview
                    photos={storyPhotos.map(p => p.url)}
                    style={storyStyle}
                    duration={storyDuration}
                    lang={lang}
                  />
                </div>
              )}
              <button className="lp-demo-sb" style={{marginTop:10,display:'block',width:'100%',textAlign:'center'}} onClick={() => setView('grid')}>{t.backToGrid}</button>
            </div>
          ) : (
            <div className="lp-demo-ig-panel" style={{padding:16}}>
              {/* IG Profile */}
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div className="lp-ig-av">{photos[0] && <img src={photos[0].url} alt="" />}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.9rem'}}>your.studio</div>
                  <div style={{fontSize:'0.7rem',color:'rgba(255,255,255,.4)',marginTop:2}}>
                    {igFeed.length} posts &middot; 2.4K followers
                  </div>
                </div>
              </div>

              {/* Split controls */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontSize:'0.7rem',color:'rgba(255,255,255,.35)'}}>
                  {lang==='he'?'\u05dc\u05d7\u05e5 \u05ea\u05de\u05d5\u05e0\u05d4 \u05dc\u05e4\u05d9\u05e6\u05d5\u05dc, \u05d2\u05e8\u05d5\u05e8 \u05dc\u05e1\u05d9\u05d3\u05d5\u05e8':'Tap to split, drag to reorder'}
                </span>
                <div style={{marginInlineStart:'auto',display:'flex',gap:4}}>
                  {IG_LAYOUTS.map(l => (
                    <button key={l.id} className={`lp-demo-ig-lb ${igLayout===l.id?'lp-demo-ig-lb--a':''}`}
                      onClick={() => setIgLayout(l.id)}>{l.label}</button>
                  ))}
                </div>
              </div>

              {/* 3-column IG grid — padding-bottom trick for perfect squares */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:2,maxWidth:420,margin:'0 auto'}}>
                {igFeed.map((item, idx) => (
                  <div key={item.id}
                    className={item.isTile ? 'lp-ig-sq lp-ig-sq--tile' : 'lp-ig-sq'}
                    draggable
                    onDragStart={() => setIgDragIdx(idx)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); igDragDrop(idx) }}
                    onClick={() => { if (!item.isTile) splitPhotoInFeed(idx) }}
                  >
                    <div className="lp-ig-sq-inner">
                      {item.isTile ? (
                        <img src={item.url} alt="" draggable={false} style={{
                          position:'absolute',
                          width: `${(item.tileCols||1) * 100}%`,
                          height: `${(item.tileRows||1) * 100}%`,
                          left: `${-(item.tileCol||0) * 100}%`,
                          top: `${-(item.tileRow||0) * 100}%`,
                          objectFit: 'cover',
                        }} />
                      ) : (
                        <img src={item.url} alt="" draggable={false} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Export */}
              <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:12}}>
                <button className="lp-demo-pub" style={{fontSize:'0.8rem',padding:'8px 20px'}}
                  onClick={async () => {
                    setIgExporting(true)
                    // Export each cell as JPEG
                    for (const item of igFeed) {
                      try {
                        const img = new Image(); img.crossOrigin = 'anonymous'
                        await new Promise<void>((res,rej) => { img.onload=()=>res(); img.onerror=()=>rej(); img.src=item.url })
                        const cv = document.createElement('canvas'); const sz = 1080; cv.width=sz; cv.height=sz
                        const ctx = cv.getContext('2d')!
                        if (item.isTile) {
                          const cols=item.tileCols||1, rows=item.tileRows||1, c=item.tileCol||0, r=item.tileRow||0
                          const sw=img.width/cols, sh=img.height/rows
                          ctx.drawImage(img, c*sw, r*sh, sw, sh, 0, 0, sz, sz)
                        } else {
                          const s=Math.min(img.width,img.height)
                          ctx.drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, sz, sz)
                        }
                        const blob = await new Promise<Blob|null>(res => cv.toBlob(res,'image/jpeg',0.92))
                        if (blob) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`ig_post_${igFeed.indexOf(item)+1}.jpg`; a.click(); URL.revokeObjectURL(a.href) }
                        await new Promise(r=>setTimeout(r,200))
                      } catch {}
                    }
                    setIgExporting(false)
                  }}
                  disabled={igExporting || igFeed.length===0}>
                  {igExporting ? t.igExporting : (lang==='he'?'\u05d9\u05d9\u05e6\u05d0 \u05d4\u05db\u05dc':'Export all posts')}
                </button>
                <button className="lp-demo-sb" style={{fontSize:'0.8rem'}}
                  onClick={() => { setIgFeed(photos.slice(0,15).map((p,i)=>({id:`ig-${i}`,url:p.url}))); setIgPhoto(null) }}>
                  {lang==='he'?'\u05d0\u05e4\u05e1 \u05e4\u05d9\u05e6\u05d5\u05dc\u05d9\u05dd':'Reset splits'}
                </button>
              </div>
              <button className="lp-demo-sb" style={{marginTop:8,display:'block',width:'100%',textAlign:'center'}} onClick={() => {setView('grid');setIgFeed([])}}>{t.backToGrid}</button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="lp-demo-hint-bar">{t.hint}</div>
    </div>,
    document.body
  )
}
