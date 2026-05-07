// EventPlanDialog — the per-event AI suggestion modal.
//
// Flow:
//   1. Open with a galleryId + galleryName
//   2. Score this gallery's top picks (idempotent — fast if already scored)
//   3. Call /api/plan-event for 2 suggestions
//   4. Show each suggestion as a compact preview (single or carousel),
//      with caption, reasoning, suggested schedule offset
//   5. User picks per suggestion: ✓ Add / ✗ Skip
//   6. "אשר והוסף לפיד" → POST /api/append-event-posts
//   7. On success, parent refetches plan and closes dialog
//
// The dialog stays light: no editing here. After approval, the user can
// edit each post in the workspace (caption, crop, schedule, status).

import { useEffect, useState, useMemo, type CSSProperties } from 'react'
import { storageUrl } from '../supabase'

interface TopPick {
  id: string
  gallery_id: string
  thumbnail_path: string | null
  storage_path: string
}

interface SingleSuggestion {
  id: string
  format: 'single'
  position: null
  source_gallery_id: string
  image_id: string
  caption: string
  reasoning: string
  suggested_schedule_offset_days: number
}

interface CarouselSuggestion {
  id: string
  format: 'carousel'
  position: null
  source_gallery_id: string
  image_ids: string[]
  opening_caption: string
  slide_captions: Array<{ image_id: string; caption: string }>
  reasoning: string
  suggested_schedule_offset_days: number
}

type Suggestion = SingleSuggestion | CarouselSuggestion

interface EventPlanDialogProps {
  clientId: string
  galleryId: string
  galleryName: string
  topPicksCount: number
  imageById: Map<string, TopPick>
  onClose: () => void
  onAppended: () => void   // parent refetches plan after success
}

type Stage = 'scoring' | 'planning' | 'review' | 'submitting' | 'error'

