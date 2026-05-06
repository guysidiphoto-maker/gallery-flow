import { useState } from 'react'
import JSZip from 'jszip'
import { storageUrl } from '../supabase'
import { PdfEditor } from './PdfEditor'

// ─── Types ──────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}
interface ImageRow {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null; is_top_pick: boolean
}

interface TenderBuilderProps {
  galleries: GalleryRow[]
  allImages: ImageRow[]
  covers: Map<string, string>
  businessName: string
}

type Phase = 'browse' | 'editor'

const EVENT_TYPES: { key: string; label: string; icon: string }[] = [
  { key: 'conference', label: 'כנס', icon: '🎤' },
  { key: 'corporate-event', label: 'אירוע חברה', icon: '🏢' },
  { key: 'government', label: 'אירוע ממשלתי', icon: '🏛️' },
  { key: 'retreat-abroad', label: 'נופש בחו״ל', icon: '✈️' },
  { key: 'retreat-local', label: 'נופש חברה בארץ', icon: '🏖️' },
  { key: 'pre-event', label: 'קדם', icon: '📋' },
  { key: 'other', label: 'אחר', icon: '📸' },
]

const SIZE_OPTIONS = [
  { key: 'any', label: 'כל גודל' },
  { key: 'small', label: 'קטן (עד 30)', max: 30 },
  { key: 'medium', label: 'בינוני (30-100)', min: 30, max: 100 },
  { key: 'large', label: 'גדול (100+)', min: 100 },
]

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

