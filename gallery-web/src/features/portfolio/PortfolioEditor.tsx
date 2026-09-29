import { useState, useEffect, useRef } from 'react'
import {
  type PortfolioSettings,
  DEFAULT_SETTINGS,
  loadPortfolioSettings,
  savePortfolioSettings,
  getFontFamily,
} from './portfolioSettings'
// Re-export so call sites that previously imported from PortfolioEditor
// keep compiling — but they should migrate to ./portfolioSettings to
// avoid pulling in the editor when only the settings are needed.
export { type PortfolioSettings, DEFAULT_SETTINGS, loadPortfolioSettings, savePortfolioSettings }

// Load Hebrew Google Fonts
const HEBREW_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&family=Rubik:wght@300;400;500;600;700;800&family=Assistant:wght@300;400;500;600;700;800&display=swap'
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${HEBREW_FONTS_URL}"]`)) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = HEBREW_FONTS_URL
  document.head.appendChild(link)
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
  covers: Map<string, string>
  publicUrl: string
}

const ACCENT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
  '#d946ef', '#84cc16', '#ffffff', '#64748b',
]

const BG_STYLES: { key: PortfolioSettings['bgStyle']; label: string; bg: string }[] = [
  { key: 'dark', label: 'כהה', bg: '#050508' },
  { key: 'midnight', label: 'חצות', bg: '#080818' },
  { key: 'gradient', label: 'סגול', bg: 'linear-gradient(135deg, #050510, #150a20)' },
  { key: 'deep-blue', label: 'כחול עמוק', bg: 'linear-gradient(135deg, #050510, #0a1628)' },
]

const FONT_STYLES: { key: PortfolioSettings['fontStyle']; label: string; sample: string; family: string }[] = [
  { key: 'modern', label: 'מודרני', sample: 'Aa', family: '-apple-system, sans-serif' },
  { key: 'elegant', label: 'אלגנטי', sample: 'Aa', family: 'Georgia, serif' },
  { key: 'bold', label: 'בולט', sample: 'Aa', family: 'Impact, sans-serif' },
  { key: 'heebo', label: 'חיבו', sample: 'אב', family: "'Heebo', sans-serif" },
  { key: 'rubik', label: 'רוביק', sample: 'אב', family: "'Rubik', sans-serif" },
  { key: 'assistant', label: 'אסיסטנט', sample: 'אב', family: "'Assistant', sans-serif" },
]

const HERO_STYLES: { key: PortfolioSettings['heroStyle']; label: string; icon: string }[] = [
  { key: 'blur', label: 'תמונה מטושטשת', icon: 'M4 4h16v16H4z' },
  { key: 'cover', label: 'תמונת כיסוי', icon: 'M4 4h16v16H4z' },
  { key: 'gradient-only', label: 'גרדיאנט בלבד', icon: 'M4 4h16v16H4z' },
]

// Re-exported from ./portfolioSettings — keeping the export so callers
// that previously imported from PortfolioEditor still link.
export { getFontFamily }

// ─── Component ──────────────────────────────────────────────────────────────

