// /brand-kit — central studio identity editor.
//
// Five-section editorial layout (Logo, Colors, Typography, Voice, Watermark)
// that writes to the businesses.brand_kit JSONB column (migration 072). Each
// section is its own card with a hairline border, auto-saves on blur, and
// shows a live preview where it makes sense (logo upload, color swatches,
// font-pair sample, watermark overlay on a placeholder photo).
//
// Editorial-minimal aesthetic: cream canvas, near-black ink, hairline borders,
// no purple, no gradients, no drop shadows beyond the 1px frame. RTL primary.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, storageUrl } from '../supabase'
import {
  BRAND_KIT_BUCKET,
  FONT_PAIRS,
  type BrandKit,
  type BrandKitLogoSlot,
  type BrandKitWatermarkPosition,
  type BrandKitWatermarkSource,
  defaultBrandKit,
  getBrandKit,
  logoStoragePath,
  saveBrandKit,
} from '../lib/brandKit'

// ── Tokens (kept in sync with Dashboard.tsx) ────────────────────────────────
const bg = '#F2EFE9'
const bgSubtle = '#FAF9F5'
const card = '#FBFBF9'
const cardSolid = '#FFFFFF'
const border = '#D0D0D0'
const textPrimary = '#141413'
const textSecondary = '#333333'
const textMuted = '#767470'

