import { useState } from 'react'
import { storageUrl } from '../supabase'
import { generatePitchPdf } from '../lib/pitchPdf'

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
  { key: 'small', label: 'קטן (עד 30 תמונות)', max: 30 },
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
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [sizeFilter, setSizeFilter] = useState('any')
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set())
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [expandedGalleryId, setExpandedGalleryId] = useState<string | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // ── Filter galleries ────────────────────────────────────────────────────

  const filtered = galleries.filter(g => {
    const et = readStr(g.delivery_settings, 'eventType')

    if (selectedTypes.size > 0 && !selectedTypes.has(et)) return false

    const sizeOpt = SIZE_OPTIONS.find(s => s.key === sizeFilter)
    if (sizeOpt && sizeOpt.key !== 'any') {
      if ('min' in sizeOpt && sizeOpt.min !== undefined && g.image_count < sizeOpt.min) return false
      if ('max' in sizeOpt && sizeOpt.max !== undefined && g.image_count > sizeOpt.max) return false
    }

    return true
  })

  // ── Toggles ─────────────────────────────────────────────────────────────

  const toggleType = (key: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGallery = (id: string) => {
    setSelectedGalleryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setSelectedImageIds(prev2 => {
          const next2 = new Set(prev2)
          allImages.filter(img => img.gallery_id === id).forEach(img => next2.delete(img.id))
          return next2
        })
      } else {
        next.add(id)
        // auto-select top picks
        setSelectedImageIds(prev2 => {
          const next2 = new Set(prev2)
          allImages.filter(img => img.gallery_id === id && img.is_top_pick).slice(0, 8)
            .forEach(img => next2.add(img.id))
          return next2
        })
      }
      return next
    })
  }

  const toggleImage = (id: string) => {
    setSelectedImageIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const ids = new Set(selectedGalleryIds)
    const imgIds = new Set(selectedImageIds)
    filtered.forEach(g => {
      ids.add(g.id)
      allImages.filter(img => img.gallery_id === g.id && img.is_top_pick).slice(0, 8)
        .forEach(img => imgIds.add(img.id))
    })
    setSelectedGalleryIds(ids)
    setSelectedImageIds(imgIds)
  }

  const clearAll = () => {
    setSelectedGalleryIds(new Set())
    setSelectedImageIds(new Set())
  }

  // ── PDF ─────────────────────────────────────────────────────────────────

  const downloadPdf = async () => {
    setGeneratingPdf(true)
    try {
      const selectedGals = filtered.filter(g => selectedGalleryIds.has(g.id))
      const selectedImgs = allImages.filter(img => selectedImageIds.has(img.id))

      const blob = await generatePitchPdf({
        intro: '',
        businessName,
        summary: `${selectedGals.length} גלריות · ${selectedImgs.length} תמונות`,
        galleries: selectedGals.map(g => ({
          name: g.name,
          eventType: readStr(g.delivery_settings, 'eventType'),
          description: '',
          images: selectedImgs
            .filter(img => img.gallery_id === g.id)
            .map(img => imgUrl(img.thumbnail_path || img.storage_path)),
        })),
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `portfolio-${businessName.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const selectedCount = selectedImageIds.size
  const selectedGalCount = selectedGalleryIds.size

  return (
    <div style={{ direction: 'rtl', padding: '24px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Filters ── */}
      <div style={{
        padding: '20px 24px', marginBottom: 20,
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 14,
      }}>
        {/* Event type chips */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 10 }}>
            סוג אירוע
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EVENT_TYPES.map(et => {
              const active = selectedTypes.has(et.key)
              return (
                <button
                  key={et.key}
                  onClick={() => toggleType(et.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 50, fontSize: 13, fontWeight: 500,
                    background: active ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                    color: active ? '#818cf8' : 'rgba(255,255,255,.5)',
                    border: `1px solid ${active ? 'rgba(99,102,241,.25)' : 'rgba(255,255,255,.06)'}`,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                  }}
                >
                  {et.icon} {et.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Size filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.35)' }}>
            גודל
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {SIZE_OPTIONS.map(s => {
              const active = sizeFilter === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => setSizeFilter(s.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: active ? 'rgba(255,255,255,.08)' : 'transparent',
                    color: active ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.4)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Results bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>
            {filtered.length} גלריות
          </span>
          {selectedGalCount > 0 && (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
              · {selectedGalCount} נבחרו · {selectedCount} תמונות
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {filtered.length > 0 && (
            <>
              <button
                onClick={selectedGalCount === filtered.length ? clearAll : selectAll}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                  color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {selectedGalCount === filtered.length ? 'נקה הכל' : 'בחר הכל'}
              </button>
              <button
                onClick={downloadPdf}
                disabled={selectedCount === 0 || generatingPdf}
                style={{
                  padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: selectedCount > 0 ? '#6366f1' : 'rgba(255,255,255,.04)',
                  color: selectedCount > 0 ? '#fff' : 'rgba(255,255,255,.25)',
                  border: 'none', cursor: selectedCount > 0 ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'all .15s',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                {generatingPdf ? (
                  <>
                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
                    מייצר...
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    הורד PDF
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Gallery list ── */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '60px 20px', textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 14,
          background: 'rgba(255,255,255,.01)', borderRadius: 14, border: '1px solid rgba(255,255,255,.04)',
        }}>
          {galleries.length === 0 ? 'אין גלריות' : 'אין גלריות שמתאימות לפילטרים'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(g => {
            const selected = selectedGalleryIds.has(g.id)
            const expanded = expandedGalleryId === g.id
            const coverUrl = covers.get(g.id)
            const galImages = allImages.filter(img => img.gallery_id === g.id)
            const et = readStr(g.delivery_settings, 'eventType')
            const etInfo = EVENT_TYPES.find(e => e.key === et)
            const galSelectedCount = galImages.filter(img => selectedImageIds.has(img.id)).length
            const location = readStr(g.delivery_settings, 'eventLocation')
            const date = readStr(g.delivery_settings, 'eventDate')

            return (
              <div key={g.id} style={{
                background: selected ? 'rgba(99,102,241,.03)' : 'rgba(255,255,255,.01)',
                border: `1px solid ${selected ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.05)'}`,
                borderRadius: 12, overflow: 'hidden', transition: 'all .15s',
              }}>
                {/* Gallery row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer' }}
                  onClick={() => toggleGallery(g.id)}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${selected ? '#6366f1' : 'rgba(255,255,255,.15)'}`,
                    background: selected ? '#6366f1' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s',
                  }}>
                    {selected && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>

                  {/* Cover */}
                  <div style={{
                    width: 52, height: 36, borderRadius: 7, overflow: 'hidden', flexShrink: 0,
                    background: 'rgba(255,255,255,.04)',
                  }}>
                    {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {etInfo && <span>{etInfo.icon} {etInfo.label}</span>}
                      <span>{g.image_count} תמונות</span>
                      {location && <span>· {location}</span>}
                      {date && <span>· {date}</span>}
                      {galSelectedCount > 0 && <span style={{ color: '#818cf8' }}>· {galSelectedCount} נבחרו</span>}
                    </div>
                  </div>

                  {/* Expand button */}
                  <button
                    onClick={e => { e.stopPropagation(); setExpandedGalleryId(expanded ? null : g.id) }}
                    style={{
                      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)',
                      borderRadius: 7, cursor: 'pointer', color: 'rgba(255,255,255,.45)',
                      padding: '5px 12px', fontSize: 11, fontFamily: 'inherit', transition: 'all .12s',
                    }}
                  >
                    {expanded ? 'סגור' : 'תמונות'}
                  </button>
                </div>

                {/* Expanded: image grid */}
                {expanded && (
                  <div style={{
                    padding: '6px 16px 14px', borderTop: '1px solid rgba(255,255,255,.04)',
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 5,
                  }}>
                    {galImages.slice(0, 40).map(img => {
                      const imgSelected = selectedImageIds.has(img.id)
                      return (
                        <div
                          key={img.id}
                          onClick={() => toggleImage(img.id)}
                          style={{
                            position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
                            cursor: 'pointer', border: `2px solid ${imgSelected ? '#6366f1' : 'transparent'}`,
                            opacity: imgSelected ? 1 : 0.55, transition: 'all .12s',
                          }}
                        >
                          <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                          {imgSelected && (
                            <div style={{
                              position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: 3,
                              background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                          )}
                          {img.is_top_pick && !imgSelected && (
                            <div style={{
                              position: 'absolute', bottom: 2, right: 2, fontSize: 9, padding: '1px 4px',
                              background: 'rgba(0,0,0,.6)', borderRadius: 3, color: '#fbbf24',
                            }}>★</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
