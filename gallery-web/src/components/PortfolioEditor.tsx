import { useState, useEffect, useRef } from 'react'

// Load Hebrew Google Fonts
const HEBREW_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&family=Rubik:wght@300;400;500;600;700;800&family=Assistant:wght@300;400;500;600;700;800&display=swap'
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${HEBREW_FONTS_URL}"]`)) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = HEBREW_FONTS_URL
  document.head.appendChild(link)
}

// ─── Portfolio settings ─────────────────────────────────────────────────────

export interface PortfolioSettings {
  // Branding
  logoBase64: string
  pageTitle: string
  tagline: string
  // Contact
  phone: string
  email: string
  instagram: string
  website: string
  // Appearance
  accentColor: string
  bgStyle: 'dark' | 'midnight' | 'gradient' | 'deep-blue'
  fontStyle: 'modern' | 'elegant' | 'bold' | 'heebo' | 'rubik' | 'assistant'
  heroStyle: 'blur' | 'gradient-only' | 'cover'
  heroCoverGalleryId: string  // which gallery cover to use as hero bg
  // Layout
  gridColumns: 2 | 3
  showPhotoCounts: boolean
  showStudioBadge: boolean
  // Visibility
  hiddenGalleryIds: string[]
}

export const DEFAULT_SETTINGS: PortfolioSettings = {
  logoBase64: '',
  pageTitle: '',
  tagline: '',
  phone: '',
  email: '',
  instagram: '',
  website: '',
  accentColor: '#6366f1',
  bgStyle: 'dark',
  fontStyle: 'modern',
  heroStyle: 'blur',
  heroCoverGalleryId: '',
  gridColumns: 2,
  showPhotoCounts: true,
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

const HERO_STYLES: { key: PortfolioSettings['heroStyle']; label: string }[] = [
  { key: 'blur', label: 'תמונה מטושטשת' },
  { key: 'cover', label: 'תמונת כיסוי' },
  { key: 'gradient-only', label: 'גרדיאנט בלבד' },
]

export function getFontFamily(fontStyle: PortfolioSettings['fontStyle']): string {
  return FONT_STYLES.find(f => f.key === fontStyle)?.family || 'inherit'
}

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

  const SECTIONS: { key: typeof activeSection; label: string; icon: string }[] = [
    { key: 'brand', label: 'מיתוג', icon: '✦' },
    { key: 'design', label: 'עיצוב', icon: '◆' },
    { key: 'content', label: 'תוכן', icon: '▦' },
    { key: 'contact', label: 'קשר', icon: '◈' },
  ]

  return (
    <div style={{ direction: 'rtl', maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.02em' }}>עורך האתר</h2>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', margin: 0 }}>עצב את דף הפורטפוליו שלך</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: copied ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.04)',
            border: `1px solid ${copied ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.08)'}`,
            color: copied ? '#34d399' : 'rgba(255,255,255,.6)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{copied ? '✓ הועתק' : 'העתק קישור'}</button>
          <a href={publicUrl} target="_blank" rel="noopener" style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.6)', textDecoration: 'none', display: 'flex', alignItems: 'center',
          }}>פתח ↗</a>
          <button onClick={save} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: saved ? 'rgba(16,185,129,.15)' : settings.accentColor,
            border: saved ? '1px solid rgba(16,185,129,.25)' : 'none',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
          }}>{saved ? '✓ נשמר' : 'שמור'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Left: Live preview ── */}
        <div style={{
          width: previewMode === 'desktop' ? 480 : 320, flexShrink: 0, position: 'sticky', top: 20,
          transition: 'width .4s cubic-bezier(.4,0,.2,1)',
        }}>
          {/* Preview mode toggle */}
          <div style={{
            display: 'flex', gap: 4, marginBottom: 10, padding: 3,
            background: 'rgba(0,0,0,.3)', borderRadius: 9, border: '1px solid rgba(255,255,255,.05)',
            width: 'fit-content',
          }}>
            <button onClick={() => setPreviewMode('mobile')} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: previewMode === 'mobile' ? `${settings.accentColor}25` : 'transparent',
              color: previewMode === 'mobile' ? '#fff' : 'rgba(255,255,255,.4)', transition: 'all .15s',
            }}>📱 מובייל</button>
            <button onClick={() => setPreviewMode('desktop')} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: previewMode === 'desktop' ? `${settings.accentColor}25` : 'transparent',
              color: previewMode === 'desktop' ? '#fff' : 'rgba(255,255,255,.4)', transition: 'all .15s',
            }}>🖥 דסקטופ</button>
          </div>

          <div style={{
            borderRadius: previewMode === 'mobile' ? 24 : 14,
            overflow: 'hidden',
            border: previewMode === 'mobile' ? '6px solid rgba(255,255,255,.08)' : '1px solid rgba(255,255,255,.06)',
            boxShadow: '0 12px 40px rgba(0,0,0,.4)',
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
                {settings.phone && <span>📞 {settings.phone}</span>}
                {settings.email && <span>✉ {settings.email}</span>}
                {settings.instagram && <span>📸 @{settings.instagram}</span>}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ── Right: Editor panels ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section tabs */}
          <div style={{
            display: 'flex', gap: 4, marginBottom: 16, padding: 3,
            background: 'rgba(0,0,0,.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,.05)',
          }}>
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
                flex: 1, padding: '9px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                background: activeSection === s.key ? `${settings.accentColor}20` : 'transparent',
                color: activeSection === s.key ? '#fff' : 'rgba(255,255,255,.4)',
                border: activeSection === s.key ? `1px solid ${settings.accentColor}35` : '1px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span> {s.label}
              </button>
            ))}
          </div>

          {/* ══ Brand section ══ */}
          {activeSection === 'brand' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Logo */}
              <Panel title="לוגו">
                {settings.logoBase64 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <img src={settings.logoBase64} alt="" style={{ maxHeight: 60, maxWidth: 160, borderRadius: 8, background: 'rgba(255,255,255,.04)', padding: 8 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button onClick={() => fileRef.current?.click()} style={btnStyle}>החלף</button>
                      <button onClick={() => update({ logoBase64: '' })} style={{ ...btnStyle, color: '#f87171', borderColor: 'rgba(248,113,113,.2)' }}>הסר</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} style={{
                    width: '100%', padding: '24px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,.02)', border: '2px dashed rgba(255,255,255,.1)',
                    color: 'rgba(255,255,255,.4)', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                    </svg>
                    העלה לוגו
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: 'none' }} />
              </Panel>

              {/* Page title */}
              <Panel title="כותרת ראשית">
                <input value={settings.pageTitle} onChange={e => update({ pageTitle: e.target.value })}
                  placeholder={clientName}
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', marginTop: 6 }}>ברירת מחדל: שם הלקוח</div>
              </Panel>

              {/* Tagline */}
              <Panel title="טאגליין">
                <input value={settings.tagline} onChange={e => update({ tagline: e.target.value })}
                  placeholder="הפקות אירועים מהשורה הראשונה"
                  style={inputStyle} />
              </Panel>

              {/* Studio badge */}
              <Panel title="הגדרות">
                <ToggleRow label="הצג באדג' סטודיו" checked={settings.showStudioBadge}
                  accent={settings.accentColor} onToggle={() => update({ showStudioBadge: !settings.showStudioBadge })} />
                <ToggleRow label="הצג מספר תמונות" checked={settings.showPhotoCounts}
                  accent={settings.accentColor} onToggle={() => update({ showPhotoCounts: !settings.showPhotoCounts })} />
              </Panel>
            </div>
          )}

          {/* ══ Design section ══ */}
          {activeSection === 'design' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Accent color */}
              <Panel title="צבע מבטא">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ACCENT_COLORS.map(c => (
                    <button key={c} onClick={() => update({ accentColor: c })} style={{
                      width: 34, height: 34, borderRadius: 10, cursor: 'pointer', background: c,
                      border: settings.accentColor === c ? '3px solid #fff' : '1px solid rgba(255,255,255,.15)',
                      boxShadow: settings.accentColor === c ? `0 0 16px ${c}55` : 'none',
                      transition: 'all .15s',
                    }} />
                  ))}
                </div>
              </Panel>

              {/* Background */}
              <Panel title="סגנון רקע">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {BG_STYLES.map(bg => (
                    <button key={bg.key} onClick={() => update({ bgStyle: bg.key })} style={{
                      padding: '18px 8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      background: bg.bg,
                      border: settings.bgStyle === bg.key ? `2px solid ${settings.accentColor}` : '1px solid rgba(255,255,255,.08)',
                      color: settings.bgStyle === bg.key ? '#fff' : 'rgba(255,255,255,.45)',
                      fontSize: 11, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
                    }}>{bg.label}</button>
                  ))}
                </div>
              </Panel>

              {/* Font */}
              <Panel title="סגנון גופן">
                <div style={{ display: 'flex', gap: 8 }}>
                  {FONT_STYLES.map(f => (
                    <button key={f.key} onClick={() => update({ fontStyle: f.key })} style={{
                      flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      background: settings.fontStyle === f.key ? `${settings.accentColor}15` : 'rgba(255,255,255,.02)',
                      border: settings.fontStyle === f.key ? `2px solid ${settings.accentColor}40` : '1px solid rgba(255,255,255,.06)',
                      fontFamily: f.family, fontSize: 11, fontWeight: 600, color: settings.fontStyle === f.key ? '#fff' : 'rgba(255,255,255,.4)',
                      transition: 'all .15s',
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 4, fontFamily: f.family }}>{f.sample}</div>
                      {f.label}
                    </button>
                  ))}
                </div>
              </Panel>

              {/* Hero style */}
              <Panel title="סגנון Hero">
                <div style={{ display: 'flex', gap: 8 }}>
                  {HERO_STYLES.map(h => (
                    <button key={h.key} onClick={() => update({ heroStyle: h.key })} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                      background: settings.heroStyle === h.key ? `${settings.accentColor}15` : 'rgba(255,255,255,.02)',
                      border: settings.heroStyle === h.key ? `2px solid ${settings.accentColor}40` : '1px solid rgba(255,255,255,.06)',
                      color: settings.heroStyle === h.key ? '#fff' : 'rgba(255,255,255,.4)',
                      fontSize: 11, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
                    }}>{h.label}</button>
                  ))}
                </div>
                {/* Hero cover picker */}
                {settings.heroStyle !== 'gradient-only' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.3)', marginBottom: 6 }}>תמונת רקע</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {galleries.map(g => {
                        const cov = covers.get(g.id)
                        if (!cov) return null
                        return (
                          <button key={g.id} onClick={() => update({ heroCoverGalleryId: g.id })} style={{
                            width: 56, height: 40, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', padding: 0,
                            border: settings.heroCoverGalleryId === g.id ? `2px solid ${settings.accentColor}` : '1px solid rgba(255,255,255,.1)',
                            background: 'rgba(255,255,255,.03)', transition: 'all .12s',
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
              <Panel title="עמודות בגריד">
                <div style={{ display: 'flex', gap: 8 }}>
                  {([2, 3] as const).map(n => (
                    <button key={n} onClick={() => update({ gridColumns: n })} style={{
                      flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      background: settings.gridColumns === n ? `${settings.accentColor}15` : 'rgba(255,255,255,.02)',
                      border: settings.gridColumns === n ? `2px solid ${settings.accentColor}40` : '1px solid rgba(255,255,255,.06)',
                      color: settings.gridColumns === n ? '#fff' : 'rgba(255,255,255,.4)',
                      fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
                    }}>{n} עמודות</button>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* ══ Content section (galleries) ══ */}
          {activeSection === 'content' && (
            <Panel title={`גלריות באתר (${visibleCount}/${galleries.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                {galleries.map(g => {
                  const hidden = settings.hiddenGalleryIds.includes(g.id)
                  const cov = covers.get(g.id)
                  const readS = (k: string) => { const v = (g.delivery_settings || {} as Record<string, unknown>)[k]; return typeof v === 'string' ? v : '' }
                  return (
                    <div key={g.id} onClick={() => toggleGallery(g.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 10, cursor: 'pointer',
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
                      {cov && (
                        <div style={{ width: 36, height: 26, borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
                          <img src={cov} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', marginTop: 1 }}>{readS('eventType') || 'אחר'} · {g.image_count} תמונות</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          {/* ══ Contact section ══ */}
          {activeSection === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Panel title="פרטי קשר">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <InputField label="טלפון" value={settings.phone} placeholder="050-1234567"
                    onChange={v => update({ phone: v })} icon="📞" />
                  <InputField label="אימייל" value={settings.email} placeholder="info@company.com"
                    onChange={v => update({ email: v })} icon="✉" />
                  <InputField label="אינסטגרם" value={settings.instagram} placeholder="username (בלי @)"
                    onChange={v => update({ instagram: v })} icon="📸" />
                  <InputField label="אתר" value={settings.website} placeholder="www.company.com"
                    onChange={v => update({ website: v })} icon="🌐" />
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px 18px', background: 'rgba(255,255,255,.02)',
      border: '1px solid rgba(255,255,255,.06)', borderRadius: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function ToggleRow({ label, checked, accent, onToggle }: { label: string; checked: boolean; accent: string; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{label}</span>
      <button onClick={onToggle} style={{
        width: 42, height: 24, borderRadius: 12, cursor: 'pointer', padding: 2,
        background: checked ? accent : 'rgba(255,255,255,.1)',
        border: 'none', transition: 'background .2s', display: 'flex', alignItems: 'center',
        justifyContent: checked ? 'flex-start' : 'flex-end', direction: 'ltr',
      }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.3)', transition: 'all .2s' }} />
      </button>
    </div>
  )
}

function InputField({ label, value, placeholder, onChange, icon }: { label: string; value: string; placeholder: string; onChange: (v: string) => void; icon: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.35)', marginBottom: 5 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>{icon}</span>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
          ...inputStyle, paddingRight: 36,
        }} />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 7, fontSize: 11.5, fontWeight: 500,
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: 'inherit',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', boxSizing: 'border-box',
  background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', direction: 'rtl',
}
