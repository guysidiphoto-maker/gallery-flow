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

  const selectedPhotos = allImages
    .filter(img => selectedImageIds.has(img.id))
    .map(img => imgUrl(img.storage_path))

  const selectedCount = selectedImageIds.size

  // ── Editor phase ────────────────────────────────────────────────────────

  if (phase === 'editor') {
    return (
      <PdfEditor
        photos={selectedPhotos}
        businessName={businessName}
        onBack={() => setPhase('browse')}
      />
    )
  }

  // ── Browse phase ────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl', padding: '24px', maxWidth: 1200, margin: '0 auto', paddingBottom: selectedCount > 0 ? 80 : 24 }}>

      {/* ── Filters ── */}
      <div style={{
        padding: '16px 20px', marginBottom: 16,
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 12,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.3)', pointerEvents: 'none' }}
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
              width: '100%', padding: '9px 36px 9px 14px', boxSizing: 'border-box',
              background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 9, color: '#fff', fontSize: 13, fontFamily: 'inherit',
              outline: 'none', direction: 'rtl', transition: 'border-color .15s, background .15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.4)'; e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.background = 'rgba(255,255,255,.03)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 5,
                width: 20, height: 20, cursor: 'pointer', color: 'rgba(255,255,255,.6)',
                fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.3)', marginBottom: 8 }}>סוג אירוע</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EVENT_TYPES.map(et => {
              const active = selectedTypes.has(et.key)
              return (
                <button key={et.key} onClick={() => toggleType(et.key)} style={{
                  padding: '5px 12px', borderRadius: 50, fontSize: 12, fontWeight: 500,
                  background: active ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                  color: active ? '#818cf8' : 'rgba(255,255,255,.45)',
                  border: `1px solid ${active ? 'rgba(99,102,241,.25)' : 'rgba(255,255,255,.06)'}`,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                }}>
                  {et.icon} {et.label}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.3)' }}>גודל</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {SIZE_OPTIONS.map(s => (
              <button key={s.key} onClick={() => setSizeFilter(s.key)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: sizeFilter === s.key ? 'rgba(255,255,255,.08)' : 'transparent',
                color: sizeFilter === s.key ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.35)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Results header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)' }}>
          {filtered.length} גלריות
        </span>
        {selectedCount > 0 && (
          <button onClick={clearAll} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,.35)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            נקה בחירה
          </button>
        )}
      </div>

      {/* ── Gallery list ── */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '60px 20px', textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 14,
          background: 'rgba(255,255,255,.01)', borderRadius: 12, border: '1px solid rgba(255,255,255,.04)',
        }}>
          {galleries.length === 0 ? 'אין גלריות' : 'אין גלריות שמתאימות לפילטרים'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(g => {
            const expanded = expandedGalleryId === g.id
            const coverUrl = covers.get(g.id)
            const galImages = allImages.filter(img => img.gallery_id === g.id)
            const et = readStr(g.delivery_settings, 'eventType')
            const etInfo = EVENT_TYPES.find(e => e.key === et)
            const galSelectedCount = galImages.filter(img => selectedImageIds.has(img.id)).length
            const allGalSelected = galImages.length > 0 && galImages.every(img => selectedImageIds.has(img.id))
            const location = readStr(g.delivery_settings, 'eventLocation')
            const date = readStr(g.delivery_settings, 'eventDate')

            return (
              <div key={g.id} style={{
                background: galSelectedCount > 0 ? 'rgba(99,102,241,.03)' : 'rgba(255,255,255,.01)',
                border: `1px solid ${galSelectedCount > 0 ? 'rgba(99,102,241,.12)' : 'rgba(255,255,255,.05)'}`,
                borderRadius: 12, overflow: 'hidden', transition: 'all .12s',
              }}>
                {/* Gallery header row */}
                <div
                  onClick={() => setExpandedGalleryId(expanded ? null : g.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}
                >
                  {/* Cover */}
                  <div style={{
                    width: 56, height: 40, borderRadius: 7, overflow: 'hidden', flexShrink: 0,
                    background: 'rgba(255,255,255,.04)',
                  }}>
                    {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {etInfo && <span>{etInfo.icon} {etInfo.label}</span>}
                      <span>{g.image_count} תמונות</span>
                      {location && <span>· {location}</span>}
                      {date && <span>· {date}</span>}
                    </div>
                  </div>

                  {/* Selection badge */}
                  {galSelectedCount > 0 && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600,
                      background: 'rgba(99,102,241,.12)', color: '#818cf8',
                    }}>
                      {galSelectedCount}
                    </span>
                  )}

                  {/* View full gallery button */}
                  <button
                    onClick={e => { e.stopPropagation(); setFullGalleryId(g.id) }}
                    title="צפה בגלריה המלאה"
                    style={{
                      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                      borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,.5)',
                      padding: '5px 10px', fontSize: 11, fontFamily: 'inherit', transition: 'all .12s',
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    צפה
                  </button>

                  {/* Expand chevron */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: 'rgba(255,255,255,.25)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Expanded: full image grid */}
                {expanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,.04)' }}>
                    {/* Select all bar */}
                    <div style={{
                      padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <button onClick={() => selectAllInGallery(g.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, color: '#818cf8', fontWeight: 500,
                      }}>
                        {allGalSelected ? 'בטל הכל' : 'בחר הכל'}
                      </button>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
                        {galSelectedCount} / {galImages.length}
                      </span>
                    </div>

                    {/* Image grid */}
                    <div style={{
                      padding: '0 14px 14px',
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 5,
                    }}>
                      {galImages.map(img => {
                        const sel = selectedImageIds.has(img.id)
                        return (
                          <div
                            key={img.id}
                            onClick={() => toggleImage(img.id)}
                            style={{
                              position: 'relative', aspectRatio: '3/2', borderRadius: 6, overflow: 'hidden',
                              cursor: 'pointer', border: `2px solid ${sel ? '#6366f1' : 'transparent'}`,
                              opacity: sel ? 1 : 0.6, transition: 'all .1s',
                            }}
                          >
                            <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                            {sel && (
                              <div style={{
                                position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 4,
                                background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                              </div>
                            )}
                            {img.is_top_pick && (
                              <div style={{
                                position: 'absolute', bottom: 3, right: 3, fontSize: 9, padding: '1px 4px',
                                background: 'rgba(0,0,0,.65)', borderRadius: 3, color: '#fbbf24',
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

      {/* ── Full gallery modal ── */}
      {fullGalleryId && (() => {
        const gal = galleries.find(g => g.id === fullGalleryId)
        if (!gal) return null
        const galImages = allImages.filter(img => img.gallery_id === fullGalleryId)
        const et = readStr(gal.delivery_settings, 'eventType')
        const etInfo = EVENT_TYPES.find(e => e.key === et)
        const location = readStr(gal.delivery_settings, 'eventLocation')
        const galSel = galImages.filter(img => selectedImageIds.has(img.id)).length
        const allSel = galImages.length > 0 && galImages.every(img => selectedImageIds.has(img.id))
        return (
          <div
            onClick={() => setFullGalleryId(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
              backdropFilter: 'blur(8px)', zIndex: 200,
              display: 'flex', flexDirection: 'column',
              animation: 'fadeIn .15s ease',
            }}
          >
            {/* Header */}
            <div
              onClick={e => e.stopPropagation()}
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid rgba(255,255,255,.08)',
                display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
              }}
            >
              <button onClick={() => setFullGalleryId(null)} style={{
                background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 8,
                width: 32, height: 32, cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
              }}>
                ✕
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{gal.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>
                  {etInfo && <span>{etInfo.icon} {etInfo.label}</span>}
                  <span> · {gal.image_count} תמונות</span>
                  {location && <span> · {location}</span>}
                  {galSel > 0 && <span style={{ color: '#818cf8' }}> · {galSel} נבחרו</span>}
                </div>
              </div>
              <button
                onClick={() => selectAllInGallery(fullGalleryId)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: allSel ? 'rgba(255,255,255,.06)' : '#6366f1',
                  color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {allSel ? 'בטל בחירה' : 'בחר הכל'}
              </button>
            </div>

            {/* Image grid */}
            <div
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, minHeight: 0, overflowY: 'auto', padding: 24,
              }}
            >
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8,
                maxWidth: 1400, margin: '0 auto',
              }}>
                {galImages.map(img => {
                  const sel = selectedImageIds.has(img.id)
                  return (
                    <div
                      key={img.id}
                      onClick={() => toggleImage(img.id)}
                      style={{
                        position: 'relative', aspectRatio: '3/2', borderRadius: 8, overflow: 'hidden',
                        cursor: 'pointer', border: `3px solid ${sel ? '#6366f1' : 'transparent'}`,
                        transition: 'all .12s',
                      }}
                    >
                      <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                      <div style={{
                        position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 6,
                        background: sel ? '#6366f1' : 'rgba(0,0,0,.5)',
                        border: sel ? 'none' : '2px solid rgba(255,255,255,.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                      {img.is_top_pick && (
                        <div style={{
                          position: 'absolute', bottom: 8, right: 8, fontSize: 11, padding: '2px 7px',
                          background: 'rgba(0,0,0,.7)', borderRadius: 4, color: '#fbbf24', fontWeight: 600,
                        }}>★ TOP</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

      {/* ── Floating bottom bar ── */}
      {selectedCount > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 24px',
          background: 'rgba(10,10,15,.92)', backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(255,255,255,.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          zIndex: 100,
        }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
            {selectedCount} תמונות נבחרו
          </span>
          <button
            onClick={downloadZip}
            disabled={zipping}
            style={{
              padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
              color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 500,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
            }}
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
              padding: '10px 26px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
            }}
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
