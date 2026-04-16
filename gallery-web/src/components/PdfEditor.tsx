import { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import { generatePitchPdf } from '../lib/pitchPdf'

export interface PdfEditorGallery {
  id: string
  title: string       // editable, defaults to gallery name
  photos: string[]    // URLs (original aspect preserved)
  photoSize?: 'small' | 'medium' | 'large'  // per-gallery override
}

// Approximate photos per page at each size — used for preview page splits.
// Matches PDF output: small ≈ 12, medium ≈ 9, large ≈ 6 (more for portrait).
const PHOTOS_PER_PAGE = { small: 12, medium: 9, large: 6 }

interface PdfEditorProps {
  galleries: PdfEditorGallery[]
  businessName: string
  onBack: () => void
}

const PRESET_COLORS = [
  { hex: '#ffffff', label: 'לבן' },
  { hex: '#0a0a0f', label: 'שחור' },
  { hex: '#1a1a2e', label: 'כהה' },
  { hex: '#f5f0eb', label: 'קרם' },
  { hex: '#f0f4f8', label: 'אפור בהיר' },
  { hex: '#1b2838', label: 'כחול כהה' },
]

export function PdfEditor({ galleries: initialGalleries, businessName, onBack }: PdfEditorProps) {
  const [groups, setGroups] = useState<PdfEditorGallery[]>(initialGalleries)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [customColor, setCustomColor] = useState('')
  const [logoBase64, setLogoBase64] = useState<string | undefined>()
  const [photoSize, setPhotoSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [generating, setGenerating] = useState<string | null>(null)   // groupId or "all" or null
  const [dragInfo, setDragInfo] = useState<{ gid: string; idx: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ gid: string; idx: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isDark = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 < 128
  }

  const textColor = isDark(bgColor) ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.85)'
  const subtextColor = isDark(bgColor) ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.4)'

  const totalPhotos = groups.reduce((sum, g) => sum + g.photos.length, 0)

  // ── Drag/drop within same gallery ──────────────────────────────────

  const onDragStart = useCallback((gid: string, idx: number) => setDragInfo({ gid, idx }), [])
  const onDragOver = useCallback((e: React.DragEvent, gid: string, idx: number) => {
    e.preventDefault()
    setDragOver({ gid, idx })
  }, [])
  const onDrop = useCallback((gid: string, idx: number) => {
    if (!dragInfo || dragInfo.gid !== gid || dragInfo.idx === idx) {
      setDragInfo(null); setDragOver(null); return
    }
    setGroups(prev => prev.map(g => {
      if (g.id !== gid) return g
      const next = [...g.photos]
      const [moved] = next.splice(dragInfo.idx, 1)
      next.splice(idx, 0, moved)
      return { ...g, photos: next }
    }))
    setDragInfo(null); setDragOver(null)
  }, [dragInfo])

  // ── Logo ───────────────────────────────────────────────────────────

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogoBase64(reader.result as string)
    reader.readAsDataURL(file)
  }

  const removePhoto = (gid: string, idx: number) => {
    setGroups(prev => prev.map(g =>
      g.id === gid ? { ...g, photos: g.photos.filter((_, i) => i !== idx) } : g
    ))
  }

  const updateTitle = (gid: string, title: string) => {
    setGroups(prev => prev.map(g => g.id === gid ? { ...g, title } : g))
  }

  const updateGallerySize = (gid: string, size: 'small' | 'medium' | 'large') => {
    setGroups(prev => prev.map(g => g.id === gid ? { ...g, photoSize: size } : g))
  }

  const removeGallery = (gid: string) => {
    setGroups(prev => prev.filter(g => g.id !== gid))
  }

  // ── Download PDF (all or single gallery) ───────────────────────────

  const downloadPdf = async (onlyGid?: string) => {
    const id = onlyGid || 'all'
    setGenerating(id)
    try {
      const target = onlyGid ? groups.filter(g => g.id === onlyGid) : groups
      const filtered = target.filter(g => g.photos.length > 0)
      if (filtered.length === 0) return
      const blob = await generatePitchPdf({
        galleries: filtered.map(g => ({ title: g.title, photos: g.photos, photoSize: g.photoSize })),
        bgColor,
        logoBase64,
        businessName,
        photoSize,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = onlyGid
        ? (filtered[0].title || 'gallery').replace(/\s+/g, '-')
        : `portfolio-${businessName.replace(/\s+/g, '-')}`
      a.download = `${name}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF failed:', err)
    } finally {
      setGenerating(null)
    }
  }

  const downloadZip = async (onlyGid?: string) => {
    const id = (onlyGid || 'all') + '-zip'
    setGenerating(id)
    try {
      const target = onlyGid ? groups.filter(g => g.id === onlyGid) : groups
      const zip = new JSZip()
      for (const g of target) {
        const folder = onlyGid ? zip : zip.folder(g.title.replace(/[/\\]/g, '-') || 'gallery')
        if (!folder) continue
        for (let i = 0; i < g.photos.length; i++) {
          try {
            const res = await fetch(g.photos[i])
            const blob = await res.blob()
            const ext = (g.photos[i].split('.').pop() || 'jpg').split('?')[0].slice(0, 5)
            folder.file(`photo-${String(i + 1).padStart(3, '0')}.${ext}`, blob)
          } catch { /* skip */ }
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = onlyGid
        ? (target[0]?.title || 'gallery').replace(/\s+/g, '-')
        : `photos-${businessName.replace(/\s+/g, '-')}`
      a.download = `${name}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP failed:', err)
    } finally {
      setGenerating(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl', maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ← חזרה לבחירה
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => downloadZip()} disabled={!!generating || totalPhotos === 0} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            color: totalPhotos > 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.25)',
            cursor: totalPhotos > 0 && !generating ? 'pointer' : 'default', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {generating === 'all-zip' ? 'מייצר ZIP...' : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>הורד ZIP</>)}
          </button>
          <button onClick={() => downloadPdf()} disabled={!!generating || totalPhotos === 0} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: totalPhotos > 0 ? '#6366f1' : 'rgba(255,255,255,.04)',
            color: totalPhotos > 0 ? '#fff' : 'rgba(255,255,255,.25)',
            border: 'none', cursor: totalPhotos > 0 && !generating ? 'pointer' : 'default',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {generating === 'all' ? 'מייצר PDF...' : 'הורד PDF מלא'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Sidebar: global settings ── */}
        <div style={{ width: 220, flexShrink: 0, position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Logo */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>לוגו גלובלי</div>
            {logoBase64 ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={logoBase64} alt="logo" style={{ maxWidth: 120, maxHeight: 60, borderRadius: 6, display: 'block' }} />
                <button onClick={() => { setLogoBase64(undefined); if (fileRef.current) fileRef.current.value = '' }} style={{
                  position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                  background: '#ef4444', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>×</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={{
                padding: '9px 14px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,.03)', border: '1px dashed rgba(255,255,255,.12)',
                color: 'rgba(255,255,255,.45)', cursor: 'pointer', fontFamily: 'inherit', width: '100%',
              }}>+ העלה לוגו</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: 'none' }} />
          </div>

          {/* Background color */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>צבע רקע</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESET_COLORS.map(c => (
                <button key={c.hex} onClick={() => setBgColor(c.hex)} title={c.label} style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer', background: c.hex,
                  border: bgColor === c.hex ? '2px solid #6366f1' : '1px solid rgba(255,255,255,.15)',
                  boxShadow: bgColor === c.hex ? '0 0 0 2px rgba(99,102,241,.3)' : 'none',
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={customColor} onChange={e => setCustomColor(e.target.value)} placeholder="#hex" maxLength={7}
                style={{
                  flex: 1, padding: '5px 8px', background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.08)', borderRadius: 6,
                  color: '#fff', fontSize: 11, fontFamily: 'monospace', outline: 'none',
                }} />
              <button onClick={() => { if (/^#[0-9a-fA-F]{6}$/.test(customColor)) setBgColor(customColor) }} style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: 'rgba(255,255,255,.06)', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: 'inherit',
              }}>OK</button>
            </div>
          </div>

          {/* Photo size */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>גודל תמונות</div>
            <div style={{
              display: 'flex', gap: 2, padding: 3,
              background: 'rgba(0,0,0,.25)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,.05)',
            }}>
              {([
                { key: 'small' as const, label: 'קטן' },
                { key: 'medium' as const, label: 'בינוני' },
                { key: 'large' as const, label: 'גדול' },
              ]).map(s => (
                <button key={s.key} onClick={() => setPhotoSize(s.key)} style={{
                  flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
                  background: photoSize === s.key ? 'rgba(99,102,241,.2)' : 'transparent',
                  color: photoSize === s.key ? '#c7d2fe' : 'rgba(255,255,255,.4)',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                  boxShadow: photoSize === s.key ? 'inset 0 1px 0 rgba(255,255,255,.08)' : 'none',
                }}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.3)', marginTop: 6, lineHeight: 1.5 }}>
              {photoSize === 'small' && '~12 תמונות בדף'}
              {photoSize === 'medium' && '~9 תמונות בדף'}
              {photoSize === 'large' && '~6 תמונות בדף'}
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', lineHeight: 1.6, padding: '10px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,.04)' }}>
            <b style={{ color: 'rgba(255,255,255,.5)' }}>ה-PDF מחולק לדפים:</b><br />
            כל אירוע בעמוד נפרד עם כותרת משלו. הפרופורציות של התמונות נשמרות.
          </div>
        </div>

        {/* ── Preview: gallery sections ── */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {groups.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.3)' }}>
              אין אירועים
            </div>
          ) : groups.map(g => {
            const gSize = g.photoSize || photoSize
            const perPage = PHOTOS_PER_PAGE[gSize]
            // Split into pages
            const pages: { photos: string[]; startIdx: number }[] = []
            for (let i = 0; i < g.photos.length; i += perPage) {
              pages.push({ photos: g.photos.slice(i, i + perPage), startIdx: i })
            }
            if (pages.length === 0) pages.push({ photos: [], startIdx: 0 })

            return (
              <div key={g.id} style={{
                background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                {/* Gallery control bar (on top) */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.04)',
                  background: 'rgba(0,0,0,.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', whiteSpace: 'nowrap' }}>
                      {g.title || 'ללא כותרת'}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.3)', whiteSpace: 'nowrap' }}>
                      · {g.photos.length} תמונות · {pages.length} {pages.length === 1 ? 'עמוד' : 'עמודים'}
                    </span>
                  </div>

                  {/* Per-gallery size toggle */}
                  <div style={{
                    display: 'flex', gap: 2, padding: 2,
                    background: 'rgba(0,0,0,.3)', borderRadius: 7,
                    border: '1px solid rgba(255,255,255,.05)',
                  }}>
                    {([
                      { key: 'small' as const, label: 'S' },
                      { key: 'medium' as const, label: 'M' },
                      { key: 'large' as const, label: 'L' },
                    ]).map(s => (
                      <button
                        key={s.key}
                        onClick={() => updateGallerySize(g.id, s.key)}
                        title={s.key === 'small' ? 'קטן' : s.key === 'medium' ? 'בינוני' : 'גדול'}
                        style={{
                          padding: '3px 9px', borderRadius: 5, fontSize: 10.5, fontWeight: 700,
                          background: gSize === s.key ? 'rgba(99,102,241,.25)' : 'transparent',
                          color: gSize === s.key ? '#c7d2fe' : 'rgba(255,255,255,.4)',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                          minWidth: 24,
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    <button
                      onClick={() => removeGallery(g.id)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10.5,
                        background: 'transparent', border: '1px solid rgba(255,255,255,.08)',
                        color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >הסר</button>
                    <button
                      onClick={() => downloadZip(g.id)}
                      disabled={!!generating || g.photos.length === 0}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 500,
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                        color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{generating === g.id + '-zip' ? '...' : 'ZIP'}</button>
                    <button
                      onClick={() => downloadPdf(g.id)}
                      disabled={!!generating || g.photos.length === 0}
                      style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                        background: g.photos.length > 0 ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.04)',
                        border: `1px solid ${g.photos.length > 0 ? 'rgba(99,102,241,.35)' : 'rgba(255,255,255,.08)'}`,
                        color: g.photos.length > 0 ? '#a5b4fc' : 'rgba(255,255,255,.25)',
                        cursor: g.photos.length > 0 && !generating ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                      }}
                    >{generating === g.id ? 'מייצר...' : 'הורד PDF'}</button>
                  </div>
                </div>

                {/* Multi-page preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: 'rgba(0,0,0,.15)' }}>
                  {pages.map((page, pageIdx) => {
                    const photoH = gSize === 'small' ? 72 : gSize === 'medium' ? 95 : 135
                    return (
                      <div key={pageIdx} style={{
                        background: bgColor, padding: '10px 14px', aspectRatio: '16/9',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        borderRadius: 6, transition: 'background .2s',
                        boxShadow: '0 2px 12px rgba(0,0,0,.3)',
                      }}>
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {pageIdx === 0 ? (
                              <input
                                value={g.title}
                                onChange={e => updateTitle(g.id, e.target.value)}
                                placeholder="שם האירוע..."
                                style={{
                                  width: '100%', padding: '1px 2px', boxSizing: 'border-box',
                                  background: 'transparent', border: 'none',
                                  borderBottom: `1px dashed ${isDark(bgColor) ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'}`,
                                  fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                                  color: textColor, outline: 'none', direction: 'rtl',
                                  letterSpacing: '-0.01em',
                                }}
                              />
                            ) : (
                              <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>
                                {g.title}  ·  {pageIdx + 1}/{pages.length}
                              </div>
                            )}
                          </div>
                          {logoBase64 && pageIdx === 0 && (
                            <img src={logoBase64} alt="" style={{ maxHeight: 24, maxWidth: 70, flexShrink: 0 }} />
                          )}
                          {pages.length > 1 && pageIdx === 0 && (
                            <div style={{ fontSize: 9.5, color: subtextColor, flexShrink: 0, whiteSpace: 'nowrap' }}>
                              1/{pages.length}
                            </div>
                          )}
                        </div>

                        {/* Photo flow */}
                        {page.photos.length === 0 ? (
                          <div style={{ padding: 20, textAlign: 'center', color: subtextColor, fontSize: 12, flex: 1 }}>
                            אין תמונות
                          </div>
                        ) : (
                          <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1, alignContent: 'flex-start',
                          }}>
                            {page.photos.map((url, localIdx) => {
                              const idx = page.startIdx + localIdx
                              const isDragging = dragInfo?.gid === g.id && dragInfo.idx === idx
                              const isOver = dragOver?.gid === g.id && dragOver.idx === idx
                              return (
                                <div
                                  key={`${url}-${idx}`}
                                  draggable
                                  onDragStart={() => onDragStart(g.id, idx)}
                                  onDragOver={(e) => onDragOver(e, g.id, idx)}
                                  onDrop={() => onDrop(g.id, idx)}
                                  onDragEnd={() => { setDragInfo(null); setDragOver(null) }}
                                  style={{
                                    position: 'relative', borderRadius: 3, overflow: 'hidden',
                                    cursor: 'grab', opacity: isDragging ? 0.4 : 1,
                                    outline: isOver ? '2px solid #6366f1' : 'none', outlineOffset: -2,
                                    transition: 'opacity .12s, height .2s',
                                    height: photoH,
                                    background: isDark(bgColor) ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)',
                                  }}
                                >
                                  <img src={url} alt=""
                                    style={{ height: '100%', width: 'auto', display: 'block' }}
                                    loading="lazy" />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removePhoto(g.id, idx) }}
                                    style={{
                                      position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 4,
                                      background: 'rgba(0,0,0,.65)', border: 'none', color: '#fff', fontSize: 11,
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      opacity: 0.6, transition: 'opacity .12s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
                                  >×</button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
