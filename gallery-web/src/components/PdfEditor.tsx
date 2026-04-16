import { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import { generatePitchPdf } from '../lib/pitchPdf'

export interface PdfEditorGallery {
  id: string
  title: string       // editable, defaults to gallery name
  photos: string[]    // URLs (original aspect preserved)
}

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
        galleries: filtered.map(g => ({ title: g.title, photos: g.photos })),
        bgColor,
        logoBase64,
        businessName,
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

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', lineHeight: 1.6, padding: '10px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,.04)' }}>
            <b style={{ color: 'rgba(255,255,255,.5)' }}>ה-PDF מחולק לדפים:</b><br />
            כל אירוע בעמוד נפרד עם כותרת משלו. ניתן להוריד את כל ה-PDF או רק אירוע ספציפי.
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
          ) : groups.map(g => (
            <div key={g.id} style={{
              background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 14, overflow: 'hidden',
            }}>
              {/* Page simulation */}
              <div style={{ background: bgColor, padding: 28, minHeight: 200, transition: 'background .2s' }}>
                {logoBase64 && (
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <img src={logoBase64} alt="" style={{ maxWidth: 120, maxHeight: 50 }} />
                  </div>
                )}

                {/* Editable title */}
                <div style={{ marginBottom: 6 }}>
                  <input
                    value={g.title}
                    onChange={e => updateTitle(g.id, e.target.value)}
                    placeholder="שם האירוע..."
                    style={{
                      width: '100%', padding: '4px 6px', boxSizing: 'border-box',
                      background: 'transparent', border: 'none', borderBottom: `1px dashed ${isDark(bgColor) ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.15)'}`,
                      fontSize: 22, fontWeight: 700, fontFamily: 'inherit',
                      color: textColor, outline: 'none', direction: 'rtl',
                      letterSpacing: '-0.01em',
                    }}
                  />
                  <div style={{ width: 40, height: 2, background: '#6366f1', marginTop: 4, borderRadius: 1 }} />
                </div>

                <div style={{ fontSize: 11, color: subtextColor, marginBottom: 16 }}>
                  {g.photos.length} תמונות
                </div>

                {/* Photo grid (preserves aspect ratio - uses object-fit: contain via natural sizing) */}
                {g.photos.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: subtextColor, fontSize: 12 }}>
                    אין תמונות
                  </div>
                ) : (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
                  }}>
                    {g.photos.map((url, idx) => {
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
                            position: 'relative', borderRadius: 4, overflow: 'hidden',
                            cursor: 'grab', opacity: isDragging ? 0.4 : 1,
                            outline: isOver ? '2px solid #6366f1' : 'none', outlineOffset: -2,
                            transition: 'opacity .12s',
                            background: isDark(bgColor) ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.03)',
                          }}
                        >
                          {/* Keep natural aspect ratio using img display */}
                          <img src={url} alt=""
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                            loading="lazy" />
                          <button
                            onClick={(e) => { e.stopPropagation(); removePhoto(g.id, idx) }}
                            style={{
                              position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 4,
                              background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', fontSize: 12,
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

              {/* Gallery action bar */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,.04)',
                background: 'rgba(0,0,0,.2)',
              }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                  {g.title || 'ללא כותרת'}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => removeGallery(g.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 11,
                      background: 'transparent', border: '1px solid rgba(255,255,255,.08)',
                      color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    הסר אירוע
                  </button>
                  <button
                    onClick={() => downloadZip(g.id)}
                    disabled={!!generating || g.photos.length === 0}
                    style={{
                      padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 500,
                      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                      color: 'rgba(255,255,255,.75)', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {generating === g.id + '-zip' ? '...' : 'ZIP'}
                  </button>
                  <button
                    onClick={() => downloadPdf(g.id)}
                    disabled={!!generating || g.photos.length === 0}
                    style={{
                      padding: '5px 14px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      background: g.photos.length > 0 ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.04)',
                      border: `1px solid ${g.photos.length > 0 ? 'rgba(99,102,241,.35)' : 'rgba(255,255,255,.08)'}`,
                      color: g.photos.length > 0 ? '#a5b4fc' : 'rgba(255,255,255,.25)',
                      cursor: g.photos.length > 0 && !generating ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                    }}
                  >
                    {generating === g.id ? 'מייצר...' : 'הורד PDF של האירוע'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