function imgUrl(path: string | null): string {
  if (!path) return ''
  return storageUrl('gallery-images', path)
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TenderBuilder({ galleries, allImages, covers, businessName }: TenderBuilderProps) {
  const [phase, setPhase] = useState<Phase>('browse')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [sizeFilter, setSizeFilter] = useState('any')
  const [search, setSearch] = useState('')
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [expandedGalleryId, setExpandedGalleryId] = useState<string | null>(null)
  const [fullGalleryId, setFullGalleryId] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)

  // ── Filter ──────────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase()

  const filtered = galleries.filter(g => {
    const et = readStr(g.delivery_settings, 'eventType')
    if (selectedTypes.size > 0 && !selectedTypes.has(et)) return false
    const sizeOpt = SIZE_OPTIONS.find(s => s.key === sizeFilter)
    if (sizeOpt && sizeOpt.key !== 'any') {
      if ('min' in sizeOpt && sizeOpt.min !== undefined && g.image_count < sizeOpt.min) return false
      if ('max' in sizeOpt && sizeOpt.max !== undefined && g.image_count > sizeOpt.max) return false
    }
    if (q) {
      const name = g.name.toLowerCase()
      const client = (g.client_name || '').toLowerCase()
      const location = readStr(g.delivery_settings, 'eventLocation').toLowerCase()
      const date = readStr(g.delivery_settings, 'eventDate').toLowerCase()
      if (!name.includes(q) && !client.includes(q) && !location.includes(q) && !date.includes(q)) return false
    }
    return true
  })

  // ── Toggles ─────────────────────────────────────────────────────────────

  const toggleType = (key: string) => {
    setSelectedTypes(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  const toggleImage = (id: string) => {
    setSelectedImageIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const selectAllInGallery = (galleryId: string) => {
    const imgs = allImages.filter(img => img.gallery_id === galleryId)
    setSelectedImageIds(prev => {
      const n = new Set(prev)
      const allSelected = imgs.every(img => n.has(img.id))
      if (allSelected) imgs.forEach(img => n.delete(img.id))
      else imgs.forEach(img => n.add(img.id))
      return n
    })
  }

  const clearAll = () => setSelectedImageIds(new Set())

  // ── ZIP download ────────────────────────────────────────────────────────

  const downloadZip = async () => {
    setZipping(true)
    try {
      const selected = allImages.filter(img => selectedImageIds.has(img.id))
      const zip = new JSZip()
      for (let i = 0; i < selected.length; i++) {
        const img = selected[i]
        try {
          const res = await fetch(imgUrl(img.storage_path))
          const blob = await res.blob()
          zip.file(img.filename || `photo-${i + 1}.jpg`, blob)
        } catch { /* skip */ }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `photos-${businessName.replace(/\s+/g, '-')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP failed:', err)
    } finally {
      setZipping(false)
    }
  }

  // ── Go to editor ────────────────────────────────────────────────────────

  // Group selected photos per gallery (preserving selection order within each gallery)
  const editorGroups = galleries
    .map(g => {
      const photos = allImages
        .filter(img => img.gallery_id === g.id && selectedImageIds.has(img.id))
        .map(img => imgUrl(img.storage_path))
      return { id: g.id, title: g.name, photos }
    })
    .filter(grp => grp.photos.length > 0)

  const selectedCount = selectedImageIds.size

  // ── Editor phase ────────────────────────────────────────────────────────

  if (phase === 'editor') {
    return (
      <PdfEditor
        galleries={editorGroups}
        businessName={businessName}
        onBack={() => setPhase('browse')}
      />
    )
  }

  // ── Browse phase ────────────────────────────────────────────────────────

  return (
    // Dark surface deliberate — same reason as SocialManager + PortfolioEditor:
    // 70 internal styles use white-on-translucent, designed for a near-black
    // canvas. Without this wrap the hero, filters, gallery cards, and
    // selection toolbar all disappear on the cream parent.
    <div style={{
      direction: 'rtl', padding: '32px 24px 24px', maxWidth: 1280, margin: '0 auto',
      paddingBottom: selectedCount > 0 ? 100 : 24, position: 'relative',
      background: '#0a0a0f', color: 'rgba(255,255,255,.9)', borderRadius: 14,
    }}>

      {/* Background glow */}
      <div style={{
        position: 'absolute', top: 0, right: '10%', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(99,102,241,.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0, filter: 'blur(40px)',
      }} />
      <div style={{
        position: 'absolute', top: 100, left: '5%', width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(168,85,247,.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0, filter: 'blur(40px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

      {/* ── Hero ── */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', borderRadius: 50,
          background: 'linear-gradient(90deg, rgba(99,102,241,.18), rgba(168,85,247,.18))',
          border: '1px solid rgba(129,140,248,.35)',
          fontSize: 11, fontWeight: 600, color: '#fff', letterSpacing: '.1em',
          marginBottom: 14,
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 8px #818cf8' }} />
          חיפוש למכרז
        </div>
        <h1 style={{
          fontSize: 34, fontWeight: 800, margin: '0 0 8px',
          color: '#fff',
          letterSpacing: '-0.03em', lineHeight: 1.1,
        }}>
          מצאו את התמונות המושלמות
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.75)', margin: 0, maxWidth: 500, marginInline: 'auto', lineHeight: 1.6 }}>
          סננו את הארכיון, בחרו את מה שעובד, וייצרו הצעה מרשימה
        </p>
      </div>

      {/* ── Search + Filters Card (glass) ── */}
      <div style={{
        padding: '22px 24px',
        marginBottom: 28,
        background: 'linear-gradient(135deg, rgba(255,255,255,.035) 0%, rgba(255,255,255,.015) 100%)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 18,
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05)',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: 'rgba(129,140,248,.6)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, לקוח, מיקום או תאריך..."
            style={{
              width: '100%', padding: '13px 46px 13px 18px', boxSizing: 'border-box',
              background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 12, color: '#fff', fontSize: 14, fontFamily: 'inherit',
              outline: 'none', direction: 'rtl',
              transition: 'border-color .15s, box-shadow .15s, background .15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(129,140,248,.5)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(99,102,241,.1)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 6,
                width: 22, height: 22, cursor: 'pointer', color: 'rgba(255,255,255,.7)',
                fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
            >×</button>
          )}
        </div>

        {/* Event type chips */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.8)',
            marginBottom: 10, letterSpacing: '.12em', textTransform: 'uppercase',
          }}>
            סוג אירוע
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {EVENT_TYPES.map(et => {
              const active = selectedTypes.has(et.key)
              return (
                <button key={et.key} onClick={() => toggleType(et.key)} style={{
                  padding: '7px 14px', borderRadius: 50, fontSize: 12.5, fontWeight: 500,
                  background: active ? 'linear-gradient(135deg, rgba(99,102,241,.25), rgba(168,85,247,.2))' : 'rgba(255,255,255,.06)',
                  color: active ? '#fff' : 'rgba(255,255,255,.8)',
                  border: `1px solid ${active ? 'rgba(129,140,248,.4)' : 'rgba(255,255,255,.14)'}`,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s',
                  boxShadow: active ? '0 4px 16px rgba(99,102,241,.2), inset 0 1px 0 rgba(255,255,255,.1)' : 'none',
                }}>
                  {et.icon} {et.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Size pill group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.8)',
            letterSpacing: '.12em', textTransform: 'uppercase',
          }}>
            גודל
          </span>
          <div style={{
            display: 'inline-flex', gap: 2, padding: 3,
            background: 'rgba(0,0,0,.3)', borderRadius: 10,
            border: '1px solid rgba(255,255,255,.05)',
          }}>
            {SIZE_OPTIONS.map(s => (
              <button key={s.key} onClick={() => setSizeFilter(s.key)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: sizeFilter === s.key ? 'rgba(255,255,255,.12)' : 'transparent',
                color: sizeFilter === s.key ? '#fff' : 'rgba(255,255,255,.75)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                boxShadow: sizeFilter === s.key ? '0 1px 3px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.08)' : 'none',
              }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selection summary (multi-gallery collection) ── */}
      {selectedCount > 0 && (() => {
        // Build per-gallery breakdown
        const breakdown = galleries
          .map(g => {
            const gImgs = allImages.filter(img => img.gallery_id === g.id)
            const sel = gImgs.filter(img => selectedImageIds.has(img.id)).length
            return { gallery: g, selected: sel }
          })
          .filter(b => b.selected > 0)

        return (
          <div style={{
            marginBottom: 20, padding: '14px 18px',
            background: 'linear-gradient(135deg, rgba(99,102,241,.06), rgba(168,85,247,.04))',
            border: '1px solid rgba(129,140,248,.18)',
            borderRadius: 14,
            boxShadow: '0 4px 20px rgba(99,102,241,.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff',
                  boxShadow: '0 2px 8px rgba(99,102,241,.4)',
                }}>
                  {selectedCount}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                    בחירה מצטברת
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 1 }}>
                    {selectedCount} תמונות מ-{breakdown.length} {breakdown.length === 1 ? 'גלריה' : 'גלריות'} · הבחירה נשמרת בין גלריות
                  </div>
                </div>
              </div>
              <button onClick={clearAll} style={{
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                color: 'rgba(255,255,255,.6)', borderRadius: 8, padding: '5px 12px',
                fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}>
                נקה הכל
              </button>
            </div>

            {/* Per-gallery chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {breakdown.map(b => {
                const cov = covers.get(b.gallery.id)
                return (
                  <button
                    key={b.gallery.id}
                    onClick={() => setFullGalleryId(b.gallery.id)}
                    title="פתח גלריה"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '4px 10px 4px 4px', borderRadius: 50,
                      background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
                      color: 'rgba(255,255,255,.85)', fontSize: 11.5, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,.12)'; e.currentTarget.style.borderColor = 'rgba(129,140,248,.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)' }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', overflow: 'hidden',
                      background: 'rgba(255,255,255,.05)', flexShrink: 0,
                    }}>
                      {cov && <img src={cov} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                      {b.gallery.name}
                    </span>
                    <span style={{
                      padding: '1px 7px', borderRadius: 10,
                      background: 'rgba(129,140,248,.2)', color: '#c7d2fe',
                      fontSize: 10.5, fontWeight: 700,
                    }}>
                      {b.selected}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Results header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {filtered.length}
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>
            {filtered.length === 1 ? 'גלריה' : 'גלריות'}
          </span>
        </div>
        {filtered.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>
            ניתן לבחור תמונות מכמה גלריות — הבחירה נשמרת
          </span>
        )}
      </div>

      {/* ── Gallery grid ── */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '80px 20px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(255,255,255,.02), rgba(255,255,255,.005))',
          borderRadius: 16, border: '1px dashed rgba(255,255,255,.08)',
        }}>
          <div style={{ fontSize: 34, marginBottom: 8, opacity: .5 }}>🔍</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.75)', fontWeight: 500 }}>
            {galleries.length === 0 ? 'אין גלריות בארכיון' : 'לא נמצאו גלריות התואמות לחיפוש'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(g => {
            const expanded = expandedGalleryId === g.id
            const coverUrl = covers.get(g.id)
            const galImages = allImages.filter(img => img.gallery_id === g.id)
            const et = readStr(g.delivery_settings, 'eventType')
            const etInfo = EVENT_TYPES.find(e => e.key === et)
            const galSelectedCount = galImages.filter(img => selectedImageIds.has(img.id)).length
            const allGalSelected = galImages.length > 0 && galImages.every(img => selectedImageIds.has(img.id))
            const location = readStr(g.delivery_settings, 'eventLocation')

            const hasSelected = galSelectedCount > 0

            return (
              <div key={g.id} className="wsd-gallery-card" style={{
                position: 'relative',
                background: hasSelected
                  ? 'linear-gradient(135deg, rgba(99,102,241,.08), rgba(168,85,247,.04))'
                  : 'linear-gradient(135deg, rgba(255,255,255,.035), rgba(255,255,255,.015))',
                border: `1px solid ${hasSelected ? 'rgba(129,140,248,.3)' : 'rgba(255,255,255,.07)'}`,
                borderRadius: 16, overflow: 'hidden',
                transition: 'all .25s cubic-bezier(.4,0,.2,1)',
                boxShadow: hasSelected
                  ? '0 8px 32px rgba(99,102,241,.15), 0 0 0 1px rgba(129,140,248,.1)'
                  : '0 4px 20px rgba(0,0,0,.2)',
                gridColumn: expanded ? '1 / -1' : 'auto',
              }}>

                {/* Cover image with gradient overlay */}
                <div
                  onClick={() => setFullGalleryId(g.id)}
                  style={{
                    position: 'relative', aspectRatio: '16/10', cursor: 'pointer',
                    background: 'rgba(255,255,255,.03)', overflow: 'hidden',
                  }}
                >
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="wsd-cover-img" style={{
                      width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                      transition: 'transform .6s cubic-bezier(.4,0,.2,1)',
                    }} />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(255,255,255,.15)', fontSize: 30,
                    }}>📷</div>
                  )}

                  {/* Gradient overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,.75) 0%, rgba(0,0,0,.15) 50%, transparent 100%)',
                    pointerEvents: 'none',
                  }} />

                  {/* Event type badge */}
                  {etInfo && (
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      padding: '4px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600,
                      background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,.1)', color: '#fff',
                    }}>
                      {etInfo.icon} {etInfo.label}
                    </div>
                  )}

                  {/* Selection count badge */}
                  {hasSelected && (
                    <div style={{
                      position: 'absolute', top: 12, left: 12,
                      padding: '4px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,.5)',
                    }}>
                      {galSelectedCount} נבחרו
                    </div>
                  )}

                  {/* Info overlay at bottom */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10,
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 16, fontWeight: 700, color: '#fff',
                        textShadow: '0 2px 8px rgba(0,0,0,.5)', letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginBottom: 2,
                      }}>{g.name}</div>
                      <div style={{
                        fontSize: 11.5, color: 'rgba(255,255,255,.7)',
                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                      }}>
                        <span>{g.image_count} תמונות</span>
                        {location && <span>· {location}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div style={{
                  display: 'flex', gap: 6, padding: 10,
                  borderTop: '1px solid rgba(255,255,255,.04)',
                  background: 'rgba(0,0,0,.15)',
                }}>
                  <button
                    onClick={() => setExpandedGalleryId(expanded ? null : g.id)}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                      background: expanded ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.04)',
                      border: `1px solid ${expanded ? 'rgba(129,140,248,.3)' : 'rgba(255,255,255,.06)'}`,
                      color: expanded ? '#a5b4fc' : 'rgba(255,255,255,.7)',
                      fontSize: 12, fontWeight: 500, fontFamily: 'inherit', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {expanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                    </svg>
                    {expanded ? 'סגור' : 'בחר תמונות'}
                  </button>
                  <button
                    onClick={() => setFullGalleryId(g.id)}
                    style={{
                      padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
                      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)',
                      color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 500,
                      fontFamily: 'inherit', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                    צפה
                  </button>
                </div>

                {/* Expanded: inline image grid */}
                {expanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.2)' }}>
                    <div style={{
                      padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(255,255,255,.04)',
                    }}>
                      <button onClick={() => selectAllInGallery(g.id)} style={{
                        background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
                        cursor: 'pointer', fontFamily: 'inherit', borderRadius: 7, padding: '5px 12px',
                        fontSize: 12, color: '#a5b4fc', fontWeight: 600, transition: 'all .15s',
                      }}>
                        {allGalSelected ? 'בטל בחירה' : 'בחר הכל'}
                      </button>
                      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', fontWeight: 500 }}>
                        {galSelectedCount} / {galImages.length}
                      </span>
                    </div>

                    <div style={{
                      padding: 14,
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6,
                      maxHeight: 420, overflowY: 'auto',
                    }}>
                      {galImages.map(img => {
                        const sel = selectedImageIds.has(img.id)
                        return (
                          <div
                            key={img.id}
                            onClick={() => toggleImage(img.id)}
                            className="wsd-thumb"
                            style={{
                              position: 'relative', aspectRatio: '3/2', borderRadius: 8, overflow: 'hidden',
                              cursor: 'pointer',
                              border: `2px solid ${sel ? '#818cf8' : 'transparent'}`,
                              opacity: sel ? 1 : 0.55, transition: 'all .15s',
                              boxShadow: sel ? '0 0 0 4px rgba(129,140,248,.15)' : 'none',
                            }}
                          >
                            <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                            {sel && (
                              <div style={{
                                position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 5,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(99,102,241,.5)',
                              }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                              </div>
                            )}
                            {img.is_top_pick && (
                              <div style={{
                                position: 'absolute', bottom: 4, right: 4, fontSize: 10, padding: '2px 6px',
                                background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(4px)',
                                borderRadius: 4, color: '#fbbf24', fontWeight: 700,
                              }}>★</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Full gallery modal (fast navigation between filtered galleries) ── */}
      {fullGalleryId && (() => {
        const currentIdx = filtered.findIndex(g => g.id === fullGalleryId)
        if (currentIdx === -1) return null
        const gal = filtered[currentIdx]
        const galImages = allImages.filter(img => img.gallery_id === fullGalleryId)
        const et = readStr(gal.delivery_settings, 'eventType')
        const etInfo = EVENT_TYPES.find(e => e.key === et)
        const location = readStr(gal.delivery_settings, 'eventLocation')
        const galSel = galImages.filter(img => selectedImageIds.has(img.id)).length
        const allSel = galImages.length > 0 && galImages.every(img => selectedImageIds.has(img.id))
        const hasPrev = currentIdx > 0
        const hasNext = currentIdx < filtered.length - 1
        const goPrev = () => hasPrev && setFullGalleryId(filtered[currentIdx - 1].id)
        const goNext = () => hasNext && setFullGalleryId(filtered[currentIdx + 1].id)
        return (
          <div
            onClick={() => setFullGalleryId(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(8,8,12,.94)',
              backdropFilter: 'blur(16px)', zIndex: 200,
              display: 'flex', flexDirection: 'column',
              animation: 'fadeIn .15s ease',
            }}
            onKeyDown={e => {
              // Note: onKeyDown on a div only fires when focused; we add global listener via useEffect below
              if (e.key === 'Escape') setFullGalleryId(null)
              if (e.key === 'ArrowLeft') goPrev()
              if (e.key === 'ArrowRight') goNext()
            }}
            tabIndex={-1}
            ref={node => { if (node) node.focus() }}
          >
            {/* Compact header */}
            <div
              onClick={e => e.stopPropagation()}
              style={{
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                background: 'rgba(0,0,0,.35)',
                display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
              }}
            >
              {/* Close */}
              <button onClick={() => setFullGalleryId(null)} title="סגור (Esc)" style={{
                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8,
                width: 30, height: 30, cursor: 'pointer', color: 'rgba(255,255,255,.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 13,
                transition: 'all .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
              >✕</button>

              {/* Title + meta — ultra compact */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                  {gal.name}
                </div>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)', whiteSpace: 'nowrap' }}>
                  {etInfo && <>{etInfo.icon} {etInfo.label} · </>}
                  {galImages.length} תמונות
                  {location && <> · {location}</>}
                </span>
                {galSel > 0 && (
                  <span style={{
                    padding: '2px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                    background: 'linear-gradient(135deg, rgba(99,102,241,.25), rgba(168,85,247,.2))',
                    color: '#c7d2fe', border: '1px solid rgba(129,140,248,.25)',
                  }}>{galSel} נבחרו</span>
                )}
              </div>

              {/* Gallery position indicator */}
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)', fontVariantNumeric: 'tabular-nums' }}>
                {currentIdx + 1} / {filtered.length}
              </span>

              {/* Prev/next nav */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={goPrev} disabled={!hasPrev} title="הקודם (→)" style={{
                  background: hasPrev ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)',
                  border: '1px solid rgba(255,255,255,.08)', borderRadius: 8,
                  width: 30, height: 30, cursor: hasPrev ? 'pointer' : 'default',
                  color: hasPrev ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
                  transition: 'all .12s',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
                <button onClick={goNext} disabled={!hasNext} title="הבא (←)" style={{
                  background: hasNext ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)',
                  border: '1px solid rgba(255,255,255,.08)', borderRadius: 8,
                  width: 30, height: 30, cursor: hasNext ? 'pointer' : 'default',
                  color: hasNext ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
                  transition: 'all .12s',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
              </div>

              {/* Select all */}
              <button
                onClick={() => selectAllInGallery(fullGalleryId)}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: allSel ? 'rgba(255,255,255,.06)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#fff', border: allSel ? '1px solid rgba(255,255,255,.1)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: allSel ? 'none' : '0 4px 12px rgba(99,102,241,.3)',
                }}
              >
                {allSel ? 'בטל בחירה' : 'בחר הכל'}
              </button>
            </div>

            {/* Image grid */}
            <div
              onClick={e => e.stopPropagation()}
              key={fullGalleryId}
              style={{
                flex: 1, minHeight: 0, overflowY: 'auto', padding: 20,
                animation: 'fadeIn .18s ease',
              }}
            >
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6,
                maxWidth: 1400, margin: '0 auto',
              }}>
                {galImages.map(img => {
                  const sel = selectedImageIds.has(img.id)
                  return (
                    <div
                      key={img.id}
                      onClick={() => toggleImage(img.id)}
                      style={{
                        position: 'relative', aspectRatio: '3/2', borderRadius: 6, overflow: 'hidden',
                        cursor: 'pointer',
                        border: `2px solid ${sel ? '#818cf8' : 'transparent'}`,
                        opacity: sel ? 1 : 0.7, transition: 'all .1s',
                        boxShadow: sel ? '0 0 0 3px rgba(129,140,248,.2)' : 'none',
                      }}
                    >
                      <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                      <div style={{
                        position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 5,
                        background: sel ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(0,0,0,.55)',
                        border: sel ? 'none' : '2px solid rgba(255,255,255,.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: sel ? '0 2px 8px rgba(99,102,241,.4)' : 'none',
                      }}>
                        {sel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                      {img.is_top_pick && (
                        <div style={{
                          position: 'absolute', bottom: 6, right: 6, fontSize: 10, padding: '1px 6px',
                          background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)',
                          borderRadius: 3, color: '#fbbf24', fontWeight: 700,
                        }}>★</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(20px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
        .wsd-gallery-card:hover {
          transform: translateY(-3px);
          border-color: rgba(129,140,248,.25) !important;
          box-shadow: 0 16px 48px rgba(0,0,0,.35), 0 0 0 1px rgba(129,140,248,.2), 0 0 40px rgba(99,102,241,.12) !important;
        }
        .wsd-gallery-card:hover .wsd-cover-img {
          transform: scale(1.06);
        }
        .wsd-thumb:hover {
          opacity: 1 !important;
          transform: scale(1.03);
        }
      `}</style>

      {/* ── Floating bottom bar ── */}
      {selectedCount > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 12px 10px 20px',
          background: 'linear-gradient(135deg, rgba(20,20,30,.92), rgba(25,20,40,.92))',
          backdropFilter: 'blur(24px) saturate(1.3)',
          border: '1px solid rgba(129,140,248,.25)',
          borderRadius: 16,
          boxShadow: '0 12px 48px rgba(0,0,0,.5), 0 0 40px rgba(99,102,241,.2), inset 0 1px 0 rgba(255,255,255,.08)',
          display: 'flex', alignItems: 'center', gap: 14,
          zIndex: 100,
          animation: 'slideUp .3s cubic-bezier(.4,0,.2,1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#fff',
              boxShadow: '0 4px 12px rgba(99,102,241,.4)',
            }}>
              {selectedCount}
            </div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
              תמונות נבחרו
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.1)' }} />
          <button
            onClick={downloadZip}
            disabled={zipping}
            style={{
              padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              color: 'rgba(255,255,255,.85)', fontSize: 12.5, fontWeight: 500,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {zipping ? 'מייצר ZIP...' : 'הורד ZIP'}
          </button>
          <button
            onClick={() => setPhase('editor')}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 12.5, fontWeight: 600,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 4px 16px rgba(99,102,241,.4)', transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,102,241,.55)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,.4)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            ייצר PDF
          </button>
        </div>
      )}
    </div>
  )
}