export function EventPlanDialog({
  clientId, galleryId, galleryName, topPicksCount,
  imageById, onClose, onAppended,
}: EventPlanDialogProps) {
  const [stage, setStage] = useState<Stage>('scoring')
  const [stageLabel, setStageLabel] = useState('AI מנקד את התמונות של האירוע…')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Step 1: ensure scoring (cheap if cached).
        setStageLabel('AI מנקד את התמונות של האירוע…')
        await fetch('/api/score-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        })
        if (cancelled) return

        // Step 2: ask for suggestions.
        setStage('planning')
        setStageLabel('AI מציע פוסטים לאירוע…')
        const res = await fetch('/api/plan-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, galleryId, count: 2 }),
        })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok || !json.ok) {
          setStage('error')
          setError(humanError(json?.error ?? `http_${res.status}`, json))
          return
        }
        const got = (json.suggestions ?? []) as Suggestion[]
        setSuggestions(got)
        // Default: accept all.
        setAccepted(new Set(got.map(s => s.id)))
        setStage('review')
      } catch {
        if (!cancelled) {
          setStage('error')
          setError('שגיאה בלתי צפויה. נסו שוב.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [clientId, galleryId])

  function toggleAccept(id: string) {
    setAccepted(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function commit() {
    if (accepted.size === 0) {
      setError('בחר לפחות פוסט אחד.')
      return
    }
    setStage('submitting')
    setError(null)
    const toSend = suggestions.filter(s => accepted.has(s.id))
    try {
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, posts: toSend }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setStage('error')
        setError(humanError(json?.error ?? `http_${res.status}`, json))
        return
      }
      onAppended()
      onClose()
    } catch {
      setStage('error')
      setError('שמירה נכשלה. נסו שוב.')
    }
  }

  return (
    <div onClick={onClose} style={overlayStyle}>
      <style>{`
        @keyframes ev-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ev-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.32em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 6, fontWeight: 700 }}>
              Plan event
            </div>
            <h2 style={{
              fontFamily: 'Playfair Display, Georgia, serif', fontSize: 26, fontWeight: 800,
              margin: 0, letterSpacing: '-0.02em', color: '#fff',
            }}>
              {galleryName}
            </h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 6 }}>
              {topPicksCount} top picks · AI יציע 1–3 פוסטים שמשתלבים בלוח השנה הקיים
            </div>
          </div>
          <button onClick={onClose} aria-label="סגור" style={closeBtnStyle}>✕</button>
        </div>

        {/* Stage: scoring / planning */}
        {(stage === 'scoring' || stage === 'planning') && (
          <div style={{ padding: '40px 0', textAlign: 'center', animation: 'ev-fadeIn .3s both' }}>
            <div style={{
              width: 8, height: 8, borderRadius: 4, background: '#D4FF00',
              animation: 'ev-pulse 1.4s ease-in-out infinite', display: 'inline-block', marginBottom: 18,
            }} />
            <div style={{
              fontFamily: 'Playfair Display, Georgia, serif', fontSize: 22, fontWeight: 800,
              color: '#fff', marginBottom: 8,
            }}>
              {stageLabel}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
              {stage === 'scoring' ? '~10–15 שניות' : '~20–30 שניות'}
            </div>
          </div>
        )}

        {/* Stage: error */}
        {stage === 'error' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#ff6b6b', marginBottom: 18 }}>{error}</div>
            <button onClick={onClose} style={btnGhost}>סגור</button>
          </div>
        )}

        {/* Stage: review */}
        {(stage === 'review' || stage === 'submitting') && (
          <>
            <div style={{ marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.7 }}>
              ה-AI הציע {suggestions.length} פוסטים לאירוע הזה. סמן אילו להוסיף ללוח השנה.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {suggestions.map(s => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  imageById={imageById}
                  isAccepted={accepted.has(s.id)}
                  onToggle={() => toggleAccept(s.id)}
                />
              ))}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                נבחרו {accepted.size} מתוך {suggestions.length}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={btnGhost} disabled={stage === 'submitting'}>ביטול</button>
                <button
                  onClick={commit}
                  disabled={accepted.size === 0 || stage === 'submitting'}
                  style={{ ...btnPrimary, opacity: accepted.size > 0 && stage !== 'submitting' ? 1 : 0.4 }}
                >
                  <span>{stage === 'submitting' ? '⏳' : '✓'}</span>
                  <span>{stage === 'submitting' ? 'מוסיף לפיד…' : 'אשר והוסף לפיד'}</span>
                </button>
              </div>
            </div>
            {error && stage === 'review' && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#ff6b6b' }}>{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SuggestionCard({
  suggestion, imageById, isAccepted, onToggle,
}: {
  suggestion: Suggestion
  imageById: Map<string, TopPick>
  isAccepted: boolean
  onToggle: () => void
}) {
  const accent = isAccepted ? '#D4FF00' : 'rgba(255,255,255,.15)'
  const offset = suggestion.suggested_schedule_offset_days
  const offsetLabel = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    const days = ['א','ב','ג','ד','ה','ו','ש']
    return `יום ${days[d.getDay()]} · ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`
  }, [offset])

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', gap: 14, padding: 14, borderRadius: 10,
        background: isAccepted ? 'rgba(212,255,0,.06)' : 'rgba(255,255,255,.03)',
        border: `1px solid ${accent}`, cursor: 'pointer', transition: 'all .2s',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 4,
        border: `2px solid ${isAccepted ? '#D4FF00' : 'rgba(255,255,255,.25)'}`,
        background: isAccepted ? '#D4FF00' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#000', fontWeight: 800, flexShrink: 0,
      }}>
        {isAccepted && '✓'}
      </div>
      <div style={{ flex: '0 0 88px' }}>
        <SuggestionPreview suggestion={suggestion} imageById={imageById} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'inline-flex', gap: 8, alignItems: 'center',
          fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
          color: '#D4FF00', fontWeight: 700, marginBottom: 6,
        }}>
          <span>{suggestion.format === 'single' ? '🖼 פוסט בודד' : `🎴 קרוסלה · ${suggestion.image_ids.length}`}</span>
          <span style={{ color: 'rgba(255,255,255,.5)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,.7)' }}>{offsetLabel}</span>
        </div>
        <div style={{
          fontSize: 14, color: '#fff', lineHeight: 1.5, marginBottom: 8,
          fontWeight: 500,
        }}>
          {suggestion.format === 'single' ? suggestion.caption : suggestion.opening_caption}
        </div>
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,.55)', lineHeight: 1.6,
          fontStyle: 'italic',
        }}>
          {suggestion.reasoning}
        </div>
      </div>
    </div>
  )
}

function SuggestionPreview({
  suggestion, imageById,
}: { suggestion: Suggestion; imageById: Map<string, TopPick> }) {
  if (suggestion.format === 'single') {
    const img = imageById.get(suggestion.image_id)
    return (
      <div style={{
        aspectRatio: '1/1', width: '100%', borderRadius: 6, overflow: 'hidden',
        background: '#000',
      }}>
        {img && (
          <img
            src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
    )
  }
  // Carousel — stacked deck visual.
  const ids = suggestion.image_ids.slice(0, 3)
  return (
    <div style={{ position: 'relative', aspectRatio: '1/1', width: '100%' }}>
      {ids.map((imageId, i) => {
        const img = imageById.get(imageId)
        return (
          <div
            key={imageId}
            style={{
              position: 'absolute',
              inset: `${i * 4}px ${i * 4}px ${(2 - i) * 4}px ${(2 - i) * 4}px`,
              borderRadius: 6, overflow: 'hidden',
              background: '#000',
              border: '1px solid rgba(255,255,255,.1)',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              zIndex: 3 - i,
            }}
          >
            {img && (
              <img
                src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function humanError(code: string, json?: unknown): string {
  const detail = (json as { detail?: string })?.detail || ''
  switch (code) {
    case 'no_top_picks_in_gallery':         return 'אין top picks באירוע הזה. סמן תמונות עם כוכב ב-Galleries.'
    case 'gallery_not_owned_by_client':     return 'האירוע לא שייך ללקוח הזה.'
    case 'anthropic_call_failed':           return `קריאה ל-AI נכשלה. ${detail.slice(0,80)}`
    case 'llm_returned_no_json':
    case 'llm_returned_bad_json':
    case 'llm_returned_no_suggestions':
    case 'no_valid_suggestions_after_resolution':
      return 'ה-AI החזיר פלט לא תקין. נסו שוב.'
    case 'gallery_not_found':                return 'האירוע לא נמצא.'
    default:                                  return 'שגיאה. ' + (detail || code)
  }
}

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)',
  backdropFilter: 'blur(8px)', zIndex: 110,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  direction: 'rtl',
}
const modalStyle: CSSProperties = {
  width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto',
  background: '#0a0a0f',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 14, padding: '28px 30px 24px',
  color: 'rgba(255,255,255,.92)',
  animation: 'ev-fadeIn .3s both',
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