const styleId = 'brandkit-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes brandkit-toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .brandkit input:focus-visible,
    .brandkit textarea:focus-visible,
    .brandkit button:focus-visible,
    .brandkit select:focus-visible {
      outline: 2px solid #141413;
      outline-offset: 2px;
      border-radius: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `
  document.head.appendChild(style)
}

const WATERMARK_POSITIONS: BrandKitWatermarkPosition[] = [
  'tl', 'tc', 'tr',
  'cl', 'cc', 'cr',
  'bl', 'bc', 'br',
]

const WATERMARK_LABELS: Record<BrandKitWatermarkPosition, string> = {
  tl: 'שמאל למעלה',  tc: 'מרכז למעלה',  tr: 'ימין למעלה',
  cl: 'שמאל מרכז',   cc: 'מרכז',         cr: 'ימין מרכז',
  bl: 'שמאל למטה',   bc: 'מרכז למטה',    br: 'ימין למטה',
}

// Sample image used in the watermark preview. Public placeholder so we don't
// depend on the photographer already having uploaded gallery content.
const SAMPLE_PHOTO_URL =
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=900&q=70&auto=format&fit=crop'

export function BrandKit() {
  const { user, loading: authLoading } = useAuth()
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [brand, setBrand] = useState<BrandKit>(defaultBrandKit())
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  // ── Auth + business bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      window.location.replace('/dashboard')
      return
    }
    void (async () => {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, brand_kit')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!biz) {
        // No business row yet — bounce to Dashboard where it gets created.
        window.location.replace('/dashboard')
        return
      }
      setBusinessId(biz.id)
      const fresh = await getBrandKit(biz.id)
      if (fresh) setBrand(fresh)
      setLoading(false)
    })()
  }, [user, authLoading])

  function flashToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  // ── Auto-save on blur ─────────────────────────────────────────────────────
  // Each section calls saveSection(next) on blur; we update local state
  // immediately for responsive UI and then persist the merged document.
  async function saveSection(next: BrandKit, sectionLabel: string) {
    if (!businessId) return
    setBrand(next)
    const res = await saveBrandKit(businessId, next)
    if (res.ok) flashToast(`${sectionLabel} נשמר`)
    else flashToast(`שגיאה: ${res.error}`)
  }

  // Explicit Save (the header button) — same path as auto-save but with a
  // confirmation toast.
  async function saveAll() {
    if (!businessId) return
    const res = await saveBrandKit(businessId, brand)
    if (res.ok) flashToast('Brand Kit נשמר')
    else flashToast(`שגיאה: ${res.error}`)
  }

  // ── Logo upload ───────────────────────────────────────────────────────────
  async function uploadLogo(slot: BrandKitLogoSlot, file: File) {
    if (!businessId) return
    // Derive extension; default to png. Storage accepts most image types.
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
    const path = logoStoragePath(businessId, slot, ext)
    const { error } = await supabase.storage
      .from(BRAND_KIT_BUCKET)
      .upload(path, file, {
        contentType: file.type || 'image/png',
        upsert: true,
        // Short cache because the photographer may iterate. The URL stays
        // stable so we attach a ?t= cache-bust below.
        cacheControl: '300',
      })
    if (error) {
      flashToast(`שגיאה בהעלאה: ${error.message}`)
      return
    }
    const publicUrl = `${storageUrl(BRAND_KIT_BUCKET, path)}?t=${Date.now()}`
    const next: BrandKit = {
      ...brand,
      logo: { ...brand.logo, [slot]: publicUrl },
    }
    await saveSection(next, 'לוגו')
  }

  async function clearLogo(slot: BrandKitLogoSlot) {
    if (!businessId) return
    const next: BrandKit = {
      ...brand,
      logo: { ...brand.logo, [slot]: null },
    }
    await saveSection(next, 'לוגו')
  }

  if (authLoading || loading) {
    return (
      <div dir="rtl" style={{
        minHeight: '100vh', background: bg, color: textPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Heebo, Inter, sans-serif',
      }}>
        <div style={{ fontSize: 13, color: textMuted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Loading
        </div>
      </div>
    )
  }

  return (
    <div
      dir="rtl"
      className="brandkit"
      style={{
        minHeight: '100vh', background: bg, color: textPrimary,
        fontFamily: 'Heebo, Inter, sans-serif',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: `1px solid ${border}`,
        background: bg, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          padding: '20px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <a
              href="/dashboard"
              style={{
                fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: textMuted,
                textDecoration: 'none',
              }}
            >
              ← Dashboard
            </a>
            <span style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em',
              color: textPrimary,
            }}>
              Brand Kit
            </span>
          </div>
          <button
            onClick={saveAll}
            style={{
              padding: '10px 22px', borderRadius: 2,
              background: textPrimary, color: '#fff',
              border: `1px solid ${textPrimary}`,
              fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            שמירה
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <main style={{
        maxWidth: 900, margin: '0 auto',
        padding: '36px 28px 96px',
        display: 'flex', flexDirection: 'column', gap: 28,
      }}>
        <Intro />

        <LogoSection
          brand={brand}
          onChange={next => setBrand(next)}
          onUpload={uploadLogo}
          onClear={clearLogo}
        />

        <ColorsSection
          brand={brand}
          onChange={next => setBrand(next)}
          onBlur={() => saveSection(brand, 'צבעים')}
          onToggleApply={(applyToGalleries) => {
            const next = { ...brand, apply_to_galleries: applyToGalleries }
            void saveSection(next, 'צבעים')
          }}
        />

        <TypographySection
          brand={brand}
          onSelect={(heading, body) => {
            const next: BrandKit = {
              ...brand,
              typography: { heading_family: heading, body_family: body },
            }
            void saveSection(next, 'טיפוגרפיה')
          }}
        />

        <VoiceSection
          brand={brand}
          onChange={next => setBrand(next)}
          onBlur={() => saveSection(brand, 'טון ומסר')}
        />

        <WatermarkSection
          brand={brand}
          onChange={next => setBrand(next)}
          onBlur={() => saveSection(brand, 'סימן מים')}
        />

        <SocialSection
          brand={brand}
          onChange={next => setBrand(next)}
          onBlur={() => saveSection(brand, 'רשתות חברתיות')}
        />
      </main>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 24, insetInlineStart: 24,
            padding: '12px 18px', borderRadius: 2,
            background: textPrimary, color: '#fff',
            fontSize: 12, fontWeight: 500, letterSpacing: '0.06em',
            border: `1px solid ${textPrimary}`,
            animation: 'brandkit-toast-in .18s ease-out',
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Intro ───────────────────────────────────────────────────────────────────

function Intro() {
  return (
    <div style={{
      borderBottom: `1px solid ${border}`,
      paddingBottom: 18,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 8,
      }}>
        Studio Identity
      </div>
      <p style={{
        margin: 0, fontSize: 14, lineHeight: 1.7, color: textSecondary,
        maxWidth: 620,
      }}>
        כל מה שמגדיר את הסטודיו שלך במקום אחד — לוגו, צבעים, פונטים, נימה
        וסימן מים. ההגדרות כאן יחולו אוטומטית על כל גלריה חדשה, מייל שיתוף
        וסטורי שתפיקו.
      </p>
    </div>
  )
}

// ─── Reusable Card / Section wrappers ────────────────────────────────────────

function Card(props: { eyebrow: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: card,
      border: `1px solid ${border}`,
      borderRadius: 2,
      padding: '28px 28px 32px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 8,
      }}>
        {props.eyebrow}
      </div>
      <h2 style={{
        margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em',
        color: textPrimary, fontFamily: 'Playfair Display, Georgia, serif',
      }}>
        {props.title}
      </h2>
      {props.description && (
        <p style={{ margin: '8px 0 24px', fontSize: 13, lineHeight: 1.7, color: textMuted }}>
          {props.description}
        </p>
      )}
      {!props.description && <div style={{ height: 24 }} />}
      {props.children}
    </section>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
      color: textMuted, textTransform: 'uppercase', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 2,
  background: cardSolid,
  border: `1px solid ${border}`,
  color: textPrimary, fontSize: 13, fontFamily: 'inherit',
  outline: 'none',
}

// ─── 1. Logo ─────────────────────────────────────────────────────────────────

function LogoSection(props: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onUpload: (slot: BrandKitLogoSlot, file: File) => Promise<void>
  onClear: (slot: BrandKitLogoSlot) => Promise<void>
}) {
  const slots: Array<{ slot: BrandKitLogoSlot; label: string; hint: string; bg: string }> = [
    { slot: 'url',        label: 'לוגו ראשי',           hint: 'PNG/SVG על רקע בהיר', bg: cardSolid },
    { slot: 'dark_url',   label: 'גרסה לרקע כהה',       hint: 'אופציונלי',           bg: '#1A1A18' },
    { slot: 'square_url', label: 'אייקון ריבועי',       hint: 'פבייקון / אווטאר',    bg: cardSolid },
  ]
  return (
    <Card
      eyebrow="01 — Logo"
      title="לוגו"
      description="עד שלוש גרסאות. המערכת תבחר את הנכונה לפי הקונטקסט (גלריה, מייל, פוסט)."
    >
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
      }}>
        {slots.map(s => (
          <LogoSlotEditor
            key={s.slot}
            label={s.label}
            hint={s.hint}
            previewBg={s.bg}
            url={props.brand.logo?.[s.slot] ?? null}
            onUpload={file => props.onUpload(s.slot, file)}
            onClear={() => props.onClear(s.slot)}
          />
        ))}
      </div>
    </Card>
  )
}

function LogoSlotEditor(props: {
  label: string
  hint: string
  previewBg: string
  url: string | null | undefined
  onUpload: (file: File) => Promise<void>
  onClear: () => Promise<void>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const isDark = props.previewBg !== cardSolid
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <div style={{
        width: '100%', aspectRatio: '1 / 1',
        background: props.previewBg,
        border: `1px solid ${border}`,
        borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {props.url ? (
          <img
            src={props.url}
            alt={props.label}
            style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,.5)' : textMuted, letterSpacing: '0.1em' }}>
            אין לוגו
          </span>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: textMuted, lineHeight: 1.5 }}>{props.hint}</div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0]
            if (!f) return
            setUploading(true)
            try { await props.onUpload(f) } finally {
              setUploading(false)
              if (ref.current) ref.current.value = ''
            }
          }}
        />
        <button
          onClick={() => ref.current?.click()}
          disabled={uploading}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 2,
            background: 'transparent', color: textPrimary,
            border: `1px solid ${border}`,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase', cursor: uploading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {uploading ? '…' : props.url ? 'החלפה' : 'העלאה'}
        </button>
        {props.url && (
          <button
            onClick={() => void props.onClear()}
            style={{
              padding: '8px 10px', borderRadius: 2,
              background: 'transparent', color: textMuted,
              border: `1px solid ${border}`,
              fontSize: 11, fontWeight: 500, letterSpacing: '0.14em',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 2. Colors ───────────────────────────────────────────────────────────────

function ColorsSection(props: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
  onToggleApply: (next: boolean) => void
}) {
  const fields: Array<{ key: keyof NonNullable<BrandKit['colors']>; label: string; desc: string }> = [
    { key: 'primary',   label: 'ראשי',     desc: 'לוגו, כפתורים, אקסנט מרכזי' },
    { key: 'secondary', label: 'משני',     desc: 'מסגרות, רקעים משניים' },
    { key: 'accent',    label: 'הדגשה',    desc: 'קישורים, סטטוסים' },
    { key: 'ink',       label: 'טקסט',     desc: 'כותרות ופסקאות' },
    { key: 'paper',     label: 'רקע',      desc: 'קנבס הגלריה' },
  ]
  const colors = props.brand.colors ?? {}
  const apply = Boolean(props.brand.apply_to_galleries)
  return (
    <Card
      eyebrow="02 — Colors"
      title="צבעים"
      description="חמשת הצבעים שמגדירים את הוויזואל של הסטודיו. מומלץ ניגוד גבוה בין טקסט לרקע."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
        {fields.map(f => (
          <div key={f.key}>
            <FieldLabel>{f.label}</FieldLabel>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 8, border: `1px solid ${border}`, borderRadius: 2,
              background: cardSolid,
            }}>
              <input
                type="color"
                aria-label={`${f.label} color`}
                value={colors[f.key] ?? '#000000'}
                onChange={e => props.onChange({
                  ...props.brand,
                  colors: { ...colors, [f.key]: e.target.value },
                })}
                onBlur={props.onBlur}
                style={{
                  width: 36, height: 36, padding: 0, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={colors[f.key] ?? ''}
                onChange={e => props.onChange({
                  ...props.brand,
                  colors: { ...colors, [f.key]: e.target.value },
                })}
                onBlur={props.onBlur}
                style={{
                  flex: 1, minWidth: 0, padding: '6px 8px',
                  border: 'none', background: 'transparent',
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  fontSize: 12, color: textPrimary, outline: 'none',
                  textAlign: 'left' as const, direction: 'ltr',
                }}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: textMuted, lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Swatch strip — live preview */}
      <div style={{
        marginTop: 22, display: 'flex',
        border: `1px solid ${border}`, borderRadius: 2, overflow: 'hidden',
      }}>
        {fields.map(f => (
          <div key={f.key} style={{
            flex: 1, height: 56,
            background: colors[f.key] ?? '#fff',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
            padding: 8,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase',
              padding: '2px 6px', background: 'rgba(255,255,255,.8)',
              color: '#000',
            }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {/* Apply-to-galleries toggle */}
      <label style={{
        marginTop: 24, display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={apply}
          onChange={e => props.onToggleApply(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: textPrimary }}
        />
        <span style={{ fontSize: 13, color: textPrimary }}>
          השתמש כברירת מחדל בגלריות חדשות
        </span>
        <span style={{ fontSize: 11, color: textMuted }}>
          (לא משכתב גלריות קיימות)
        </span>
      </label>
    </Card>
  )
}

// ─── 3. Typography ───────────────────────────────────────────────────────────

function TypographySection(props: {
  brand: BrandKit
  onSelect: (headingFamily: string, bodyFamily: string) => void
}) {
  const current = props.brand.typography
  return (
    <Card
      eyebrow="03 — Typography"
      title="טיפוגרפיה"
      description="חמישה זיווגי פונטים אוצרים. בחירה אחת מחילה את שני הפונטים יחד."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FONT_PAIRS.map(pair => {
          const active =
            current?.heading_family === pair.heading_family &&
            current?.body_family === pair.body_family
          return (
            <button
              key={pair.id}
              onClick={() => props.onSelect(pair.heading_family, pair.body_family)}
              style={{
                textAlign: 'right' as const,
                background: active ? cardSolid : 'transparent',
                border: `1px solid ${active ? textPrimary : border}`,
                borderRadius: 2,
                padding: '20px 22px',
                cursor: 'pointer', fontFamily: 'inherit',
                color: textPrimary,
                display: 'flex', alignItems: 'center', gap: 24,
                transition: 'border-color .15s, background .15s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: pair.heading_family,
                  fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em',
                  marginBottom: 6, color: textPrimary,
                }}>
                  {pair.sample_heading}
                </div>
                <div style={{
                  fontFamily: pair.body_family,
                  fontSize: 13, color: textSecondary, lineHeight: 1.6,
                }}>
                  {pair.sample_body}
                </div>
              </div>
              <div style={{
                flexShrink: 0, fontSize: 10, fontWeight: 500,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: active ? textPrimary : textMuted,
                minWidth: 160, textAlign: 'left' as const, direction: 'ltr',
              }}>
                {pair.label}
                {active && <div style={{ marginTop: 4, fontSize: 9, color: textPrimary }}>● ACTIVE</div>}
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ─── 4. Voice ────────────────────────────────────────────────────────────────

const TAGLINE_MAX = 80
const SIGNATURE_MAX = 280

function VoiceSection(props: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
}) {
  const voice = props.brand.voice ?? {}
  return (
    <Card
      eyebrow="04 — Voice"
      title="טון ומסר"
      description="המילים שמלוות את הסטודיו במייל הזמנה, בעמוד פתיחה ובכל סטורי."
    >
      <div style={{ display: 'grid', gap: 20 }}>
        <div>
          <FieldLabel>טאגליין • {voice.tagline?.length ?? 0}/{TAGLINE_MAX}</FieldLabel>
          <input
            type="text"
            value={voice.tagline ?? ''}
            maxLength={TAGLINE_MAX}
            placeholder="לדוגמה: רגעים שזוכרים לכל החיים"
            onChange={e => props.onChange({
              ...props.brand,
              voice: { ...voice, tagline: e.target.value },
            })}
            onBlur={props.onBlur}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>חתימה • {voice.signature?.length ?? 0}/{SIGNATURE_MAX}</FieldLabel>
          <textarea
            value={voice.signature ?? ''}
            maxLength={SIGNATURE_MAX}
            rows={4}
            placeholder="חתימה ארוכה לסוף מייל — שם הסטודיו, מיקום, יצירת קשר"
            onChange={e => props.onChange({
              ...props.brand,
              voice: { ...voice, signature: e.target.value },
            })}
            onBlur={props.onBlur}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
        <div>
          <FieldLabel>שפה</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['he', 'en', 'auto'] as const).map(lang => {
              const active = (voice.language ?? 'he') === lang
              const label = lang === 'he' ? 'עברית' : lang === 'en' ? 'English' : 'אוטומטי'
              return (
                <button
                  key={lang}
                  onClick={() => {
                    const next = { ...props.brand, voice: { ...voice, language: lang } }
                    props.onChange(next)
                    props.onBlur()
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 2,
                    background: active ? textPrimary : 'transparent',
                    color: active ? '#fff' : textPrimary,
                    border: `1px solid ${active ? textPrimary : border}`,
                    fontSize: 12, fontWeight: 600, letterSpacing: '0.1em',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── 5. Watermark ────────────────────────────────────────────────────────────

function WatermarkSection(props: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
}) {
  const wm = props.brand.watermark ?? {}
  const enabled = Boolean(wm.enabled)
  const source: BrandKitWatermarkSource = wm.source ?? 'logo'
  const position: BrandKitWatermarkPosition = wm.position ?? 'br'
  const opacity = wm.opacity_percent ?? 18
  const scale = wm.scale_percent ?? 12

  const previewText = useMemo(() => {
    if (source === 'custom_text') return wm.text || 'STUDIO'
    if (source === 'studio_name') return (props.brand.voice?.signature?.split('\n')[0] || 'STUDIO').trim()
    return ''
  }, [source, wm.text, props.brand.voice?.signature])

  function updateWatermark(patch: Partial<NonNullable<BrandKit['watermark']>>) {
    const next: BrandKit = {
      ...props.brand,
      watermark: { ...wm, ...patch },
    }
    props.onChange(next)
  }

  return (
    <Card
      eyebrow="05 — Watermark"
      title="סימן מים"
      description="חתימה דיסקרטית על תמונות הגלריה. ניתן להשתמש בלוגו, בשם הסטודיו או בטקסט חופשי."
    >
      {/* Enable toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            updateWatermark({ enabled: e.target.checked })
            props.onBlur()
          }}
          style={{ width: 16, height: 16, accentColor: textPrimary }}
        />
        <span style={{ fontSize: 13, color: textPrimary, fontWeight: 500 }}>הפעל סימן מים</span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? 'auto' : 'none' }}>
        {/* Left column — controls */}
        <div style={{ display: 'grid', gap: 20 }}>
          <div>
            <FieldLabel>מקור</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { id: 'logo' as const,         label: 'לוגו ראשי' },
                { id: 'studio_name' as const,  label: 'שם הסטודיו (מהחתימה)' },
                { id: 'custom_text' as const,  label: 'טקסט חופשי' },
              ]).map(opt => (
                <label key={opt.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 2,
                  border: `1px solid ${source === opt.id ? textPrimary : border}`,
                  background: source === opt.id ? cardSolid : 'transparent',
                  cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="watermark-source"
                    checked={source === opt.id}
                    onChange={() => {
                      updateWatermark({ source: opt.id })
                      props.onBlur()
                    }}
                    style={{ accentColor: textPrimary }}
                  />
                  <span style={{ fontSize: 13, color: textPrimary }}>{opt.label}</span>
                </label>
              ))}
            </div>
            {source === 'custom_text' && (
              <input
                type="text"
                value={wm.text ?? ''}
                placeholder="STUDIO NAME"
                maxLength={40}
                onChange={e => updateWatermark({ text: e.target.value })}
                onBlur={props.onBlur}
                style={{ ...inputStyle, marginTop: 10 }}
              />
            )}
          </div>

          <div>
            <FieldLabel>מיקום</FieldLabel>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 44px)',
              gap: 6,
            }}>
              {WATERMARK_POSITIONS.map(p => {
                const active = position === p
                return (
                  <button
                    key={p}
                    aria-label={WATERMARK_LABELS[p]}
                    title={WATERMARK_LABELS[p]}
                    onClick={() => {
                      updateWatermark({ position: p })
                      props.onBlur()
                    }}
                    style={{
                      width: 44, height: 44, borderRadius: 2,
                      background: active ? textPrimary : cardSolid,
                      border: `1px solid ${active ? textPrimary : border}`,
                      cursor: 'pointer', position: 'relative', padding: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      width: 8, height: 8, borderRadius: 1,
                      background: active ? '#fff' : textPrimary,
                      ...positionDot(p),
                    }} />
                  </button>
                )
              })}
            </div>
          </div>

          <Slider
            label={`שקיפות • ${opacity}%`}
            min={5} max={50} value={opacity}
            onChange={v => updateWatermark({ opacity_percent: v })}
            onBlur={props.onBlur}
          />

          <Slider
            label={`גודל • ${scale}%`}
            min={5} max={30} value={scale}
            onChange={v => updateWatermark({ scale_percent: v })}
            onBlur={props.onBlur}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(wm.contrast_aware)}
              onChange={e => {
                updateWatermark({ contrast_aware: e.target.checked })
                props.onBlur()
              }}
              style={{ width: 16, height: 16, accentColor: textPrimary }}
            />
            <span style={{ fontSize: 13, color: textPrimary }}>הסתגלות לניגודיות (אוטומטית הופך לבן/שחור)</span>
          </label>
        </div>

        {/* Right column — preview */}
        <div>
          <FieldLabel>תצוגה מקדימה</FieldLabel>
          <div style={{
            width: '100%', aspectRatio: '4 / 3',
            background: `url(${SAMPLE_PHOTO_URL}) center/cover`,
            border: `1px solid ${border}`,
            borderRadius: 2, position: 'relative', overflow: 'hidden',
          }}>
            {enabled && (
              <div style={{
                position: 'absolute',
                ...overlayPosition(position),
                opacity: opacity / 100,
                color: '#fff',
                fontFamily: 'inherit',
                fontWeight: 600, letterSpacing: '0.1em',
                textShadow: wm.contrast_aware ? '0 1px 2px rgba(0,0,0,.5)' : 'none',
                fontSize: `${Math.max(10, scale * 1.2)}px`,
                pointerEvents: 'none',
              }}>
                {source === 'logo' && props.brand.logo?.url ? (
                  <img
                    src={props.brand.logo.url}
                    alt=""
                    style={{
                      width: `${scale * 6}px`, height: 'auto',
                      filter: 'brightness(0) invert(1)',
                      opacity: 1, // outer wrapper already applies opacity
                    }}
                  />
                ) : (
                  <span>{previewText || 'STUDIO'}</span>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: textMuted, lineHeight: 1.5 }}>
            התצוגה מדגימה את התוצאה הסופית על תמונת גלריה אמיתית.
          </div>
        </div>
      </div>
    </Card>
  )
}

function Slider(props: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  onBlur: () => void
}) {
  return (
    <div>
      <FieldLabel>{props.label}</FieldLabel>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={e => props.onChange(Number(e.target.value))}
        onBlur={props.onBlur}
        onMouseUp={props.onBlur}
        onTouchEnd={props.onBlur}
        style={{ width: '100%', accentColor: textPrimary }}
      />
    </div>
  )
}

// Map a position code to absolute CSS offsets inside the preview.
function overlayPosition(p: BrandKitWatermarkPosition): React.CSSProperties {
  const pad = 14
  const v: React.CSSProperties = {}
  if (p.startsWith('t')) v.top = pad
  if (p.startsWith('c')) { v.top = '50%'; v.transform = 'translateY(-50%)' }
  if (p.startsWith('b')) v.bottom = pad
  if (p.endsWith('l')) v.left = pad
  if (p.endsWith('c') && p !== 'cc') {
    v.left = '50%'
    v.transform = v.transform ? `${v.transform} translateX(-50%)` : 'translateX(-50%)'
  }
  if (p === 'cc') {
    v.left = '50%'
    v.transform = 'translate(-50%, -50%)'
  }
  if (p.endsWith('r')) v.right = pad
  return v
}

// Map a position code to a tiny dot inside the picker square.
function positionDot(p: BrandKitWatermarkPosition): React.CSSProperties {
  const r: React.CSSProperties = {}
  if (p.startsWith('t')) r.top = 4
  if (p.startsWith('c')) r.top = '50%'
  if (p.startsWith('b')) r.bottom = 4
  if (p.endsWith('l')) r.left = 4
  if (p.endsWith('c') && p !== 'cc') r.left = '50%'
  if (p === 'cc') { r.left = '50%'; r.top = '50%' }
  if (p.endsWith('r')) r.right = 4
  // Center axis with a translate when we used 50%.
  const tx = (p.endsWith('c') && p !== 'cc') || p === 'cc' ? '-50%' : '0'
  const ty = (p.startsWith('c')) || p === 'cc' ? '-50%' : '0'
  if (tx !== '0' || ty !== '0') r.transform = `translate(${tx}, ${ty})`
  return r
}

// ─── 6. Social ───────────────────────────────────────────────────────────────

function SocialSection(props: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
}) {
  const social = props.brand.social ?? {}
  const fields: Array<{ key: keyof NonNullable<BrandKit['social']>; label: string; placeholder: string }> = [
    { key: 'instagram', label: 'Instagram', placeholder: '@studio' },
    { key: 'facebook',  label: 'Facebook',  placeholder: 'facebook.com/studio' },
    { key: 'tiktok',    label: 'TikTok',    placeholder: '@studio' },
    { key: 'twitter',   label: 'X / Twitter', placeholder: '@studio' },
    { key: 'website',   label: 'אתר',       placeholder: 'studio.com' },
  ]
  return (
    <Card
      eyebrow="06 — Social"
      title="רשתות חברתיות"
      description="המסבירים מהיכן הסטודיו זמין. מופיעים בכרטיסי שיתוף ובמיילים."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {fields.map(f => (
          <div key={f.key}>
            <FieldLabel>{f.label}</FieldLabel>
            <input
              type="text"
              value={social[f.key] ?? ''}
              placeholder={f.placeholder}
              onChange={e => props.onChange({
                ...props.brand,
                social: { ...social, [f.key]: e.target.value },
              })}
              onBlur={props.onBlur}
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'left' as const }}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
