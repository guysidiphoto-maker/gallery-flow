// GalleryDeepDive — modal that opens when the user clicks a gallery from
// Feed Studio Deep. Shows every top-pick photo for that gallery alongside
// the AI's per-image score breakdown (hero / carousel / story / atmosphere /
// people_density / brand_fit / social_potential) with the suggested usage
// chip and the suggested crop applied to the thumbnail.
//
// Visual language matches FeedStudio.tsx exactly: dark theme, RTL,
// Playfair Display headers, Heebo body, accent palette per usage type,
// fs-fadeIn / fs-tileIn animations, btnPrimary / btnGhost / btnPill styles.

import { useState, useMemo, type CSSProperties } from 'react'
import { storageUrl } from '../supabase'

// ── Contracts (from docs/FEED_STUDIO_DEEP_ARCHITECTURE.md §2.2) ─────────
export type SuggestedUsage = 'hero' | 'support' | 'carousel_anchor' | 'story_only' | 'background' | 'ignore'

export interface ImageScore {
  image_id: string
  hero_score: number
  carousel_score: number
  story_score: number
  atmosphere_score: number
  people_density: number
  brand_fit: number
  social_potential: number
  suggested_usage: SuggestedUsage
  suggested_crop_focal_x: number
  suggested_crop_focal_y: number
  rationale_he: string
  scored_at: string
}

interface TopPick {
  id: string
  gallery_id: string
  thumbnail_path: string | null
  storage_path: string
}

interface GalleryDeepDiveProps {
  galleryId: string
  galleryName: string
  topPicks: TopPick[]
  scores: Map<string, ImageScore>
  onClose: () => void
  onRescore: () => void
  rescoring?: boolean
}

// ── Hebrew labels & accent palette ──────────────────────────────────────
const USAGE_LABEL: Record<SuggestedUsage, string> = {
  hero: 'הירו', support: 'תומכת', carousel_anchor: 'פתיח קרוסלה',
  story_only: 'סטורי', background: 'רקע', ignore: 'דלג',
}

const USAGE_COLOR: Record<SuggestedUsage, string> = {
  hero: '#D4FF00', support: '#7B61FF', carousel_anchor: '#F5A524',
  story_only: '#3DDC84', background: 'rgba(255,255,255,.45)', ignore: '#ff6b6b',
}

const USAGE_EXPLAIN: Record<SuggestedUsage, string> = {
  hero: 'מתאימה לעמוד יחיד בפיד — חזקה מספיק כדי לעמוד לבד.',
  support: 'תומכת בקרוסלה או כתמונה משנית בין הירו לסיפור.',
  carousel_anchor: 'פתיח קרוסלה — התמונה הראשונה ש"תופסת" את הגוללת.',
  story_only: 'מתאימה לסטורי 9:16 בלבד — לא מספיק חזקה לפיד.',
  background: 'רקע / תמונת מילוי — שימוש זהיר, לא במרכז הבמה.',
  ignore: 'ה-AI ממליץ לדלג. ניתן לבחור ידנית בכל זאת.',
}

const SCORE_ROWS: Array<{ key: keyof ImageScore; label: string }> = [
  { key: 'hero_score', label: 'כפוסט יחיד (hero)' },
  { key: 'carousel_score', label: 'בקרוסלה' },
  { key: 'story_score', label: 'כסטורי' },
  { key: 'atmosphere_score', label: 'אווירה' },
  { key: 'people_density', label: 'צפיפות אנשים' },
  { key: 'brand_fit', label: 'התאמת מותג' },
  { key: 'social_potential', label: 'פוטנציאל סושיאל' },
]

