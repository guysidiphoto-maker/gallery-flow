// CreativeEngineDialog — the 5-step "I uploaded a gallery, give me a
// designed campaign" flow. Sits on top of any gallery card in the client
// dashboard.
//
//   Step 1  Quick Brief        — 5 quick choices (formats / vibe /
//                                 typography / continuity / depth)
//   Step 2  Score + Generate   — runs /api/score-images then
//                                 /api/generate-campaign (single Sonnet call)
//   Step 3  Directions reveal  — 4 directions with preview compositions
//   Step 4  Direction detail   — full post grid for the chosen direction
//   Step 5  Export             — per-post PNG export (phase 2; stub today)

import { useEffect, useState, type CSSProperties } from 'react'
import {
  CreativeRenderer,
  type DesignSpec,
  type DirectionTokens,
  type LayoutId,
  type TopPick,
} from './CreativeRenderer'

interface ResolvedDirection {
  id: string
  label: string
  label_he: string
  tagline: string
  tokens: DirectionTokens
  posts: Array<{
    id: string
    layout: LayoutId
    image_id?: string
    image_ids?: string[]
    crop?: { focalX: number; focalY: number }
    headline: string
    sub?: string
    caption?: string
    align?: 'top' | 'center' | 'bottom'
  }>
}

interface Props {
  clientId: string
  galleryId: string
  galleryName: string
  topPicksCount: number
  imageById: Map<string, TopPick>
  onClose: () => void
}

type Stage = 'brief' | 'generating' | 'directions' | 'detail' | 'error'

interface Brief {
  formats: string[]
  vibe: string
  typography: string
  continuity: string
  depth: string
}

const DEFAULT_BRIEF: Brief = {
  formats: ['single', 'carousel'],
  vibe: 'editorial',
  typography: 'balanced',
  continuity: 'fresh',
  depth: 'fast',
}

const BRIEF_STEPS: Array<{
  key: keyof Brief
  question: string
  options: Array<{ value: string; label: string; sub?: string }>
  multi?: boolean
}> = [
  {
    key: 'formats',
    question: 'מה אנחנו מייצרים?',
    multi: true,
    options: [
      { value: 'single',   label: 'פוסטים בודדים' },
      { value: 'carousel', label: 'קרוסלות' },
      { value: 'poster',   label: 'פוסטרים טיפוגרפיים' },
    ],
  },
  {
    key: 'vibe',
    question: 'איזה תחושה?',
    options: [
      { value: 'luxury',     label: 'יוקרתי', sub: 'שחור · זהב · איטלקית' },
      { value: 'energetic',  label: 'אנרגטי', sub: 'נאון · אלכסונים · עוצמה' },
      { value: 'editorial',  label: 'עיתונאי', sub: 'מינימליזם שווייצרי' },
      { value: 'campaign',   label: 'קמפיין מודגש', sub: 'גושי טיפוגרפיה' },
      { value: 'cinematic',  label: 'קולנועי', sub: 'גוון שעת זהב' },
    ],
  },
  {
    key: 'typography',
    question: 'אופי טיפוגרפיה?',
    options: [
      { value: 'minimal',  label: 'מינימליסטי', sub: 'מעט טקסט, הרבה תמונה' },
      { value: 'balanced', label: 'מאוזן' },
      { value: 'dominant', label: 'דומיננטי', sub: 'טיפוגרפיה ענקית' },
    ],
  },
  {
    key: 'continuity',
    question: 'המשכיות?',
    options: [
      { value: 'fresh',    label: 'קמפיין חדש לגמרי' },
      { value: 'continue', label: 'להמשיך את הסגנון הקיים' },
      { value: 'unsure',   label: 'תן ל-AI להציע 4 כיוונים' },
    ],
  },
  {
    key: 'depth',
    question: 'עומק?',
    options: [
      { value: 'fast',     label: 'חבילה מהירה', sub: '3-4 פוסטים לכיוון' },
      { value: 'campaign', label: 'קמפיין מלא',  sub: '6-8 פוסטים לכיוון' },
    ],
  },
]

