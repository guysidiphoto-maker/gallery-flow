import { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import { generatePitchPdf } from '../lib/pitchPdf'

interface PdfEditorProps {
  photos: string[]
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

export function PdfEditor({ photos: initialPhotos, businessName, onBack }: PdfEditorProps) {
  const [photoOrder, setPhotoOrder] = useState<string[]>(initialPhotos)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [customColor, setCustomColor] = useState('')
  const [logoBase64, setLogoBase64] = useState<string | undefined>()
  const [titleText, setTitleText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isDark = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 < 128
  }

  const textColor = isDark(bgColor) ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.85)'
  const subtextColor = isDark(bgColor) ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.4)'

  // ── Drag & drop ─────────────────────────────────────────────────────

  const onDragStart = useCallback((idx: number) => setDragIdx(idx), [])
  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])
  const onDrop = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    setPhotoOrder(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    setDragIdx(null)
    setDragOverIdx(null)
  }, [dragIdx])

  // ── Logo upload ─────────────────────────────────────────────────────

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogoBase64(reader.result as string)
    reader.readAsDataURL(file)
  }

  // ── Remove photo ────────────────────────────────────────────────────

  const removePhoto = (idx: number) => {
    setPhotoOrder(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Generate PDF ────────────────────────────────────────────────────

  const download = async () => {
    setGenerating(true)
    try {
      const blob = await generatePitchPdf({
        photos: photoOrder,
        bgColor,
        logoBase64,
        title: titleText || undefined,
        businessName,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `portfolio-${businessName.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  const sendEmail = async () => {
    await download()
    window.open(`mailto:?subject=${encodeURIComponent(`Portfolio — ${businessName}`)}&body=${encodeURIComponent('PDF attached.')}`)
  }

  const downloadZip = async () => {
    setGenerating(true)
    try {
      const zip = new JSZip()
      for (let i = 0; i < photoOrder.length; i++) {
        const url = photoOrder[i]
        try {
          const res = await fetch(url)
          const blob = await res.blob()
          const ext = (url.split('.').pop() || 'jpg').split('?')[0].slice(0, 5)
          zip.file(`photo-${String(i + 1).padStart(3, '0')}.${ext}`, blob)
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
      setGenerating(false)
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
          <button onClick={sendEmail} disabled={generating} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            שלח במייל
          </button>
          <button onClick={downloadZip} disabled={generating || photoOrder.length === 0} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            color: photoOrder.length > 0 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.25)',
            cursor: photoOrder.length > 0 ? 'pointer' : 'default', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            הורד ZIP
          </button>
          <button onClick={download} disabled={generating || photoOrder.length === 0} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: photoOrder.length > 0 ? '#6366f1' : 'rgba(255,255,255,.04)',
            color: photoOrder.length > 0 ? '#fff' : 'rgba(255,255,255,.25)',
            border: 'none', cursor: photoOrder.length > 0 ? 'pointer' : 'default',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {generating ? 'מייצר...' : 'הורד PDF'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>

        {/* ── Sidebar: edit controls ── */}
        <div style={{
          width: 240, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Logo */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>לוגו</div>
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
                padding: '10px 16px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,.03)', border: '1px dashed rgba(255,255,255,.12)',
                color: 'rgba(255,255,255,.45)', cursor: 'pointer', fontFamily: 'inherit', width: '100%',
              }}>
                + העלה לוגו
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: 'none' }} />
          </div>

          {/* Title */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>כותרת</div>
            <input
              value={titleText}
              onChange={e => setTitleText(e.target.value)}
              placeholder="כותרת ל-PDF..."
              style={{
                width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 8, color: '#fff', fontSize: 13, fontFamily: 'inherit',
                outline: 'none', direction: 'rtl',
              }}
            />
          </div>

          {/* Background color */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>צבע רקע</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setBgColor(c.hex)}
                  title={c.label}
                  style={{
                    width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                    background: c.hex,
                    border: bgColor === c.hex ? '2px solid #6366f1' : '1px solid rgba(255,255,255,.15)',
                    boxShadow: bgColor === c.hex ? '0 0 0 2px rgba(99,102,241,.3)' : 'none',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                value={customColor}
                onChange={e => setCustomColor(e.target.value)}
                placeholder="#hex"
                maxLength={7}
                style={{
                  flex: 1, padding: '6px 8px', background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.08)', borderRadius: 6,
                  color: '#fff', fontSize: 11, fontFamily: 'monospace', outline: 'none',
                }}
              />
              <button
                onClick={() => { if (/^#[0-9a-fA-F]{6}$/.test(customColor)) setBgColor(customColor) }}
                style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: 'rgba(255,255,255,.06)', border: 'none',
                  color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                OK
              </button>
            </div>
          </div>

          {/* Info */}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', lineHeight: 1.5 }}>
            {photoOrder.length} תמונות · גרור לשינוי סדר
          </div>
        </div>

        {/* ── Preview ── */}
        <div style={{
          flex: 1, minWidth: 0,
          background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
          borderRadius: 14, padding: 20, overflow: 'auto', maxHeight: 'calc(100vh - 200px)',
        }}>
          {/* PDF preview mock */}
          <div style={{
            background: bgColor, borderRadius: 8, padding: 32, minHeight: 400,
            boxShadow: '0 4px 24px rgba(0,0,0,.3)',
            transition: 'background .2s',
          }}>
            {/* Logo */}
            {logoBase64 && (
              <div style={{ marginBottom: 20, textAlign: 'center' }}>
                <img src={logoBase64} alt="logo" style={{ maxWidth: 140, maxHeight: 70 }} />
              </div>
            )}

            {/* Title */}
            {titleText && (
              <div style={{
                fontSize: 22, fontWeight: 700, color: textColor,
                textAlign: 'center', marginBottom: 8, letterSpacing: '-0.02em',
              }}>
                {titleText}
              </div>
            )}

            {/* Business name */}
            <div style={{
              fontSize: 13, color: subtextColor, textAlign: 'center', marginBottom: 24,
            }}>
              {businessName}
            </div>

            {/* Accent line */}
            <div style={{ width: 60, height: 2, background: '#6366f1', margin: '0 auto 24px', borderRadius: 1 }} />

            {/* Photo grid */}
            {photoOrder.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: subtextColor, fontSize: 14 }}>
                אין תמונות
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 8,
              }}>
                {photoOrder.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDrop={() => onDrop(idx)}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                    style={{
                      position: 'relative', aspectRatio: '3/2', borderRadius: 6, overflow: 'hidden',
                      cursor: 'grab', opacity: dragIdx === idx ? 0.4 : 1,
                      outline: dragOverIdx === idx ? '2px solid #6366f1' : 'none',
                      outlineOffset: -2, transition: 'opacity .15s',
                    }}
                  >
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    {/* Remove button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removePhoto(idx) }}
                      style={{
                        position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 4,
                        background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff', fontSize: 12,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0.6, transition: 'opacity .12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
