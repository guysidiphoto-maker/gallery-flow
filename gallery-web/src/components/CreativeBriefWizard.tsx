// CreativeBriefWizard — the 10-question creative brief that runs BEFORE
// AI generation. The headline UX change in piXflow Deep: photographers no
// longer click a single "generate" button. They direct the AI like a real
// social-media manager would, by answering creative-director questions.
//
// Each step is a single question with single- or multi-select options.
// The wizard owns its state internally and emits a Brief object on submit.
//
// Founder constraint (2026-05-06): "I am directing a creative system, not
// accepting a random AI output." Every screen here exists to make the
// photographer feel in control.

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

// ─── Types (mirror /docs/FEED_STUDIO_DEEP_ARCHITECTURE.md §2.1) ────────
export type ImageCountPreset = '1' | '3-5' | '6-10' | 'ai_decides' | 'custom'
export type CarouselPreset = 'every_gallery' | 'strong_only' | 'mix' | 'none'
export type SpreadPreset = 'one_per_post' | 'split_2_3' | 'full_block' | 'ai_decides'
export type FeedGoal =
  | 'premium_clean'
  | 'show_many_events'
  | 'sell_quality'
  | 'atmosphere_emotion'
  | 'active_successful'
  | 'portfolio'
export type ContentMix =
  | '70_people_30_atmo'
  | '50_50'
  | '30_people_70_design'
  | 'more_wide'
  | 'more_closeup'
  | 'more_branding'
  | 'ai_balance'
export type GridFeel =
  | 'editorial'
  | 'luxury_corporate'
  | 'energetic'
  | 'bold_campaign'
  | 'minimal_dark'
  | 'colorful_loud'
  | 'magazine_collage'
export type TextSlidePolicy =
  | 'between_images'
  | 'titles_only'
  | 'campaign_openers'
  | 'no_text'
  | 'ai_decides'
export type PostType =
  | 'feed'
  | 'carousel'
  | 'story'
  | 'reel_cover'
  | 'highlight_cover'
  | 'campaign_title'
export type TotalPosts = '3' | '6' | '9' | '12' | 'monthly_plan' | 'custom'
export type Continuity =
  | 'strict_continue'
  | 'continue_refresh'
  | 'new_campaign'
  | 'ai_suggests_3'

export interface Brief {
  imageCount: ImageCountPreset
  imageCountCustom?: number
  carousels: CarouselPreset
  spread: SpreadPreset
  goal: FeedGoal
  contentMix: ContentMix
  feel: GridFeel
  textSlides: TextSlidePolicy
  postTypes: PostType[]
  totalPosts: TotalPosts
  totalPostsCustom?: number
  continuity: Continuity
}

interface Option<T extends string> {
  value: T
  label: string       // Hebrew title
  sub?: string        // optional Hebrew sub-line
}

interface SingleStep<T extends string> {
  kind: 'single'
  key: keyof Brief
  question: string
  hint?: string
  options: Option<T>[]
  custom?: { trigger: T; placeholder: string }   // when option is custom, show numeric input
}

interface MultiStep<T extends string> {
  kind: 'multi'
  key: keyof Brief
  question: string
  hint?: string
  options: Option<T>[]
  minPick?: number
}

type Step =
  | SingleStep<ImageCountPreset>
  | SingleStep<CarouselPreset>
  | SingleStep<SpreadPreset>
  | SingleStep<FeedGoal>
  | SingleStep<ContentMix>
  | SingleStep<GridFeel>
  | SingleStep<TextSlidePolicy>
  | MultiStep<PostType>
  | SingleStep<TotalPosts>
  | SingleStep<Continuity>