// ── Component ───────────────────────────────────────────────────────────
export function GalleryDeepDive(props: GalleryDeepDiveProps) {
  const { galleryName, topPicks, scores, onClose, onRescore, rescoring } = props
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const scoredCount = useMemo(
    () => topPicks.filter(tp => scores.has(tp.id)).length,
    [topPicks, scores],
  )

  const isEmpty = topPicks.length === 0
  const noScoresYet = !isEmpty && scores.size === 0

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={shellStyle}>
        <style>{keyframes}</style>
        <header style={headerStyle}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={eyebrowStyle}>Gallery Deep Dive</div>
            <h2 style={titleStyle}>{galleryName}</h2>
            <div style={subtitleStyle}>{topPicks.length} תמונות · {scoredCount} עם ניקוד</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={onRescore}
              disabled={rescoring}
              style={{ ...btnPrimary, opacity: rescoring ? 0.65 : 1, cursor: rescoring ? 'wait' : 'pointer' }}
            >
              <span>↻</span>
              <span>{rescoring ? 'מנקד… זה לוקח כ-30 שניות לכל 8 תמונות' : 'חישוב מחדש'}</span>
            </button>
            <button onClick={onClose} style={btnGhost}>סגור</button>
          </div>
        </header>

        {isEmpty && (
          <div style={emptyBoxStyle}>
            <div style={{ fontSize: 16, color: 'rgba(255,255,255,.7)', marginBottom: 20 }}>
              אין top picks בגלריה הזו.
            </div>
            <button onClick={onClose} style={btnGhost}>סגור</button>
          </div>
        )}

        {noScoresYet && (
          <div style={bannerStyle}>אין עדיין ניקוד לתמונות. לחץ "↻ חישוב מחדש" כדי לנקד.</div>
        )}

        {!isEmpty && (
          <div style={gridStyle}>
            {topPicks.map((tp, idx) => {
              const isExpanded = expandedId === tp.id
              return (
                <Card
                  key={tp.id}
                  topPick={tp}
                  score={scores.get(tp.id)}
                  expanded={isExpanded}
                  index={idx}
                  onToggle={() => setExpandedId(isExpanded ? null : tp.id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────
function Card({ topPick, score, expanded, index, onToggle }: {
  topPick: TopPick; score: ImageScore | undefined; expanded: boolean; index: number; onToggle: () => void
}) {
  const focalX = score?.suggested_crop_focal_x ?? 0.5
  const focalY = score?.suggested_crop_focal_y ?? 0.5
  const accent = score ? USAGE_COLOR[score.suggested_usage] : 'rgba(255,255,255,.25)'
  const dim = !score

  return (
    <div
      className="gdd-card"
      onClick={onToggle}
      style={{
        ...cardStyle,
        opacity: dim ? 0.55 : 1,
        animationDelay: `${index * 35}ms`,
        ...(expanded ? { borderColor: accent } : null),
      }}
    >
      <div style={thumbWrapStyle}>
        <img
          src={storageUrl('gallery-images', topPick.thumbnail_path || topPick.storage_path)}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: `${focalX * 100}% ${focalY * 100}%`,
          }}
        />
        <div style={chipPositionStyle}>
          {score
            ? <UsageChip usage={score.suggested_usage} />
            : <span style={pendingPillStyle}>טרם נוקדה</span>}
        </div>
      </div>

      <div style={bodyStyle}>
        {score ? (
          <>
            <ScoreBar label="התאמת מותג" value={score.brand_fit} accent={accent} />
            <ScoreBar label="פוטנציאל סושיאל" value={score.social_potential} accent={accent} />
            <ScoreBar label="אווירה" value={score.atmosphere_score} accent={accent} />
            <p style={{
              ...rationaleStyle,
              ...(expanded ? { display: 'block', WebkitLineClamp: 'unset' as unknown as number } : null),
            }}>{score.rationale_he}</p>
            {expanded && <ExpandedDetail score={score} accent={accent} onCollapse={onToggle} />}
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.6 }}>
            תמונה זו עדיין לא נוקדה ע"י ה-AI. הריצו "↻ חישוב מחדש" כדי לקבל ניקוד.
          </div>
        )}
      </div>
    </div>
  )
}

function UsageChip({ usage }: { usage: SuggestedUsage }) {
  const color = USAGE_COLOR[usage]
  const label = USAGE_LABEL[usage]
  const isIgnore = usage === 'ignore'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)',
        borderRadius: 4, padding: '4px 9px',
        fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
        color, border: `1px solid ${color}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
      <span style={isIgnore ? { textDecoration: 'line-through' } : undefined}>{label}</span>
    </span>
  )
}

function ScoreBar({ label, value, accent }: { label: string; value: number; accent: string }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100))
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={scoreBarLabelStyle}>
        <span>{label}</span>
        <span style={{ color: accent }}>{value.toFixed(1)}</span>
      </div>
      <div style={scoreBarTrackStyle}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width .3s ease' }} />
      </div>
    </div>
  )
}

function ExpandedDetail({ score, accent, onCollapse }: {
  score: ImageScore; accent: string; onCollapse: () => void
}) {
  return (
    <div onClick={e => e.stopPropagation()} style={expandedStyle}>
      <div style={labelStyle}>כל 7 הקריטריונים</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {SCORE_ROWS.map(row => {
          const v = score[row.key] as number
          return (
            <div key={row.key} style={scoreRowStyle}>
              <span>{row.label}</span>
              <span style={{ color: accent, fontWeight: 700 }}>
                {v.toFixed(1)}<span style={{ opacity: 0.45 }}>/10</span>
              </span>
            </div>
          )
        })}
      </div>

      <div style={labelStyle}>שימוש מומלץ</div>
      <div style={{ ...usageBoxBase, border: `1px solid ${accent}33` }}>
        <strong style={{ color: accent }}>{USAGE_LABEL[score.suggested_usage]}</strong>
        {' — '}{USAGE_EXPLAIN[score.suggested_usage]}
      </div>

      <div style={labelStyle}>הסבר מלא</div>
      <p style={fullRationaleStyle}>{score.rationale_he}</p>

      <button onClick={onCollapse} style={{ ...collapseLinkStyle, color: accent }}>
        סגור פרטים
      </button>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────
const keyframes = `
  @keyframes fs-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fs-tileIn { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
  .gdd-card { animation: fs-tileIn .55s cubic-bezier(.16,1,.3,1) both; transition: transform .25s, border-color .2s, box-shadow .25s; }
  .gdd-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(0,0,0,.5); cursor: pointer; }
`

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)',
  backdropFilter: 'blur(8px)', zIndex: 100,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: 24, overflowY: 'auto',
  animation: 'fs-fadeIn .25s both',
}

const shellStyle: CSSProperties = {
  background: '#0a0a0f',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 14,
  padding: '32px 32px 48px',
  direction: 'rtl',
  color: 'rgba(255,255,255,.92)',
  width: '100%', maxWidth: 960,
  fontFamily: 'Heebo, Inter, sans-serif',
}

const headerStyle: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  gap: 18, flexWrap: 'wrap',
  marginBottom: 28, paddingBottom: 20,
  borderBottom: '1px solid rgba(255,255,255,.08)',
}

const eyebrowStyle: CSSProperties = {
  fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,.5)', marginBottom: 8, fontWeight: 600,
}

const titleStyle: CSSProperties = {
  fontFamily: 'Playfair Display, Georgia, serif',
  fontSize: 36, fontWeight: 800, margin: 0,
  letterSpacing: '-0.02em', lineHeight: 1.1,
}

const subtitleStyle: CSSProperties = {
  marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,.6)', fontWeight: 500,
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 16,
}

const cardStyle: CSSProperties = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 10, overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
}

const thumbWrapStyle: CSSProperties = {
  position: 'relative', aspectRatio: '1/1', background: '#000',
}

const chipPositionStyle: CSSProperties = {
  position: 'absolute', top: 8, right: 8, zIndex: 2,
}

const pendingPillStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)',
  border: '1px dashed rgba(255,255,255,.35)', borderRadius: 4,
  padding: '4px 9px', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,.7)', letterSpacing: '.04em',
}

const bodyStyle: CSSProperties = {
  padding: '14px 14px 16px',
  display: 'flex', flexDirection: 'column',
}

const rationaleStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 12, fontStyle: 'italic',
  color: 'rgba(255,255,255,.7)', lineHeight: 1.55,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const labelStyle: CSSProperties = {
  fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,.5)', marginBottom: 8, fontWeight: 600,
}

const bannerStyle: CSSProperties = {
  marginBottom: 20, padding: '14px 16px',
  background: 'rgba(212,255,0,.06)',
  border: '1px solid rgba(212,255,0,.25)',
  borderRadius: 8,
  fontSize: 13, color: 'rgba(255,255,255,.85)', lineHeight: 1.5,
}

const emptyBoxStyle: CSSProperties = {
  textAlign: 'center', padding: '64px 24px',
  fontFamily: 'Heebo, Inter, sans-serif',
}

const btnPrimary: CSSProperties = {
  padding: '12px 18px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
  fontFamily: 'inherit', background: '#D4FF00', color: '#000',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}

const btnGhost: CSSProperties = {
  padding: '12px 18px', fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'transparent', color: '#fafafa',
  border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}

const scoreBarLabelStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  fontSize: 10, color: 'rgba(255,255,255,.6)',
  marginBottom: 4, fontWeight: 600, letterSpacing: '.02em',
}

const scoreBarTrackStyle: CSSProperties = {
  height: 4, background: 'rgba(255,255,255,.08)',
  borderRadius: 2, overflow: 'hidden',
}

const expandedStyle: CSSProperties = {
  marginTop: 14, paddingTop: 14,
  borderTop: '1px solid rgba(255,255,255,.08)',
  animation: 'fs-fadeIn .25s both',
}

const scoreRowStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  fontSize: 12, color: 'rgba(255,255,255,.85)',
  padding: '4px 0', borderBottom: '1px dashed rgba(255,255,255,.06)',
}

const usageBoxBase: CSSProperties = {
  fontSize: 13, color: 'rgba(255,255,255,.85)', lineHeight: 1.6,
  marginBottom: 14, padding: '10px 12px',
  background: 'rgba(255,255,255,.04)', borderRadius: 6,
}

const fullRationaleStyle: CSSProperties = {
  fontSize: 13, fontStyle: 'italic',
  color: 'rgba(255,255,255,.78)', lineHeight: 1.7,
  margin: '0 0 16px',
}

const collapseLinkStyle: CSSProperties = {
  background: 'transparent', border: 'none',
  fontSize: 12, fontWeight: 700, letterSpacing: '.04em',
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
}
