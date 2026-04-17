import { useState, useEffect } from 'react'

// ─── Portfolio customization settings (stored in localStorage) ──────────

export interface PortfolioSettings {
  accentColor: string
  bgStyle: 'dark' | 'midnight' | 'gradient'
  tagline: string
  showStudioBadge: boolean
  hiddenGalleryIds: string[]
}

export const DEFAULT_SETTINGS: PortfolioSettings = {
  accentColor: '#6366f1',
  bgStyle: 'dark',
  tagline: '',
  showStudioBadge: true,
  hiddenGalleryIds: [],
}

export function loadPortfolioSettings(clientId: string): PortfolioSettings {
  try {
    const raw = localStorage.getItem(`portfolio-settings-${clientId}`)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

export function savePortfolioSettings(clientId: string, settings: PortfolioSettings) {
  localStorage.setItem(`portfolio-settings-${clientId}`, JSON.stringify(settings))
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  delivery_settings: Record<string, unknown> | null
}

interface PortfolioEditorProps {
  clientId: string
  clientName: string
  studioName: string
  galleries: GalleryRow[]
  publicUrl: string
}

const ACCENT_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#f43f5e', label: 'Rose' },
  { hex: '#ffffff', label: 'White' },
]

const BG_STYLES = [
  { key: 'dark' as const, label: 'כהה', preview: '#050508' },
  { key: 'midnight' as const, label: 'חצות', preview: '#0a0a1a' },
  { key: 'gradient' as const, label: 'גרדיאנט', preview: 'linear-gradient(135deg, #0a0a1a, #1a0a2a)' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function PortfolioEditor({ clientId, clientName, studioName, galleries, publicUrl }: PortfolioEditorProps) {
  const [settings, setSettings] = useState<PortfolioSettings>(() => loadPortfolioSettings(clientId))
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  // Save on change
  useEffect(() => {
    savePortfolioSettings(clientId, settings)
  }, [settings, clientId])

  const update = (patch: Partial<PortfolioSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const toggleGallery = (id: string) => {
    update({
      hiddenGalleryIds: settings.hiddenGalleryIds.includes(id)
        ? settings.hiddenGalleryIds.filter(g => g !== id)
        : [...settings.hiddenGalleryIds, id],
    })
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const save = () => {
    savePortfolioSettings(clientId, settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const visibleCount = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id)).length

  return (
    <div style={{ direction: 'rtl', maxWidth: 900, margin: '0 auto', padding: '24px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          עורך האתר
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', margin: 0 }}>
          התאם אישית את דף הפורטפוליו הציבורי שלך
        </p>
      </div>

      {/* URL + Share */}
      <div style={{
        padding: '14px 18px', marginBottom: 24,
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          flex: 1, fontSize: 13, color: 'rgba(255,255,255,.55)',
          fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {publicUrl}
        </div>
        <button onClick={copyUrl} style={{
          padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: copied ? 'rgba(16,185,129,.15)' : '#6366f1',
          border: copied ? '1px solid rgba(16,185,129,.25)' : 'none',
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
          whiteSpace: 'nowrap',
        }}>
          {copied ? '✓ הועתק' : 'העתק קישור'}
        </button>
        <a href={publicUrl} target="_blank" rel="noopener" style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.7)', cursor: 'pointer', textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}>
          פתח באתר ↗
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Left column: appearance ── */}
        <div style={{
          padding: 20, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
          borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>מראה</div>

          {/* Accent color */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>צבע מבטא</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACCENT_COLORS.map(c => (
                <button key={c.hex} onClick={() => update({ accentColor: c.hex })} title={c.label} style={{
                  width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                  background: c.hex,
                  border: settings.accentColor === c.hex ? '3px solid #fff' : '1px solid rgba(255,255,255,.15)',
                  boxShadow: settings.accentColor === c.hex ? `0 0 12px ${c.hex}55` : 'none',
                  transition: 'all .15s',
                }} />
              ))}
            </div>
          </div>

          {/* Background style */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>סגנון רקע</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {BG_STYLES.map(bg => (
                <button key={bg.key} onClick={() => update({ bgStyle: bg.key })} style={{
                  flex: 1, padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
                  background: bg.preview,
                  border: settings.bgStyle === bg.key ? `2px solid ${settings.accentColor}` : '1px solid rgba(255,255,255,.1)',
                  color: settings.bgStyle === bg.key ? '#fff' : 'rgba(255,255,255,.5)',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit', textAlign: 'center',
                  transition: 'all .15s',
                }}>
                  {bg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tagline */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>תיאור / טאגליין</div>
            <input
              value={settings.tagline}
              onChange={e => update({ tagline: e.target.value })}
              placeholder="הפקת אירועים מהשורה הראשונה"
              style={{
                width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit',
                outline: 'none', direction: 'rtl',
              }}
            />
          </div>

          {/* Studio badge toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>הצג באדג' סטודיו</span>
            <button onClick={() => update({ showStudioBadge: !settings.showStudioBadge })} style={{
              width: 42, height: 24, borderRadius: 12, cursor: 'pointer', padding: 2,
              background: settings.showStudioBadge ? settings.accentColor : 'rgba(255,255,255,.1)',
              border: 'none', transition: 'background .2s', display: 'flex', alignItems: 'center',
              justifyContent: settings.showStudioBadge ? 'flex-start' : 'flex-end',
              direction: 'ltr',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,.3)', transition: 'all .2s',
              }} />
            </button>
          </div>
        </div>

        {/* ── Right column: galleries ── */}
        <div style={{
          padding: 20, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
          borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>גלריות באתר</div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{visibleCount} / {galleries.length}</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300 }}>
            {galleries.map(g => {
              const hidden = settings.hiddenGalleryIds.includes(g.id)
              const readS = (k: string) => { const v = (g.delivery_settings || {} as Record<string, unknown>)[k]; return typeof v === 'string' ? v : '' }
              return (
                <div key={g.id} onClick={() => toggleGallery(g.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 9, cursor: 'pointer',
                  background: hidden ? 'rgba(255,255,255,.01)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${hidden ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.06)'}`,
                  opacity: hidden ? 0.4 : 1, transition: 'all .15s',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${hidden ? 'rgba(255,255,255,.15)' : settings.accentColor}`,
                    background: hidden ? 'transparent' : settings.accentColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s',
                  }}>
                    {!hidden && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', marginTop: 1 }}>
                      {readS('eventType') || 'אחר'} · {g.image_count} תמונות
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Save + Preview bar */}
      <div style={{
        marginTop: 20, padding: '14px 18px',
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Live preview mini */}
        <div style={{
          width: 180, height: 100, borderRadius: 8, overflow: 'hidden',
          background: settings.bgStyle === 'gradient' ? 'linear-gradient(135deg, #0a0a1a, #1a0a2a)' : settings.bgStyle === 'midnight' ? '#0a0a1a' : '#050508',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,.06)', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0, background: `radial-gradient(circle at center, ${settings.accentColor}15 0%, transparent 70%)`,
          }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', zIndex: 1 }}>{clientName}</div>
          {settings.tagline && <div style={{ fontSize: 7, color: 'rgba(255,255,255,.4)', zIndex: 1, marginTop: 2 }}>{settings.tagline}</div>}
          <div style={{ display: 'flex', gap: 3, marginTop: 6, zIndex: 1 }}>
            {[1,2,3].map(i => <div key={i} style={{ width: 16, height: 12, borderRadius: 2, background: `${settings.accentColor}30`, border: `1px solid ${settings.accentColor}40` }} />)}
          </div>
        </div>

        <button onClick={save} style={{
          padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: saved ? 'rgba(16,185,129,.15)' : settings.accentColor,
          border: saved ? '1px solid rgba(16,185,129,.25)' : 'none',
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
        }}>
          {saved ? '✓ נשמר' : 'שמור שינויים'}
        </button>
      </div>
    </div>
  )
}