const STEPS: Step[] = [
  {
    kind: 'single',
    key: 'imageCount',
    question: 'כמה תמונות מכל גלריה?',
    hint: 'כמה תמונות לכל אירוע ה-AI יבחר מתוך ה-top picks של הצלם.',
    options: [
      { value: '1', label: 'תמונת hero אחת לכל גלריה', sub: 'הכי נקי, מתאים לפיד שמרני' },
      { value: '3-5', label: '3–5 תמונות', sub: 'מתאים לקרוסלות ופוסטים מרובי-תמונה' },
      { value: '6-10', label: '6–10 תמונות', sub: 'אם כל אירוע ראוי לבלוק שלם בגריד' },
      { value: 'ai_decides', label: 'תן ל-AI להחליט', sub: 'ניקוד per-image יקבע כמה תמונות חזקות יש' },
      { value: 'custom', label: 'מספר מותאם...' },
    ],
    custom: { trigger: 'custom', placeholder: 'מספר תמונות לגלריה' },
  },
  {
    kind: 'single',
    key: 'carousels',
    question: 'האם כל גלריה צריכה להפוך לקרוסלה?',
    options: [
      { value: 'every_gallery', label: 'כן, כל אירוע = קרוסלה', sub: 'הכי הרבה חשיפה לכל פרויקט' },
      { value: 'strong_only', label: 'רק גלריות חזקות הופכות לקרוסלה', sub: 'AI יחליט לפי איכות' },
      { value: 'mix', label: 'תמהיל של פוסטים בודדים וקרוסלות', sub: 'הכי גמיש' },
      { value: 'none', label: 'בלי קרוסלות, רק פוסטים בודדים', sub: 'פיד שקט יותר' },
    ],
  },
  {
    kind: 'single',
    key: 'spread',
    question: 'האם פרויקט אחד יכול להתפרש על מספר משבצות בגריד?',
    options: [
      { value: 'one_per_post', label: 'לא — פרויקט אחד = פוסט אחד', sub: 'מקסימום מגוון בפיד' },
      { value: 'split_2_3', label: 'כן — לפצל אירועים חשובים על 2–3 משבצות' },
      { value: 'full_block', label: 'כן — בלוק שלם של 3×1 או 3×3 לכל פרויקט גדול' },
      { value: 'ai_decides', label: 'תן ל-AI להחליט לפי חוזק האירוע' },
    ],
  },
  {
    kind: 'single',
    key: 'goal',
    question: 'מה המטרה של הפיד?',
    options: [
      { value: 'premium_clean', label: 'להיראות פרימיום ונקי' },
      { value: 'show_many_events', label: 'להראות הרבה אירועים' },
      { value: 'sell_quality', label: 'למכור איכות הפקה' },
      { value: 'atmosphere_emotion', label: 'אווירה ורגש' },
      { value: 'active_successful', label: 'להראות לקוח פעיל ומצליח' },
      { value: 'portfolio', label: 'לבנות פורטפוליו אינסטגרם חזק' },
    ],
  },
  {
    kind: 'single',
    key: 'contentMix',
    question: 'תמהיל תוכן מועדף?',
    options: [
      { value: '70_people_30_atmo', label: '70% אנשים · 30% אווירה' },
      { value: '50_50', label: '50% אנשים · 50% אווירה' },
      { value: '30_people_70_design', label: '30% אנשים · 70% עיצוב/פרטים' },
      { value: 'more_wide', label: 'יותר תמונות רחבות' },
      { value: 'more_closeup', label: 'יותר קלוז-אפים' },
      { value: 'more_branding', label: 'יותר רגעי מיתוג' },
      { value: 'ai_balance', label: 'תן ל-AI לאזן' },
    ],
  },
  {
    kind: 'single',
    key: 'feel',
    question: 'איך הגריד צריך להרגיש?',
    options: [
      { value: 'editorial', label: 'עיתונאי-נקי' },
      { value: 'luxury_corporate', label: 'יוקרתי-תאגידי' },
      { value: 'energetic', label: 'אנרגטי, סיכום אירוע' },
      { value: 'bold_campaign', label: 'חזק, קמפיין סושיאל' },
      { value: 'minimal_dark', label: 'מינימליסטי כהה' },
      { value: 'colorful_loud', label: 'צבעוני ורועש' },
      { value: 'magazine_collage', label: 'קולאז\' בסגנון מגזין' },
    ],
  },
  {
    kind: 'single',
    key: 'textSlides',
    question: 'האם להוסיף שקופיות טקסט מעוצבות?',
    options: [
      { value: 'between_images', label: 'כן — בין התמונות' },
      { value: 'titles_only', label: 'רק לכותרות' },
      { value: 'campaign_openers', label: 'רק לפותחי קמפיין' },
      { value: 'no_text', label: 'בלי שקופיות טקסט' },
      { value: 'ai_decides', label: 'תן ל-AI להחליט' },
    ],
  },
  {
    kind: 'multi',
    key: 'postTypes',
    question: 'אילו סוגי פוסטים ליצור?',
    hint: 'בחר אחד או יותר. ניתן לערוך גם בשלבים הבאים.',
    options: [
      { value: 'feed', label: 'פוסטים בפיד' },
      { value: 'carousel', label: 'קרוסלות' },
      { value: 'story', label: 'סטוריז' },
      { value: 'reel_cover', label: 'כריכות ריל' },
      { value: 'highlight_cover', label: 'כריכות highlights' },
      { value: 'campaign_title', label: 'שקופיות פתיחת קמפיין' },
    ],
    minPick: 1,
  },
  {
    kind: 'single',
    key: 'totalPosts',
    question: 'כמה פוסטים סך-הכל?',
    options: [
      { value: '3', label: '3 פוסטים', sub: 'שבוע אחד' },
      { value: '6', label: '6 פוסטים', sub: 'שבועיים' },
      { value: '9', label: '9 פוסטים', sub: 'גריד 3×3 קלאסי' },
      { value: '12', label: '12 פוסטים', sub: 'חודש שלם, 3 בשבוע' },
      { value: 'monthly_plan', label: 'תכנית חודשית מלאה', sub: 'AI יחליט על המספר האופטימלי' },
      { value: 'custom', label: 'מספר מותאם...' },
    ],
    custom: { trigger: 'custom', placeholder: 'כמה פוסטים?' },
  },
  {
    kind: 'single',
    key: 'continuity',
    question: 'האם להמשיך את סגנון הפיד הקודם?',
    hint: 'ה-AI יזכור את ה-feel של פידים קודמים של אותו לקוח.',
    options: [
      { value: 'strict_continue', label: 'להמשיך באותו סגנון בדיוק' },
      { value: 'continue_refresh', label: 'להמשיך אבל לרענן קלות' },
      { value: 'new_campaign', label: 'ליצור סגנון קמפיין חדש' },
      { value: 'ai_suggests_3', label: 'תן ל-AI להציע 3 כיוונים' },
    ],
  },
]