export function PortfolioEditor({ clientId, clientName, studioName, galleries, covers, publicUrl }: PortfolioEditorProps) {
  const [settings, setSettings] = useState<PortfolioSettings>(() => loadPortfolioSettings(clientId))
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState<'brand' | 'design' | 'content' | 'contact'>('brand')
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { savePortfolioSettings(clientId, settings) }, [settings, clientId])

  const update = (patch: Partial<PortfolioSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update({ logoBase64: reader.result as string })
    reader.readAsDataURL(file)
  }

  const toggleGallery = (id: string) => {
    update({
      hiddenGalleryIds: settings.hiddenGalleryIds.includes(id)
        ? settings.hiddenGalleryIds.filter(g => g !== id)
        : [...settings.hiddenGalleryIds, id],
    })
  }

  const save = () => {
    savePortfolioSettings(clientId, settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const visibleCount = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id)).length

  // Get hero cover URL
  const heroCoverUrl = settings.heroCoverGalleryId ? covers.get(settings.heroCoverGalleryId) : covers.values().next().value

  // ── Section tabs ──────────────────────────────────────────────────────

  const SECTIONS: { key: typeof activeSection; label: string; icon: React.ReactNode }[] = [
    { key: 'brand', label: 'מיתוג', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
    { key: 'design', label: 'עיצוב', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> },
    { key: 'content', label: 'תוכן', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg> },
    { key: 'contact', label: 'קשר', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
  ]

  return (
    // Dark surface deliberate. Like SocialManager, the entire palette
    // (white-on-rgba) was designed against a near-black canvas — without
    // this wrap every label, eyebrow, and panel title disappears on the
    // cream parent. The dark island also reads as a "site editor" tool,
    // which matches what this component is.
    <div style={{
      direction: 'rtl', maxWidth: 1100, margin: '0 auto', padding: '20px 24px',
      background: '#0a0a0f', color: 'rgba(255,255,255,.9)', borderRadius: 14,
    }}>
      <style>{`
        @keyframes pe-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pe-savedPulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
        .pe-input:focus {
          border-color: ${settings.accentColor}60 !important;
          box-shadow: 0 0 0 3px ${settings.accentColor}12 !important;
        }
        .pe-input::placeholder { color: rgba(255,255,255,.2); }
        .pe-color-swatch { transition: all .2s cubic-bezier(.4,0,.2,1); }
        .pe-color-swatch:hover { transform: scale(1.12); }
        .pe-gallery-row { transition: all .2s cubic-bezier(.4,0,.2,1); }
        .pe-gallery-row:hover { background: rgba(255,255,255,.04) !important; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, paddingBottom: 20,
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <div>
          <h2 style={{
            fontSize: 22, fontWeight: 800, color: '#fff',
            margin: '0 0 4px', letterSpacing: '-0.03em',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${settings.accentColor}15`,
              border: `1px solid ${settings.accentColor}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={settings.accentColor} strokeWidth="2" strokeLinecap="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </div>
            עורך האתר
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', margin: 0 }}>עצב את דף הפורטפוליו שלך</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }} style={{
            padding: '9px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: copied ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${copied ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.08)'}`,
            color: copied ? '#34d399' : 'rgba(255,255,255,.8)',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all .25s cubic-bezier(.4,0,.2,1)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {copied
                ? <polyline points="20 6 9 17 4 12" />
                : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
              }
            </svg>
            {copied ? 'הועתק' : 'העתק קישור'}
          </button>
          <a href={publicUrl} target="_blank" rel="noopener" style={{
            padding: '9px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.8)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all .2s',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            פתח
          </a>
          <button onClick={save} style={{
            padding: '9px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: saved ? 'linear-gradient(135deg, #10b981, #34d399)' : `linear-gradient(135deg, ${settings.accentColor}, ${settings.accentColor}dd)`,
            border: 'none',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all .25s cubic-bezier(.4,0,.2,1)',
            boxShadow: saved ? '0 4px 16px rgba(16,185,129,.2)' : `0 4px 16px ${settings.accentColor}25`,
            animation: saved ? 'pe-savedPulse .4s ease' : 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {saved && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {saved ? 'נשמר' : 'שמור'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left: Live preview ── */}
        <div style={{
          width: previewMode === 'desktop' ? 480 : 320, flexShrink: 0, position: 'sticky', top: 20,
          transition: 'width .4s cubic-bezier(.4,0,.2,1)',
        }}>
          {/* Preview mode toggle */}
          <div style={{
            display: 'flex', gap: 2, marginBottom: 12, padding: 3,
            background: 'rgba(0,0,0,.4)', borderRadius: 10, border: '1px solid rgba(255,255,255,.05)',
            width: 'fit-content',
          }}>
            {(['mobile', 'desktop'] as const).map(mode => (
              <button key={mode} onClick={() => setPreviewMode(mode)} style={{
                padding: '6px 16px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: previewMode === mode ? `${settings.accentColor}20` : 'transparent',
                color: previewMode === mode ? '#fff' : 'rgba(255,255,255,.35)',
                transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {mode === 'mobile' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                )}
                {mode === 'mobile' ? 'מובייל' : 'דסקטופ'}
              </button>
            ))}
          </div>

          <div style={{
            borderRadius: previewMode === 'mobile' ? 28 : 14,
            overflow: 'hidden',
            border: previewMode === 'mobile' ? '6px solid rgba(255,255,255,.06)' : '1px solid rgba(255,255,255,.06)',
            boxShadow: '0 16px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.03)',
            transition: 'all .4s cubic-bezier(.4,0,.2,1)',
          }}>
          {/* Mini portfolio preview */}
          <div style={{
            aspectRatio: previewMode === 'desktop' ? '16/10' : '9/16',
            overflow: 'hidden',
            background: BG_STYLES.find(b => b.key === settings.bgStyle)?.bg || '#050508',
            display: 'flex', flexDirection: 'column',
            fontFamily: getFontFamily(settings.fontStyle),
            transition: 'aspect-ratio .4s cubic-bezier(.4,0,.2,1), background .3s',
          }}>
            {/* Mini hero */}
            <div style={{
              flex: '0 0 35%', position: 'relative', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {heroCoverUrl && settings.heroStyle !== 'gradient-only' && (
                <img src={heroCoverUrl} alt="" style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  filter: settings.heroStyle === 'blur' ? 'blur(12px) brightness(.4)' : 'brightness(.5)',
                  transform: 'scale(1.1)',
                }} />
              )}
              <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse, ${settings.accentColor}20, transparent 70%)` }} />
              <div style={{ position: 'relative', textAlign: 'center', padding: 12 }}>
                {settings.logoBase64 && (
                  <img src={settings.logoBase64} alt="" style={{ maxHeight: 28, maxWidth: 80, marginBottom: 6, display: 'block', marginInline: 'auto' }} />
                )}
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{settings.pageTitle || clientName}</div>
                {settings.tagline && <div style={{ fontSize: 8, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{settings.tagline}</div>}
              </div>
            </div>

            {/* Mini event type cards */}
            <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,.4)', marginBottom: 2 }}>סוגי אירועים</div>
              <div style={{
                display: 'grid', gridTemplateColumns: `repeat(${settings.gridColumns}, 1fr)`, gap: 4, flex: 1,
              }}>
                {galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id)).slice(0, 4).map(g => {
                  const cov = covers.get(g.id)
                  return (
                    <div key={g.id} style={{
                      borderRadius: 6, overflow: 'hidden', position: 'relative',
                      background: 'rgba(255,255,255,.03)', border: `1px solid ${settings.accentColor}20`,
                    }}>
                      {cov && <img src={cov} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 4,
                        background: 'linear-gradient(to top, rgba(0,0,0,.7), transparent)',
                      }}>
                        <div style={{ fontSize: 7, fontWeight: 700, color: '#fff' }}>{g.name}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mini contact bar */}
            {(settings.phone || settings.email || settings.instagram) && (
              <div style={{
                padding: '6px 8px', borderTop: `1px solid ${settings.accentColor}15`,
                display: 'flex', justifyContent: 'center', gap: 8,
                fontSize: 6, color: 'rgba(255,255,255,.3)',
              }}>
                {settings.phone && <span>{settings.phone}</span>}
                {settings.email && <span>{settings.email}</span>}
                {settings.instagram && <span>@{settings.instagram}</span>}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ── Right: Editor panels ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section tabs */}
          <div style={{
            display: 'flex', gap: 3, marginBottom: 20, padding: 3,
            background: 'rgba(0,0,0,.35)', borderRadius: 12, border: '1px solid rgba(255,255,255,.05)',
          }}>
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
                flex: 1, padding: '10px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                background: activeSection === s.key ? `${settings.accentColor}18` : 'transparent',
                color: activeSection === s.key ? '#fff' : 'rgba(255,255,255,.35)',
                border: activeSection === s.key ? `1px solid ${settings.accentColor}30` : '1px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
                <span style={{ opacity: activeSection === s.key ? 1 : .5, transition: 'opacity .2s' }}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          {/* ══ Brand section ══ */}
          {activeSection === 'brand' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'pe-fadeIn .3s ease both' }}>
              {/* Logo */}
              <Panel title="לוגו" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>} accent={settings.accentColor}>
                {settings.logoBase64 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      padding: 12, borderRadius: 12,
                      background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
                    }}>
                      <img src={settings.logoBase64} alt="" style={{ maxHeight: 56, maxWidth: 140, display: 'block' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button onClick={() => fileRef.current?.click()} style={btnStyle}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        החלף
                      </button>
                      <button onClick={() => update({ logoBase64: '' })} style={{ ...btnStyle, color: '#f87171', borderColor: 'rgba(248,113,113,.15)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        הסר
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} style={{
                    width: '100%', padding: '28px 16px', borderRadius: 14,
                    background: 'rgba(255,255,255,.015)', border: '2px dashed rgba(255,255,255,.08)',
                    color: 'rgba(255,255,255,.35)', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${settings.accentColor}40`
                    e.currentTarget.style.background = `${settings.accentColor}08`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'
                    e.currentTarget.style.background = 'rgba(255,255,255,.015)'
                  }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'rgba(255,255,255,.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    העלה לוגו
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: 'none' }} />
              </Panel>

              {/* Page title */}
              <Panel title="כותרת ראשית" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>} accent={settings.accentColor}>
                <input
                  className="pe-input"
                  value={settings.pageTitle}
                  onChange={e => update({ pageTitle: e.target.value })}
                  placeholder={clientName}
                  style={inputStyle}
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  ברירת מחדל: שם הלקוח
                </div>
              </Panel>

              {/* Tagline */}
              <Panel title="טאגליין" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>} accent={settings.accentColor}>
                <input
                  className="pe-input"
                  value={settings.tagline}
                  onChange={e => update({ tagline: e.target.value })}
                  placeholder="הפקות אירועים מהשורה הראשונה"
                  style={inputStyle}
                />
              </Panel>

              {/* Settings toggles */}
              <Panel title="הגדרות נוספות" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <ToggleRow label="הצג באדג' סטודיו" description={`Powered by ${studioName}`} checked={settings.showStudioBadge}
                    accent={settings.accentColor} onToggle={() => update({ showStudioBadge: !settings.showStudioBadge })} />
                  <div style={{ height: 1, background: 'rgba(255,255,255,.04)', margin: '4px 0' }} />
                  <ToggleRow label="הצג מספר תמונות" description="מציג את כמות התמונות בכל גלריה" checked={settings.showPhotoCounts}
                    accent={settings.accentColor} onToggle={() => update({ showPhotoCounts: !settings.showPhotoCounts })} />
                </div>
              </Panel>
            </div>
          )}

          {/* ══ Design section ══ */}
          {activeSection === 'design' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'pe-fadeIn .3s ease both' }}>
              {/* Accent color */}
              <Panel title="צבע מבטא" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ACCENT_COLORS.map(c => (
                    <button key={c} className="pe-color-swatch" onClick={() => update({ accentColor: c })} style={{
                      width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                      background: c,
                      border: settings.accentColor === c ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,.12)',
                      boxShadow: settings.accentColor === c ? `0 0 20px ${c}40, 0 0 0 4px ${c}15` : `inset 0 -2px 4px rgba(0,0,0,.2)`,
                      position: 'relative',
                      outline: 'none',
                    }}>
                      {settings.accentColor === c && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c === '#ffffff' ? '#000' : '#fff'} strokeWidth="3" strokeLinecap="round" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                {/* Current color indicator */}
                <div style={{
                  marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(0,0,0,.2)',
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: settings.accentColor, border: '1px solid rgba(255,255,255,.1)' }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontFamily: 'monospace' }}>{settings.accentColor}</span>
                </div>
              </Panel>

              {/* Background */}
              <Panel title="סגנון רקע" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {BG_STYLES.map(bg => (
                    <button key={bg.key} onClick={() => update({ bgStyle: bg.key })} style={{
                      padding: '20px 8px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                      background: bg.bg,
                      border: settings.bgStyle === bg.key ? `2px solid ${settings.accentColor}` : '1.5px solid rgba(255,255,255,.06)',
                      color: settings.bgStyle === bg.key ? '#fff' : 'rgba(255,255,255,.4)',
                      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                      boxShadow: settings.bgStyle === bg.key ? `0 0 16px ${settings.accentColor}20` : 'none',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      {settings.bgStyle === bg.key && (
                        <div style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 16, height: 16, borderRadius: '50%',
                          background: settings.accentColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                      )}
                      {bg.label}
                    </button>
                  ))}
                </div>
              </Panel>

              {/* Font */}
              <Panel title="סגנון גופן" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {FONT_STYLES.map(f => (
                    <button key={f.key} onClick={() => update({ fontStyle: f.key })} style={{
                      padding: '14px 8px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                      background: settings.fontStyle === f.key ? `${settings.accentColor}12` : 'rgba(255,255,255,.02)',
                      border: settings.fontStyle === f.key ? `2px solid ${settings.accentColor}35` : '1.5px solid rgba(255,255,255,.05)',
                      fontFamily: f.family, fontSize: 11, fontWeight: 600,
                      color: settings.fontStyle === f.key ? '#fff' : 'rgba(255,255,255,.35)',
                      transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                    }}>
                      <div style={{ fontSize: 22, marginBottom: 4, fontFamily: f.family, fontWeight: 700, lineHeight: 1.2 }}>{f.sample}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.45)', marginBottom: 4, fontFamily: f.family, fontWeight: 400 }}>
                        {f.key.includes('heebo') || f.key.includes('rubik') || f.key.includes('assistant') ? 'שלום עולם' : 'Hello World'}
                      </div>
                      {f.label}
                    </button>
                  ))}
                </div>
              </Panel>

              {/* Hero style */}
              <Panel title="סגנון Hero" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {HERO_STYLES.map(h => (
                    <button key={h.key} onClick={() => update({ heroStyle: h.key })} style={{
                      flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
                      background: settings.heroStyle === h.key ? `${settings.accentColor}12` : 'rgba(255,255,255,.02)',
                      border: settings.heroStyle === h.key ? `2px solid ${settings.accentColor}35` : '1.5px solid rgba(255,255,255,.05)',
                      color: settings.heroStyle === h.key ? '#fff' : 'rgba(255,255,255,.35)',
                      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                    }}>{h.label}</button>
                  ))}
                </div>
                {/* Hero cover picker */}
                {settings.heroStyle !== 'gradient-only' && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginBottom: 8, fontWeight: 500 }}>תמונת רקע</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {galleries.map(g => {
                        const cov = covers.get(g.id)
                        if (!cov) return null
                        const isSelected = settings.heroCoverGalleryId === g.id
                        return (
                          <button key={g.id} onClick={() => update({ heroCoverGalleryId: g.id })} style={{
                            width: 60, height: 42, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', padding: 0,
                            border: isSelected ? `2px solid ${settings.accentColor}` : '1.5px solid rgba(255,255,255,.08)',
                            background: 'rgba(255,255,255,.03)',
                            transition: 'all .15s cubic-bezier(.4,0,.2,1)',
                            boxShadow: isSelected ? `0 0 12px ${settings.accentColor}20` : 'none',
                            opacity: isSelected ? 1 : .7,
                          }}>
                            <img src={cov} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Panel>

              {/* Grid columns */}
              <Panel title="עמודות בגריד" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'flex', gap: 10 }}>
                  {([2, 3] as const).map(n => (
                    <button key={n} onClick={() => update({ gridColumns: n })} style={{
                      flex: 1, padding: '14px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                      background: settings.gridColumns === n ? `${settings.accentColor}12` : 'rgba(255,255,255,.02)',
                      border: settings.gridColumns === n ? `2px solid ${settings.accentColor}35` : '1.5px solid rgba(255,255,255,.05)',
                      color: settings.gridColumns === n ? '#fff' : 'rgba(255,255,255,.35)',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                    }}>
                      {/* Grid visualization */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 3, marginBottom: 8, padding: '0 8px' }}>
                        {Array.from({ length: n * 2 }).map((_, i) => (
                          <div key={i} style={{
                            aspectRatio: '4/3', borderRadius: 3,
                            background: settings.gridColumns === n ? `${settings.accentColor}30` : 'rgba(255,255,255,.06)',
                            transition: 'background .2s',
                          }} />
                        ))}
                      </div>
                      {n} עמודות
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* ══ Content section (galleries) ══ */}
          {activeSection === 'content' && (
            <div style={{ animation: 'pe-fadeIn .3s ease both' }}>
              <Panel title={`גלריות באתר (${visibleCount}/${galleries.length})`} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
                  {galleries.map(g => {
                    const hidden = settings.hiddenGalleryIds.includes(g.id)
                    const cov = covers.get(g.id)
                    const readS = (k: string) => { const v = (g.delivery_settings || {} as Record<string, unknown>)[k]; return typeof v === 'string' ? v : '' }
                    return (
                      <div key={g.id} className="pe-gallery-row" onClick={() => toggleGallery(g.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderRadius: 12, cursor: 'pointer',
                        background: hidden ? 'rgba(255,255,255,.01)' : 'rgba(255,255,255,.025)',
                        border: `1px solid ${hidden ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.06)'}`,
                        opacity: hidden ? 0.4 : 1,
                        transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                      }}>
                        {/* Custom checkbox */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${hidden ? 'rgba(255,255,255,.12)' : settings.accentColor}`,
                          background: hidden ? 'transparent' : settings.accentColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                          boxShadow: hidden ? 'none' : `0 0 8px ${settings.accentColor}20`,
                        }}>
                          {!hidden && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                        {cov && (
                          <div style={{
                            width: 40, height: 28, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                            border: '1px solid rgba(255,255,255,.06)',
                          }}>
                            <img src={cov} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{readS('eventType') || 'אחר'} · {g.image_count} תמונות</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>
          )}

          {/* ══ Contact section ══ */}
          {activeSection === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'pe-fadeIn .3s ease both' }}>
              <Panel title="פרטי קשר" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>} accent={settings.accentColor}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <InputField label="טלפון" value={settings.phone} placeholder="050-1234567"
                    onChange={v => update({ phone: v })} accent={settings.accentColor}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>} />
                  <InputField label="אימייל" value={settings.email} placeholder="info@company.com"
                    onChange={v => update({ email: v })} accent={settings.accentColor}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>} />
                  <InputField label="אינסטגרם" value={settings.instagram} placeholder="username (בלי @)"
                    onChange={v => update({ instagram: v })} accent={settings.accentColor}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>} />
                  <InputField label="אתר" value={settings.website} placeholder="www.company.com"
                    onChange={v => update({ website: v })} accent={settings.accentColor}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>} />
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Reusable sub-components ────────────────────────────────────────────────

function Panel({ title, children, icon, accent }: { title: string; children: React.ReactNode; icon?: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      padding: '18px 20px', background: 'rgba(255,255,255,.02)',
      border: '1px solid rgba(255,255,255,.05)', borderRadius: 16,
      transition: 'border-color .2s',
    }}>
      <div style={{
        fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.8)',
        marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {icon && (
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: accent ? `${accent}10` : 'rgba(255,255,255,.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accent || 'rgba(255,255,255,.4)',
          }}>
            {icon}
          </div>
        )}
        {title}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({ label, description, checked, accent, onToggle }: { label: string; description?: string; checked: boolean; accent: string; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 4px', cursor: 'pointer', borderRadius: 8,
        transition: 'background .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.7)' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{description}</div>}
      </div>
      {/* Toggle switch */}
      <div style={{
        width: 46, height: 26, borderRadius: 13, padding: 3,
        background: checked ? accent : 'rgba(255,255,255,.08)',
        border: checked ? 'none' : '1px solid rgba(255,255,255,.06)',
        transition: 'all .25s cubic-bezier(.4,0,.2,1)',
        display: 'flex', alignItems: 'center',
        justifyContent: checked ? 'flex-start' : 'flex-end',
        direction: 'ltr',
        boxShadow: checked ? `0 0 12px ${accent}25` : 'none',
        cursor: 'pointer',
        flexShrink: 0,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,.25)',
          transition: 'all .25s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>
    </div>
  )
}

function InputField({ label, value, placeholder, onChange, icon, accent }: { label: string; value: string; placeholder: string; onChange: (v: string) => void; icon: React.ReactNode; accent?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.7)',
        marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
      }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          color: accent || 'rgba(255,255,255,.25)',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center',
          opacity: .5,
        }}>{icon}</span>
        <input
          className="pe-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingRight: 38 }}
        />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 6,
  transition: 'all .15s cubic-bezier(.4,0,.2,1)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
  background: 'rgba(0,0,0,.3)', border: '1.5px solid rgba(255,255,255,.07)',
  borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', direction: 'rtl',
  transition: 'border-color .2s, box-shadow .2s',
}