export function CreativeEngineDialog(props: Props) {
  const { clientId, galleryId, galleryName, topPicksCount, imageById, onClose } = props

  const [stage, setStage] = useState<Stage>('brief')
  const [stepIdx, setStepIdx] = useState(0)
  const [brief, setBrief] = useState<Brief>(DEFAULT_BRIEF)
  const [generatingLabel, setGeneratingLabel] = useState('סורק את התמונות...')
  const [directions, setDirections] = useState<ResolvedDirection[]>([])
  const [chosenDirIdx, setChosenDirIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = BRIEF_STEPS.length
  const step = BRIEF_STEPS[stepIdx]

  function selectOption(value: string) {
    if (step.multi) {
      const cur = (brief[step.key] as string[]) || []
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      setBrief({ ...brief, [step.key]: next })
    } else {
      setBrief({ ...brief, [step.key]: value })
    }
  }

  function isSelected(value: string): boolean {
    if (step.multi) return ((brief[step.key] as string[]) || []).includes(value)
    return brief[step.key] === value
  }

  function canAdvance(): boolean {
    if (step.multi) return ((brief[step.key] as string[]) || []).length >= 1
    return Boolean(brief[step.key])
  }

  async function startGeneration() {
    setStage('generating')
    setError(null)
    try {
      // Step 1: ensure scoring (cheap if cached).
      setGeneratingLabel('מנקד את התמונות של האירוע...')
      await fetch('/api/score-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })

      // Step 2: campaign generation.
      setGeneratingLabel('בונה 4 כיוונים יצירתיים...')
      const postsPerDirection = brief.depth === 'campaign' ? 7 : 4
      const res = await fetch('/api/generate-campaign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, galleryId, brief, postsPerDirection }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setStage('error')
        setError(humanError(json?.error ?? `http_${res.status}`, json))
        return
      }
      setDirections(json.directions ?? [])
      setStage('directions')
    } catch (e) {
      setStage('error')
      setError('שגיאה בלתי צפויה. נסו שוב.')
      console.error('campaign generation error:', e)
    }
  }

  function pickDirection(idx: number) {
    setChosenDirIdx(idx)
    setStage('detail')
  }

  function backToDirections() {
    setChosenDirIdx(null)
    setStage('directions')
  }

  return (
    <div onClick={onClose} style={overlayStyle}>
      <style>{`
        @keyframes ce-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ce-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        .ce-opt:hover { background: rgba(255,255,255,.07) !important; }
        .ce-direction:hover { transform: translateY(-3px); }
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;800&family=Inter+Tight:wght@400;800&family=Cormorant+Garamond:ital,wght@0,400;0,800;1,400&family=Inter:wght@400;700&display=swap');
      `}</style>

      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.32em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 6, fontWeight: 700 }}>
              🎨 Creative Engine
            </div>
            <h2 style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 26, fontWeight: 800, margin: 0,
              letterSpacing: '-0.02em', color: '#fff',
            }}>{galleryName}</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 6 }}>
              {topPicksCount} top picks · AI יציע 4 כיוונים יצירתיים, כל אחד עם פוסטים מעוצבים
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Stage: brief */}
        {stage === 'brief' && (
          <BriefStep
            step={step} stepIdx={stepIdx} totalSteps={totalSteps}
            isSelected={isSelected} onSelect={selectOption}
            onBack={() => stepIdx > 0 ? setStepIdx(stepIdx - 1) : onClose()}
            onNext={() => stepIdx < totalSteps - 1 ? setStepIdx(stepIdx + 1) : startGeneration()}
            canAdvance={canAdvance()}
          />
        )}

        {/* Stage: generating */}
        {stage === 'generating' && (
          <div style={{ padding: '60px 0', textAlign: 'center', animation: 'ce-fadeIn .3s both' }}>
            <div style={{
              width: 8, height: 8, borderRadius: 4, background: '#D4FF00',
              animation: 'ce-pulse 1.4s ease-in-out infinite', display: 'inline-block', marginBottom: 22,
            }} />
            <div style={{
              fontFamily: 'Playfair Display, Georgia, serif', fontSize: 24, fontWeight: 800,
              color: '#fff', marginBottom: 10,
            }}>{generatingLabel}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
              ~30-60 שניות
            </div>
          </div>
        )}

        {/* Stage: error */}
        {stage === 'error' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#ff6b6b', marginBottom: 18 }}>{error}</div>
            <button onClick={() => { setError(null); setStage('brief') }} style={btnGhost}>נסה שוב</button>
          </div>
        )}

        {/* Stage: directions reveal */}
        {stage === 'directions' && (
          <DirectionsReveal
            directions={directions}
            imageById={imageById}
            onPick={pickDirection}
          />
        )}

        {/* Stage: direction detail */}
        {stage === 'detail' && chosenDirIdx !== null && directions[chosenDirIdx] && (
          <DirectionDetail
            direction={directions[chosenDirIdx]}
            imageById={imageById}
            onBack={backToDirections}
          />
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
function BriefStep({
  step, stepIdx, totalSteps, isSelected, onSelect, onBack, onNext, canAdvance,
}: {
  step: typeof BRIEF_STEPS[number]
  stepIdx: number
  totalSteps: number
  isSelected: (value: string) => boolean
  onSelect: (value: string) => void
  onBack: () => void
  onNext: () => void
  canAdvance: boolean
}) {
  return (
    <div style={{ animation: 'ce-fadeIn .3s both' }}>
      {/* Progress */}
      <div style={{
        height: 2, background: 'rgba(255,255,255,.08)', borderRadius: 1,
        overflow: 'hidden', marginBottom: 24,
      }}>
        <div style={{
          height: '100%', width: `${((stepIdx + 1) / totalSteps) * 100}%`,
          background: '#D4FF00', transition: 'width .3s',
        }} />
      </div>

      <h3 style={{
        fontFamily: 'Playfair Display, Georgia, serif',
        fontSize: 28, fontWeight: 800, margin: '0 0 22px',
        letterSpacing: '-0.02em', color: '#fff',
      }}>{step.question}</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {step.options.map(opt => {
          const sel = isSelected(opt.value)
          return (
            <button
              key={opt.value}
              className="ce-opt"
              onClick={() => onSelect(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', textAlign: 'right',
                background: sel ? 'rgba(212,255,0,.08)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${sel ? '#D4FF00' : 'rgba(255,255,255,.08)'}`,
                borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', color: '#fff',
                transition: 'all .2s',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: step.multi ? 4 : 10,
                border: `2px solid ${sel ? '#D4FF00' : 'rgba(255,255,255,.25)'}`,
                background: sel ? '#D4FF00' : 'transparent',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#000', fontWeight: 800,
              }}>
                {sel && (step.multi ? '✓' : '●')}
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: opt.sub ? 4 : 0 }}>
                  {opt.label}
                </div>
                {opt.sub && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.5 }}>
                    {opt.sub}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={onBack} style={btnGhost}>
          {stepIdx === 0 ? 'ביטול' : '← חזור'}
        </button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
            {stepIdx + 1} / {totalSteps}
          </span>
          <button
            onClick={onNext}
            disabled={!canAdvance}
            style={{ ...btnPrimary, opacity: canAdvance ? 1 : 0.4, cursor: canAdvance ? 'pointer' : 'not-allowed' }}
          >
            {stepIdx === totalSteps - 1 ? '✨ צור 4 כיוונים' : 'המשך →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
function DirectionsReveal({
  directions, imageById, onPick,
}: {
  directions: ResolvedDirection[]
  imageById: Map<string, TopPick>
  onPick: (idx: number) => void
}) {
  return (
    <div style={{ animation: 'ce-fadeIn .3s both' }}>
      <div style={{ marginBottom: 22 }}>
        <h3 style={{
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: 26, fontWeight: 800, margin: '0 0 8px',
          letterSpacing: '-0.02em', color: '#fff',
        }}>בחר כיוון יצירתי</h3>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.6 }}>
          כל כיוון = עולם עיצובי שלם. אותן תמונות, ארבע שפות. בחר אחד לראות את הפוסטים.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {directions.map((d, idx) => (
          <div
            key={d.id}
            className="ce-direction"
            style={{
              padding: 18, borderRadius: 14,
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.08)',
              transition: 'transform .2s',
              animation: 'ce-fadeIn .4s both',
              animationDelay: `${idx * 80}ms`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', fontWeight: 700, marginBottom: 6 }}>
                  כיוון {String.fromCharCode(0x41 + idx)} · {d.label}
                </div>
                <h4 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>
                  {d.label_he}
                </h4>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4, fontStyle: 'italic' }}>
                  {d.tagline}
                </div>
              </div>
              <button onClick={() => onPick(idx)} style={btnPrimary}>
                <span>✓</span><span>ראה פוסטים</span>
              </button>
            </div>

            {/* Preview row — first 3 posts of this direction at small size */}
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {d.posts.slice(0, 3).map(p => (
                <div key={p.id} style={{ flex: '0 0 auto' }}>
                  <CreativeRenderer
                    spec={p as DesignSpec}
                    tokens={d.tokens}
                    imageById={imageById}
                    displaySize={p.layout === 'split-tile-3' ? 240 : 200}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
function DirectionDetail({
  direction, imageById, onBack,
}: {
  direction: ResolvedDirection
  imageById: Map<string, TopPick>
  onBack: () => void
}) {
  return (
    <div style={{ animation: 'ce-fadeIn .3s both' }}>
      <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', fontWeight: 700, marginBottom: 6 }}>
            כיוון נבחר · {direction.posts.length} פוסטים
          </div>
          <h3 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: 30, fontWeight: 800, margin: '0 0 6px',
            letterSpacing: '-0.02em', color: '#fff',
          }}>
            {direction.label_he}
            <span style={{ marginInlineStart: 14, fontSize: 16, color: 'rgba(255,255,255,.55)', fontWeight: 400, fontStyle: 'italic' }}>
              · {direction.tagline}
            </span>
          </h3>
        </div>
        <button onClick={onBack} style={btnGhost}>← לכל הכיוונים</button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 18,
      }}>
        {direction.posts.map((p, i) => (
          <div key={p.id} style={{
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 12, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ alignSelf: 'center' }}>
              <CreativeRenderer
                spec={p as DesignSpec}
                tokens={direction.tokens}
                imageById={imageById}
                displaySize={p.layout === 'split-tile-3' ? 360 : 320}
                captureId={`creative-${direction.id}-${i}`}
              />
            </div>
            <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', fontWeight: 700 }}>
              {layoutLabel(p.layout)}
            </div>
            {p.caption && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', lineHeight: 1.55 }}>
                {p.caption}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <button style={btnPillSmall} disabled>📥 ייצוא PNG (בקרוב)</button>
              <button style={btnPillSmall} disabled>📅 תזמן ל-IG (בקרוב)</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function layoutLabel(layout: LayoutId): string {
  switch (layout) {
    case 'headline-overlay':  return 'Headline overlay'
    case 'color-block-frame': return 'Color-block frame'
    case 'split-tile-3':      return 'Split tile · 3 slides'
    case 'typography-poster': return 'Typography poster'
    case 'magazine-spread':   return 'Magazine spread'
    case 'duotone-portrait':  return 'Duotone portrait'
  }
}

function humanError(code: string, json?: unknown): string {
  const detail = (json as { detail?: string })?.detail || ''
  switch (code) {
    case 'no_top_picks_in_gallery': return 'אין top picks באירוע הזה. סמן תמונות עם כוכב ב-Galleries.'
    case 'gallery_not_owned_by_client': return 'האירוע לא שייך ללקוח הזה.'
    case 'anthropic_call_failed': return `קריאה ל-AI נכשלה. ${detail.slice(0, 80)}`
    case 'llm_returned_no_json':
    case 'llm_returned_bad_json':
    case 'llm_returned_no_directions':
    case 'no_valid_posts_after_resolution':
      return 'ה-AI החזיר פלט לא תקין. נסו שוב.'
    default: return 'שגיאה. ' + (detail || code)
  }
}

// Avoid unused-import warning when we removed the html2canvas dep for v1.
const _unused: typeof useEffect = useEffect
void _unused

// ─── Styles ──────────────────────────────────────────────────────────────
const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
  backdropFilter: 'blur(10px)', zIndex: 120,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  direction: 'rtl',
}
const modalStyle: CSSProperties = {
  width: '100%', maxWidth: 1180, maxHeight: '94vh', overflow: 'auto',
  background: '#0a0a0f',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 14, padding: '26px 30px',
  color: 'rgba(255,255,255,.92)',
  animation: 'ce-fadeIn .35s both',
}
const closeBtnStyle: CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,.15)',
  color: '#fff', borderRadius: 6, padding: '6px 12px',
  cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
}
const btnPrimary: CSSProperties = {
  padding: '12px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
  fontFamily: 'inherit', background: '#D4FF00', color: '#000',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
const btnGhost: CSSProperties = {
  padding: '12px 22px', fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'transparent', color: '#fafafa',
  border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
const btnPillSmall: CSSProperties = {
  padding: '8px 14px', fontSize: 11, fontWeight: 600,
  fontFamily: 'inherit', background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.65)',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 6,
  cursor: 'not-allowed', flex: 1,
}