const DEFAULT_BRIEF: Brief = {
  imageCount: 'ai_decides',
  carousels: 'mix',
  spread: 'ai_decides',
  goal: 'premium_clean',
  contentMix: 'ai_balance',
  feel: 'editorial',
  textSlides: 'ai_decides',
  postTypes: ['feed', 'carousel'],
  totalPosts: '9',
  continuity: 'continue_refresh',
}

export function CreativeBriefWizard(props: {
  onSubmit: (brief: Brief) => void
  onCancel: () => void
  initial?: Partial<Brief>
}) {
  const [brief, setBrief] = useState<Brief>({ ...DEFAULT_BRIEF, ...(props.initial ?? {}) })
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]
  const totalSteps = STEPS.length

  const stepValid = useMemo(() => {
    if (step.kind === 'multi') {
      const arr = brief[step.key] as string[]
      const minPick = step.minPick ?? 1
      return Array.isArray(arr) && arr.length >= minPick
    }
    const value = brief[step.key]
    if (value === undefined) return false
    // If the chosen option is "custom", require the custom number to be set.
    if (step.kind === 'single' && step.custom && value === step.custom.trigger) {
      const customField = (step.key === 'imageCount' ? 'imageCountCustom' : 'totalPostsCustom') as keyof Brief
      const n = brief[customField] as number | undefined
      return typeof n === 'number' && n > 0
    }
    return true
  }, [brief, step])

  function handleSelectSingle(value: string) {
    setBrief({ ...brief, [step.key]: value })
  }

  function handleToggleMulti(value: string) {
    if (step.kind !== 'multi') return
    const cur = (brief[step.key] as string[]) ?? []
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
    setBrief({ ...brief, [step.key]: next })
  }

  function handleCustomNumber(n: number) {
    if (step.kind !== 'single' || !step.custom) return
    const customField = (step.key === 'imageCount' ? 'imageCountCustom' : 'totalPostsCustom')
    setBrief({ ...brief, [customField]: n })
  }

  function next() {
    if (!stepValid) return
    if (stepIdx < totalSteps - 1) setStepIdx(stepIdx + 1)
    else props.onSubmit(brief)
  }

  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
    else props.onCancel()
  }

  return (
    <div style={overlayStyle}>
      <style>{`
        @keyframes cw-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cw-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        .cw-opt:hover { background: rgba(255,255,255,.06) !important; }
      `}</style>

      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{
              fontSize: 11, letterSpacing: '.32em', textTransform: 'uppercase',
              color: '#D4FF00', marginBottom: 6, fontWeight: 700,
            }}>
              Creative Brief · שלב {stepIdx + 1} מתוך {totalSteps}
            </div>
            <h2 style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2,
              color: '#fff',
            }}>
              {step.question}
            </h2>
            {step.hint && (
              <div style={{
                marginTop: 10, fontSize: 14, color: 'rgba(255,255,255,.55)',
                lineHeight: 1.6, maxWidth: 640,
              }}>
                {step.hint}
              </div>
            )}
          </div>
          <button onClick={props.onCancel} aria-label="סגור" style={closeBtnStyle}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 2, background: 'rgba(255,255,255,.08)', borderRadius: 1,
          overflow: 'hidden', marginBottom: 32,
        }}>
          <div style={{
            height: '100%', width: `${((stepIdx + 1) / totalSteps) * 100}%`,
            background: '#D4FF00', transition: 'width .3s',
          }} />
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'cw-fadeIn .3s both' }}>
          {step.options.map(opt => {
            const isSelected =
              step.kind === 'multi'
                ? ((brief[step.key] as string[]) ?? []).includes(opt.value)
                : (brief[step.key] as string) === opt.value
            return (
              <button
                key={opt.value}
                className="cw-opt"
                onClick={() => {
                  if (step.kind === 'multi') handleToggleMulti(opt.value)
                  else handleSelectSingle(opt.value)
                }}
                style={{
                  ...optionStyle,
                  background: isSelected ? 'rgba(212,255,0,.08)' : 'rgba(255,255,255,.03)',
                  borderColor: isSelected ? '#D4FF00' : 'rgba(255,255,255,.08)',
                }}
              >
                <div style={{
                  width: 20, height: 20,
                  borderRadius: step.kind === 'multi' ? 4 : 10,
                  border: `2px solid ${isSelected ? '#D4FF00' : 'rgba(255,255,255,.25)'}`,
                  background: isSelected ? '#D4FF00' : 'transparent',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#000', fontWeight: 800,
                }}>
                  {isSelected && (step.kind === 'multi' ? '✓' : '●')}
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

          {/* Custom number input — only when "custom" option is selected on a single-step */}
          {step.kind === 'single' && step.custom &&
            (brief[step.key] as string) === step.custom.trigger && (
              <input
                type="number"
                placeholder={step.custom.placeholder}
                min={1}
                max={100}
                onChange={e => handleCustomNumber(Number(e.target.value))}
                value={
                  (brief[step.key === 'imageCount' ? 'imageCountCustom' : 'totalPostsCustom'] as number | undefined) ??
                  ''
                }
                style={{
                  marginTop: 6, padding: '12px 16px',
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(212,255,0,.4)',
                  borderRadius: 8, color: '#fff', fontSize: 15,
                  fontFamily: 'inherit', direction: 'rtl', width: '100%',
                }}
              />
            )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 36, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <button onClick={back} style={btnGhost}>
            <span>{stepIdx === 0 ? '✕' : '←'}</span>
            <span>{stepIdx === 0 ? 'ביטול' : 'חזור'}</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
              שלב {stepIdx + 1} / {totalSteps}
            </span>
            <button
              onClick={next}
              disabled={!stepValid}
              style={{
                ...btnPrimary,
                opacity: stepValid ? 1 : 0.4,
                cursor: stepValid ? 'pointer' : 'not-allowed',
              }}
            >
              <span>{stepIdx === totalSteps - 1 ? '✨' : '←'}</span>
              <span>{stepIdx === totalSteps - 1 ? 'בנה לי תוכנית פיד' : 'המשך'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────
const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
  backdropFilter: 'blur(10px)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  direction: 'rtl',
}

const modalStyle: CSSProperties = {
  width: '100%', maxWidth: 760,
  maxHeight: '92vh', overflow: 'auto',
  background: '#0a0a0f',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 14,
  padding: '36px 40px 28px',
  color: 'rgba(255,255,255,.92)',
  animation: 'cw-fadeIn .35s both',
}

const closeBtnStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,.15)',
  color: '#fff', borderRadius: 6, padding: '6px 12px',
  cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
}

const optionStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '14px 18px',
  border: '1px solid',
  borderRadius: 10,
  cursor: 'pointer', textAlign: 'right',
  fontFamily: 'inherit',
  transition: 'background .2s, border-color .2s',
  width: '100%',
}

const btnPrimary: CSSProperties = {
  padding: '14px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
  fontFamily: 'inherit', background: '#D4FF00', color: '#000',
  border: 'none', borderRadius: 6,
  display: 'inline-flex', alignItems: 'center', gap: 8,
}

const btnGhost: CSSProperties = {
  padding: '14px 22px', fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'transparent', color: '#fafafa',
  border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
