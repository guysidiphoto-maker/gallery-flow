import { useState, useCallback, useEffect } from 'react'
import { PostEditor, type ScheduledPost } from './PostEditor'

// ─── Types ──────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}
interface ImageRow {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null; is_top_pick: boolean
}

interface SocialManagerProps {
  galleries: GalleryRow[]
  allImages: ImageRow[]
  topPicks: ImageRow[]
  clientId: string
  storageUrl: (bucket: string, path: string) => string
}

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

const TONES = [
  { key: 'professional', label: 'מקצועי' },
  { key: 'casual', label: 'שיחתי' },
  { key: 'creative', label: 'יצירתי' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function SocialManager({ galleries, allImages, topPicks, clientId, storageUrl: supaStorageUrl }: SocialManagerProps) {
  const imgUrl = (path: string | null) => path ? supaStorageUrl('gallery-images', path) : ''

  // ── State ─────────────────────────────────────────────────────────────

  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [tone, setTone] = useState<string>('professional')
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [generatingSingle, setGeneratingSingle] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [view, setView] = useState<'grid' | 'calendar'>('grid')

  // ── Load/save from localStorage ───────────────────────────────────────

  const storageKey = `social-schedule-${clientId}`

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ScheduledPost[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPosts(parsed)
          return
        }
      } catch { /* ignore */ }
    }
    // Initialize from top picks
    const initial: ScheduledPost[] = topPicks.slice(0, 30).map(img => {
      const gal = galleries.find(g => g.id === img.gallery_id)
      return {
        imageId: img.id,
        galleryId: img.gallery_id,
        galleryName: gal?.name || '',
        eventType: readStr(gal?.delivery_settings || null, 'eventType'),
        filename: img.filename,
        imageUrl: imgUrl(img.thumbnail_path || img.storage_path),
        caption: '',
        scheduledDate: '',
        scheduledTime: '10:00',
        status: 'draft',
      }
    })
    setPosts(initial)
  }, [])

  useEffect(() => {
    if (posts.length > 0) localStorage.setItem(storageKey, JSON.stringify(posts))
  }, [posts, storageKey])

  // ── Post CRUD ─────────────────────────────────────────────────────────

  const updatePost = useCallback((updated: ScheduledPost) => {
    setPosts(prev => prev.map(p => p.imageId === updated.imageId ? updated : p))
  }, [])

  const addPhotos = (images: ImageRow[]) => {
    const existing = new Set(posts.map(p => p.imageId))
    const newPosts: ScheduledPost[] = images
      .filter(img => !existing.has(img.id))
      .map(img => {
        const gal = galleries.find(g => g.id === img.gallery_id)
        return {
          imageId: img.id,
          galleryId: img.gallery_id,
          galleryName: gal?.name || '',
          eventType: readStr(gal?.delivery_settings || null, 'eventType'),
          filename: img.filename,
          imageUrl: imgUrl(img.thumbnail_path || img.storage_path),
          caption: '',
          scheduledDate: '',
          scheduledTime: '10:00',
          status: 'draft' as const,
        }
      })
    setPosts(prev => [...prev, ...newPosts])
  }

  const removePost = (imageId: string) => {
    setPosts(prev => prev.filter(p => p.imageId !== imageId))
    if (selectedPostId === imageId) setSelectedPostId(null)
  }

  // ── Drag & drop reorder ───────────────────────────────────────────────

  const onDragStart = useCallback((idx: number) => setDragIdx(idx), [])
  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])
  const onDrop = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    setPosts(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDragIdx(null); setDragOverIdx(null)
  }, [dragIdx])

  // ── AI captions ───────────────────────────────────────────────────────

  const generateAllCaptions = async () => {
    const postsWithoutCaptions = posts.filter(p => !p.caption.trim())
    if (postsWithoutCaptions.length === 0) return
    setGeneratingCaptions(true)
    try {
      const res = await fetch('/api/generate-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: postsWithoutCaptions.map(p => ({
            eventType: p.eventType,
            galleryName: p.galleryName,
            filename: p.filename,
          })),
          language: 'he',
          tone,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const { captions } = await res.json()
      if (Array.isArray(captions)) {
        setPosts(prev => {
          const next = [...prev]
          let ci = 0
          for (let i = 0; i < next.length; i++) {
            if (!next[i].caption.trim() && ci < captions.length) {
              next[i] = { ...next[i], caption: captions[ci] }
              ci++
            }
          }
          return next
        })
      }
    } catch { /* silent */ }
    finally { setGeneratingCaptions(false) }
  }

  const generateSingleCaption = async (post: ScheduledPost) => {
    setGeneratingSingle(true)
    try {
      const res = await fetch('/api/generate-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: [{ eventType: post.eventType, galleryName: post.galleryName, filename: post.filename }],
          language: 'he',
          tone,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const { captions } = await res.json()
      if (captions?.[0]) updatePost({ ...post, caption: captions[0] })
    } catch { /* silent */ }
    finally { setGeneratingSingle(false) }
  }

  // ── Auto-schedule (distribute dates starting from today) ──────────────

  const autoSchedule = () => {
    const today = new Date()
    const days = [1, 3, 5] // Mon, Wed, Fri
    let weekOffset = 0
    let dayIdx = 0
    setPosts(prev => prev.map(p => {
      const d = new Date(today)
      d.setDate(d.getDate() + weekOffset * 7 + days[dayIdx])
      dayIdx++
      if (dayIdx >= days.length) { dayIdx = 0; weekOffset++ }
      return { ...p, scheduledDate: d.toISOString().split('T')[0], status: 'scheduled' as const }
    }))
  }

  // ── Derived ───────────────────────────────────────────────────────────

  const selectedPost = posts.find(p => p.imageId === selectedPostId) || null
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length
  const withCaptions = posts.filter(p => p.caption.trim()).length

  // ── Calendar grouped by week ──────────────────────────────────────────

  const scheduledByDate = posts
    .filter(p => p.scheduledDate)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  const weeks: { label: string; posts: ScheduledPost[] }[] = []
  scheduledByDate.forEach(p => {
    const d = new Date(p.scheduledDate)
    const weekNum = Math.ceil((d.getDate()) / 7)
    const monthName = d.toLocaleDateString('he-IL', { month: 'long' })
    const label = `שבוע ${weekNum} · ${monthName}`
    const existing = weeks.find(w => w.label === label)
    if (existing) existing.posts.push(p)
    else weeks.push({ label, posts: [p] })
  })

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl', display: 'flex', height: 'calc(100vh - 140px)', minHeight: 0 }}>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.06)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          background: 'rgba(255,255,255,.01)',
        }}>
          {/* View toggle */}
          <div style={{
            display: 'flex', gap: 2, padding: 2, borderRadius: 8,
            background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.05)',
          }}>
            <button onClick={() => setView('grid')} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
              background: view === 'grid' ? 'rgba(99,102,241,.2)' : 'transparent',
              color: view === 'grid' ? '#c7d2fe' : 'rgba(255,255,255,.4)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>פיד</button>
            <button onClick={() => setView('calendar')} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
              background: view === 'calendar' ? 'rgba(99,102,241,.2)' : 'transparent',
              color: view === 'calendar' ? '#c7d2fe' : 'rgba(255,255,255,.4)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>לוח שנה</button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>
            <span><b style={{ color: 'rgba(255,255,255,.8)' }}>{posts.length}</b> פוסטים</span>
            <span><b style={{ color: '#a5b4fc' }}>{scheduledCount}</b> מתוזמנים</span>
            <span><b style={{ color: '#34d399' }}>{withCaptions}</b> עם תיאור</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Tone */}
          <div style={{
            display: 'flex', gap: 2, padding: 2, borderRadius: 8,
            background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.05)',
          }}>
            {TONES.map(t => (
              <button key={t.key} onClick={() => setTone(t.key)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 500,
                background: tone === t.key ? 'rgba(255,255,255,.08)' : 'transparent',
                color: tone === t.key ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.35)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Auto-schedule */}
          <button onClick={autoSchedule} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11.5, fontWeight: 500,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.65)', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            📅 תזמן אוטומטי
          </button>

          {/* Generate all captions */}
          <button onClick={generateAllCaptions} disabled={generatingCaptions} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
            background: 'linear-gradient(135deg, rgba(99,102,241,.2), rgba(168,85,247,.15))',
            border: '1px solid rgba(129,140,248,.3)',
            color: '#c7d2fe', cursor: generatingCaptions ? 'wait' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {generatingCaptions ? 'מייצר תיאורים...' : '✨ ייצר תיאורים לכולם'}
          </button>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}>

          {/* ── Grid view (Instagram feed preview) ── */}
          {view === 'grid' && (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              {/* Phone-style frame */}
              <div style={{
                background: 'rgba(0,0,0,.4)', borderRadius: 16, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,.06)',
                boxShadow: '0 8px 32px rgba(0,0,0,.3)',
              }}>
                {/* Instagram header bar */}
                <div style={{
                  padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.06)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(0,0,0,.3)',
                }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Instagram Feed Preview</span>
                </div>

                {/* 3-column grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2,
                }}>
                  {posts.map((p, idx) => {
                    const isDragging = dragIdx === idx
                    const isOver = dragOverIdx === idx
                    const isSelected = selectedPostId === p.imageId
                    return (
                      <div
                        key={p.imageId}
                        draggable
                        onDragStart={() => onDragStart(idx)}
                        onDragOver={e => onDragOver(e, idx)}
                        onDrop={() => onDrop(idx)}
                        onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                        onClick={() => setSelectedPostId(isSelected ? null : p.imageId)}
                        style={{
                          position: 'relative', aspectRatio: '1', overflow: 'hidden',
                          cursor: 'pointer', opacity: isDragging ? 0.4 : 1,
                          outline: isOver ? '2px solid #6366f1' : isSelected ? '2px solid #818cf8' : 'none',
                          outlineOffset: isOver || isSelected ? -2 : 0,
                          transition: 'opacity .12s',
                        }}
                      >
                        <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />

                        {/* Status indicator */}
                        <div style={{
                          position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%',
                          background: p.status === 'posted' ? '#10b981' : p.status === 'scheduled' ? '#6366f1' : 'rgba(255,255,255,.3)',
                          boxShadow: p.status !== 'draft' ? `0 0 6px ${p.status === 'posted' ? '#10b981' : '#6366f1'}` : 'none',
                        }} />

                        {/* Caption indicator */}
                        {p.caption && (
                          <div style={{
                            position: 'absolute', bottom: 4, right: 4, fontSize: 9, padding: '1px 5px',
                            background: 'rgba(0,0,0,.6)', borderRadius: 3, color: 'rgba(255,255,255,.7)',
                          }}>💬</div>
                        )}

                        {/* Date */}
                        {p.scheduledDate && (
                          <div style={{
                            position: 'absolute', bottom: 4, left: 4, fontSize: 9, padding: '1px 5px',
                            background: 'rgba(0,0,0,.6)', borderRadius: 3, color: 'rgba(255,255,255,.7)',
                          }}>{new Date(p.scheduledDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</div>
                        )}

                        {/* Remove button on hover */}
                        <button
                          onClick={e => { e.stopPropagation(); removePost(p.imageId) }}
                          style={{
                            position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: 4,
                            background: 'rgba(0,0,0,.7)', border: 'none', color: '#fff', fontSize: 10,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0, transition: 'opacity .12s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Add photos section */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>הוסף תמונות מגלריות</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {galleries.map(g => {
                    const galImages = allImages.filter(img => img.gallery_id === g.id && img.is_top_pick)
                    return (
                      <button key={g.id} onClick={() => addPhotos(galImages)} style={{
                        padding: '5px 12px', borderRadius: 50, fontSize: 11.5, fontWeight: 500,
                        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
                        color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        + {g.name} ({galImages.length})
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Calendar view ── */}
          {view === 'calendar' && (
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              {weeks.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 14 }}>
                  אין פוסטים מתוזמנים. לחץ "תזמן אוטומטי" או הגדר תאריך לכל פוסט.
                </div>
              ) : weeks.map(week => (
                <div key={week.label} style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {week.label}
                    <span style={{
                      padding: '2px 8px', borderRadius: 50, fontSize: 10.5,
                      background: 'rgba(99,102,241,.1)', color: '#a5b4fc',
                    }}>{week.posts.length} פוסטים</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {week.posts.map(p => (
                      <div
                        key={p.imageId}
                        onClick={() => setSelectedPostId(selectedPostId === p.imageId ? null : p.imageId)}
                        style={{
                          background: selectedPostId === p.imageId ? 'rgba(99,102,241,.06)' : 'rgba(255,255,255,.02)',
                          border: `1px solid ${selectedPostId === p.imageId ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.06)'}`,
                          borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'all .15s',
                        }}
                      >
                        <div style={{ aspectRatio: '16/10', overflow: 'hidden' }}>
                          <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{new Date(p.scheduledDate).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                            <span style={{ fontSize: 10, color: p.scheduledTime ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.2)' }}>{p.scheduledTime || '--:--'}</span>
                          </div>
                          {p.caption && (
                            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.caption.slice(0, 80)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Post editor sidebar ── */}
      {selectedPost && (
        <PostEditor
          post={selectedPost}
          onUpdate={updatePost}
          onClose={() => setSelectedPostId(null)}
          onGenerateCaption={generateSingleCaption}
          generating={generatingSingle}
        />
      )}
    </div>
  )
}
