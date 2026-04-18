import React, { useState, useRef } from 'react'

export interface BusinessSettings {
  studioName: string
  studioWebsite: string
  logoUrl: string | null
  showFooterCredit: boolean
  downloadsEnabled: boolean
  bulkDownloadEnabled: boolean
  downloadQuality: 'web' | 'high' | 'original'
  layoutMode: '1-col' | '2-col' | '3-col'
  imageSpacing: 'none' | 'small' | 'medium'
  cornerStyle: 'sharp' | 'rounded'
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  studioName: '',
  studioWebsite: '',
  logoUrl: null,
  showFooterCredit: true,
  downloadsEnabled: true,
  bulkDownloadEnabled: true,
  downloadQuality: 'high',
  layoutMode: '2-col',
  imageSpacing: 'small',
  cornerStyle: 'rounded',
}

interface BusinessSettingsModalProps {
  settings: BusinessSettings
  onSave: (settings: BusinessSettings) => void
  onClose: () => void
}

export function BusinessSettingsModal({ settings: initial, onSave, onClose }: BusinessSettingsModalProps) {
  const [s, setS] = useState<BusinessSettings>({ ...initial })
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logoUrl)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (patch: Partial<BusinessSettings>) => {
    setS(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const handleLogo = async () => {
    try {
      const result = await (window as any).api.chooseLogoFile()
      if (result) {
        const url = result.dataUrl || result.path || result
        update({ logoUrl: url })
        setLogoPreview(url)
      }
    } catch (err) {
      console.error('Failed to choose logo:', err)
    }
  }

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      update({ logoUrl: url })
      setLogoPreview(url)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    onSave(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 520, maxHeight: '85vh', overflow: 'auto',
        background: 'rgba(22,22,30,.98)', border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 16, padding: 28,
        boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0, direction: 'rtl' }}>הגדרות עסק</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', margin: '4px 0 0', direction: 'rtl' }}>ברנדינג וברירות מחדל לגלריות</p>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.4)',
            cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* ── Branding ── */}
        <Section title="ברנדינג">
          {/* Studio name */}
          <Label text="שם העסק">
            <input value={s.studioName} onChange={e => update({ studioName: e.target.value })}
              placeholder="Eclipse media" style={inputStyle} />
          </Label>

          {/* Website */}
          <Label text="אתר">
            <input value={s.studioWebsite} onChange={e => update({ studioWebsite: e.target.value })}
              placeholder="https://your-site.com" style={inputStyle} />
          </Label>

          {/* Logo */}
          <Label text="לוגו">
            {logoPreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={logoPreview} alt="" style={{ maxHeight: 50, maxWidth: 140, borderRadius: 6, background: 'rgba(255,255,255,.04)', padding: 6 }} />
                <button onClick={handleLogo} style={btnStyle}>החלף</button>
                <button onClick={() => { update({ logoUrl: null }); setLogoPreview(null) }}
                  style={{ ...btnStyle, color: '#f87171', borderColor: 'rgba(248,113,113,.2)' }}>הסר</button>
              </div>
            ) : (
              <button onClick={handleLogo} style={{
                width: '100%', padding: '18px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,.02)', border: '2px dashed rgba(255,255,255,.1)',
                color: 'rgba(255,255,255,.4)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
                העלה לוגו
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoFile} style={{ display: 'none' }} />
          </Label>

          {/* Footer credit */}
          <Toggle label="הצג קרדיט Pixflow" checked={s.showFooterCredit}
            onToggle={() => update({ showFooterCredit: !s.showFooterCredit })} />
        </Section>

        {/* ── Downloads ── */}
        <Section title="הורדות">
          <Toggle label="אפשר הורדות" checked={s.downloadsEnabled}
            onToggle={() => update({ downloadsEnabled: !s.downloadsEnabled })} />
          <Toggle label="הורדה מרוכזת" checked={s.bulkDownloadEnabled}
            onToggle={() => update({ bulkDownloadEnabled: !s.bulkDownloadEnabled })} />
          <Label text="איכות הורדה">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['web', 'high', 'original'] as const).map(q => (
                <button key={q} onClick={() => update({ downloadQuality: q })} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: s.downloadQuality === q ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                  border: s.downloadQuality === q ? '1px solid rgba(99,102,241,.3)' : '1px solid rgba(255,255,255,.06)',
                  color: s.downloadQuality === q ? '#818cf8' : 'rgba(255,255,255,.4)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {q === 'web' ? 'Web' : q === 'high' ? 'High' : 'Original'}
                </button>
              ))}
            </div>
          </Label>
        </Section>

        {/* ── Gallery style ── */}
        <Section title="סגנון גלריה">
          <Label text="עמודות">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['1-col', '2-col', '3-col'] as const).map(m => (
                <button key={m} onClick={() => update({ layoutMode: m })} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: s.layoutMode === m ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                  border: s.layoutMode === m ? '1px solid rgba(99,102,241,.3)' : '1px solid rgba(255,255,255,.06)',
                  color: s.layoutMode === m ? '#818cf8' : 'rgba(255,255,255,.4)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {m.replace('-col', '')}
                </button>
              ))}
            </div>
          </Label>
          <Label text="ריווח">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['none', 'small', 'medium'] as const).map(sp => (
                <button key={sp} onClick={() => update({ imageSpacing: sp })} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: s.imageSpacing === sp ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                  border: s.imageSpacing === sp ? '1px solid rgba(99,102,241,.3)' : '1px solid rgba(255,255,255,.06)',
                  color: s.imageSpacing === sp ? '#818cf8' : 'rgba(255,255,255,.4)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {sp === 'none' ? 'ללא' : sp === 'small' ? 'קטן' : 'בינוני'}
                </button>
              ))}
            </div>
          </Label>
          <Label text="פינות">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['sharp', 'rounded'] as const).map(cs => (
                <button key={cs} onClick={() => update({ cornerStyle: cs })} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: s.cornerStyle === cs ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                  border: s.cornerStyle === cs ? '1px solid rgba(99,102,241,.3)' : '1px solid rgba(255,255,255,.06)',
                  color: s.cornerStyle === cs ? '#818cf8' : 'rgba(255,255,255,.4)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {cs === 'sharp' ? 'חד' : 'מעוגל'}
                </button>
              ))}
            </div>
          </Label>
        </Section>

        {/* Save */}
        <button onClick={handleSave} style={{
          width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: saved ? 'rgba(16,185,129,.15)' : '#6366f1',
          border: saved ? '1px solid rgba(16,185,129,.25)' : 'none',
          color: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginTop: 8,
        }}>
          {saved ? '✓ נשמר' : 'שמור'}
        </button>
      </div>
    </div>
  )
}

// ── Small helper components ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.3)',
        letterSpacing: '.06em', textTransform: 'uppercase',
        marginBottom: 12, direction: 'rtl',
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.55)', marginBottom: 6, direction: 'rtl' }}>{text}</div>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl' }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,.7)' }}>{label}</span>
      <button onClick={onToggle} style={{
        width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 2,
        background: checked ? '#6366f1' : 'rgba(255,255,255,.1)', transition: 'background .15s',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: '#fff',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform .15s',
        }} />
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(255,255,255,.9)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  direction: 'rtl',
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 500,
  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
  color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontFamily: 'inherit',
}
