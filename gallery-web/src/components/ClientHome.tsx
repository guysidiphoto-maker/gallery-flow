// ClientHome — PR1 "Social OS" Dashboard (content-engine overview).
//
// Scope (PR1): UI scaffolding over data the dashboard already loads. It frames
// the client area around one promise — "never run out of Instagram content" —
// without introducing any backend, AI, or Instagram behavior. Numbers that
// depend on a real publish pipeline (pending approvals, scheduled posts) are
// shown as honest placeholders and clearly point into Social Studio; nothing
// here implies live Instagram publishing.

import type { CSSProperties } from 'react'

interface GalleryLike {
  id: string
  name?: string | null
  client_name?: string | null
  image_count?: number | null
  published_at?: string | null
}

export interface ClientHomeProps {
  galleries: GalleryLike[]
  covers: Map<string, string>
  /** Count of top-pick images across the client's galleries (the content bank). */
  topPicksCount: number
  storiesCount: number
  /** Default retainer cadence — drives the "content remaining" estimate. */
  cadencePerWeek: number
  onGoSocial: () => void
  onGoLibrary: () => void
  palette: { textPrimary: string; textMuted: string; border: string; statusLive: string }
}

export function ClientHome({
  galleries,
  covers,
  topPicksCount,
  storiesCount,
  cadencePerWeek,
  onGoSocial,
  onGoLibrary,
  palette,
}: ClientHomeProps) {
  const { textPrimary, textMuted, border, statusLive } = palette

  // Content bank → weeks of raw material at the retainer cadence. This is an
  // estimate from existing assets (top-picks), not a live schedule.
  const weeksOfMaterial = cadencePerWeek > 0 ? Math.floor(topPicksCount / cadencePerWeek) : 0
  const recentGalleries = galleries.slice(0, 3)

  // Scaffolding only — real coverage will be derived from image_ai_scores in a
  // later PR. Presented as "recommended to add", not as a live diagnosis.
  const suggestedCategories = ['Hero', 'מאחורי הקלעים', 'דיוקנים', 'אווירה']

  const cardStyle: CSSProperties = {
    border: `1px solid ${border}`, background: '#fff', padding: 20,
    display: 'flex', flexDirection: 'column', gap: 8,
  }
  const labelStyle: CSSProperties = {
    fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: textMuted,
  }
  const bigNum: CSSProperties = { fontSize: 34, fontWeight: 600, lineHeight: 1, color: textPrimary, letterSpacing: '-0.02em' }
  const ctaStyle: CSSProperties = {
    marginTop: 'auto', alignSelf: 'flex-start', padding: '8px 14px', cursor: 'pointer',
    border: `1px solid ${border}`, background: textPrimary, color: '#fff',
    fontFamily: 'inherit', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
  }
  const ghostCta: CSSProperties = { ...ctaStyle, background: 'transparent', color: textPrimary }

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Heading */}
      <div style={{ marginBottom: 24 }}>
        <div style={labelStyle}>סקירת מנוע התוכן</div>
        <h2 style={{ fontSize: 22, fontWeight: 500, margin: '6px 0 0', letterSpacing: '-0.015em', color: textPrimary }}>
          שלא ייגמר לך תוכן לאינסטגרם
        </h2>
      </div>

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>

        {/* Content remaining */}
        <div style={cardStyle}>
          <div style={labelStyle}>מלאי תוכן</div>
          <div style={bigNum}>{weeksOfMaterial}<span style={{ fontSize: 14, fontWeight: 500, color: textMuted }}> שבועות</span></div>
          <div style={{ fontSize: 12, color: textMuted }}>
            {topPicksCount} תמונות נבחרות בבנק · לפי {cadencePerWeek} פוסטים בשבוע (הערכה)
          </div>
        </div>

        {/* This week */}
        <div style={cardStyle}>
          <div style={labelStyle}>השבוע</div>
          <div style={bigNum}>{cadencePerWeek}<span style={{ fontSize: 14, fontWeight: 500, color: textMuted }}> פוסטים</span></div>
          <div style={{ fontSize: 12, color: textMuted }}>צרו, סקרו ואשרו ב-Social Studio</div>
          <button style={ctaStyle} onClick={onGoSocial}>פתח ב-Social Studio</button>
        </div>

        {/* Pending approvals (manual model) */}
        <div style={cardStyle}>
          <div style={labelStyle}>ממתינים לאישור</div>
          <div style={bigNum}>0</div>
          <div style={{ fontSize: 12, color: textMuted }}>אישור ידני (ברירת מחדל)</div>
          <button style={ghostCta} onClick={onGoSocial}>לאישור פוסטים</button>
        </div>

        {/* Missing categories */}
        <div style={cardStyle}>
          <div style={labelStyle}>קטגוריות מומלצות להוספה</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {suggestedCategories.map(c => (
              <span key={c} style={{ fontSize: 11, padding: '4px 10px', border: `1px solid ${border}`, color: textPrimary }}>{c}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>ניתוח כיסוי מלא יגיע בשלב הבא</div>
        </div>
      </div>

      {/* Recent galleries */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={labelStyle}>גלריות אחרונות בבנק התוכן</div>
          <button style={{ ...ghostCta, marginTop: 0 }} onClick={onGoLibrary}>לכל הספרייה</button>
        </div>
        {recentGalleries.length === 0 ? (
          <div style={{ fontSize: 12, color: textMuted }}>אין עדיין גלריות.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {recentGalleries.map(g => {
              const cover = covers.get(g.id)
              return (
                <button
                  key={g.id}
                  onClick={onGoLibrary}
                  style={{ textAlign: 'start', padding: 0, border: `1px solid ${border}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ aspectRatio: '3 / 2', background: '#f0efe9', overflow: 'hidden' }}>
                    {cover && <img src={cover} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {g.name || g.client_name || 'גלריה'}
                    </div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{g.image_count ?? 0} תמונות</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Honest scaffolding note */}
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: textMuted }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusLive, display: 'inline-block' }} />
        תצוגה ראשונית — הנתונים יתחברו למנוע הפרסום בשלבים הבאים. {storiesCount > 0 ? `(${storiesCount} סטוריז זמינים)` : ''}
      </div>
    </div>
  )
}
