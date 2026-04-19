import { useRef, useState, useCallback, useEffect } from 'react'
import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaceSearchExperienceProps {
  galleryId: string
  /** Gallery images for blurred background */
  backgroundImages: Array<{ thumbnail_path: string | null; storage_path: string }>
  /** Resolve a storage path to a URL */
  storageUrl: (path: string) => string
  /** Privacy mode determines not-found behavior */
  privacyMode: 'open' | 'private'
  onMatches: (imageIds: string[]) => void
  onBrowseAll: () => void
  onClose: () => void
  onSelfieCapture?: (url: string) => void
}

type Phase =
  | 'welcome'
  | 'camera'
  | 'thinking'
  | 'found'
  | 'not-found'
  | 'not-found-private'

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

// Thinking text lines — Hebrew, casual, human
const THINKING_LINES = [
  'רגע… מחפשים אותך',
  'עוברים על התמונות 👀',
  'יש מצב שתפסנו אותך…',
  'עוד שנייה ויש לנו את זה',
]

// ─── Component ────────────────────────────────────────────────────────────────

export function FaceSearchExperience({
  galleryId,
  backgroundImages,
  storageUrl,
  privacyMode,
  onMatches,
  onBrowseAll,
  onClose,
  onSelfieCapture,
}: FaceSearchExperienceProps) {
  const [phase, setPhase] = useState<Phase>('welcome')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [matchIds, setMatchIds] = useState<string[]>([])
  const [visibleLines, setVisibleLines] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Camera lifecycle ──────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch {
      // Camera not available — fall back to file input
      fileInputRef.current?.click()
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (phase === 'camera') {
      startCamera()
    } else {
      stopCamera()
    }
    return stopCamera
  }, [phase, startCamera, stopCamera])

  // ── Search (thinking phase) ───────────────────────────────────────────────

  const startSearch = useCallback(async (file: File) => {
    setPhase('thinking')
    setVisibleLines(0)

    // Animate thinking lines
    const lineTimers: ReturnType<typeof setTimeout>[] = []
    THINKING_LINES.forEach((_, i) => {
      lineTimers.push(setTimeout(() => setVisibleLines(i + 1), 500 + i * 600))
    })

    try {
      const form = new FormData()
      form.append('galleryId', galleryId)
      form.append('selfie', file)

      const { data, error } = await supabase.functions.invoke('rekognition', {
        body: form,
      })

      if (error) throw new Error(error.message || 'Search failed')
      if (data?.error) throw new Error(String(data.error))

      const matches: Array<{ imageId: string; similarity: number }> = data?.matches ?? []

      // Clear timers
      lineTimers.forEach(t => clearTimeout(t))

      // Ensure minimum thinking duration for UX
      await new Promise(r => setTimeout(r, 400))

      if (matches.length > 0) {
        const ids = matches.map(m => m.imageId)
        setMatchIds(ids)
        setMatchCount(ids.length)
        // Fade out thinking, then show found
        setFadeOut(true)
        setTimeout(() => {
          setFadeOut(false)
          setPhase('found')
        }, 500)
      } else {
        setFadeOut(true)
        setTimeout(() => {
          setFadeOut(false)
          setPhase(privacyMode === 'private' ? 'not-found-private' : 'not-found')
        }, 500)
      }
    } catch {
      setFadeOut(true)
      setTimeout(() => {
        setFadeOut(false)
        setPhase(privacyMode === 'private' ? 'not-found-private' : 'not-found')
      }, 500)
    }
  }, [galleryId, privacyMode])

  // ── Capture selfie from video ─────────────────────────────────────────────

  const captureSelfie = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const size = Math.min(video.videoWidth, video.videoHeight)
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Crop to center square, mirror horizontally
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2
    ctx.translate(size, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)

    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      setSelfieUrl(url)
      onSelfieCapture?.(url)

      stopCamera()
      startSearch(file)
    }, 'image/jpeg', 0.85)
  }, [stopCamera, startSearch, onSelfieCapture])

  // ── File input fallback ───────────────────────────────────────────────────

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_SELFIE_BYTES) return
    const url = URL.createObjectURL(f)
    setSelfieUrl(url)
    onSelfieCapture?.(url)

    stopCamera()
    startSearch(f)
  }

  // ── Retry ─────────────────────────────────────────────────────────────────

  const retry = () => {
    setSelfieUrl(null)

    setMatchIds([])
    setMatchCount(0)
    setVisibleLines(0)
    setPhase('camera')
  }

  // ── Handle found CTA ─────────────────────────────────────────────────────

  const handleViewPhotos = () => {
    onMatches(matchIds)
  }

  // ── Background images (blurred) ───────────────────────────────────────────

  const bgSrc = backgroundImages.length > 0
    ? storageUrl(backgroundImages[0].thumbnail_path || backgroundImages[0].storage_path)
    : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes fse-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fse-fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes fse-pulse { 0%, 100% { box-shadow: 0 0 30px rgba(99,102,241,.25), 0 0 60px rgba(99,102,241,.08); } 50% { box-shadow: 0 0 50px rgba(99,102,241,.4), 0 0 100px rgba(99,102,241,.15); } }
        @keyframes fse-glow { 0%, 100% { opacity: .4; transform: scale(1); } 50% { opacity: .7; transform: scale(1.15); } }
        @keyframes fse-lineIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fse-scaleIn { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes fse-imgReveal { from { opacity: 0; transform: scale(.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes fse-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes fse-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        .fse-btn {
          padding: 16px 40px; border-radius: 50px; border: none;
          font-size: 15px; font-weight: 700; cursor: pointer;
          font-family: inherit; letter-spacing: .01em;
          transition: transform .2s, box-shadow .2s;
          display: inline-flex; align-items: center; gap: 10px;
        }
        .fse-btn:active { transform: scale(.97) !important; }
        .fse-btn--primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
        }
        .fse-btn--primary:hover { transform: scale(1.03); box-shadow: 0 8px 32px rgba(99,102,241,.35); }
        .fse-btn--secondary {
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
          color: #fff;
        }
        .fse-btn--secondary:hover { background: rgba(255,255,255,.14); transform: scale(1.02); }
        .fse-btn--ghost {
          background: none; border: none; color: rgba(255,255,255,.45);
          padding: 12px 24px; font-size: 13px; font-weight: 500;
        }
        .fse-btn--ghost:hover { color: rgba(255,255,255,.7); }
      `}</style>

      {/* ── Blurred background ── */}
      {bgSrc && (
        <div style={{
          position: 'absolute', inset: -20,
          backgroundImage: `url(${bgSrc})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(50px) saturate(.5) brightness(.3)',
          opacity: phase === 'thinking' ? .5 : .3,
          transition: 'opacity 1s ease',
        }} />
      )}

      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,.4) 0%, rgba(0,0,0,.8) 100%)',
      }} />

      {/* ── Close button ── */}
      {phase !== 'thinking' && (
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.5)', cursor: 'pointer',
            fontSize: 20, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.12)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
        >×</button>
      )}

      {/* ── Content ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        textAlign: 'center', padding: '0 24px',
        maxWidth: 480, width: '100%',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity .4s ease',
      }}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* WELCOME                                                           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'welcome' && (
          <div style={{ animation: 'fse-fadeIn .7s ease both' }}>
            {/* Face icon */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 28px',
              background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.7)" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </div>

            <button
              className="fse-btn fse-btn--primary"
              onClick={() => setPhase('camera')}
              style={{ fontSize: 17, padding: '18px 48px', marginBottom: 16 }}
            >
              Find my photos
            </button>

            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,.4)',
              margin: 0, direction: 'rtl', lineHeight: 1.6,
            }}>
              צלם סלפי קטן ונמצא לך את התמונות שלך
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* CAMERA                                                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'camera' && (
          <div style={{ animation: 'fse-fadeIn .5s ease both' }}>
            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,.5)',
              margin: '0 0 24px', direction: 'rtl', lineHeight: 1.6,
            }}>
              צלם סלפי כדי למצוא את התמונות שלך
            </p>

            {/* Camera viewfinder */}
            <div style={{
              width: 220, height: 220, borderRadius: '50%',
              margin: '0 auto 28px', overflow: 'hidden',
              border: '3px solid rgba(99,102,241,.35)',
              background: '#0a0a0f',
              position: 'relative',
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  transform: 'scaleX(-1)',
                }}
              />
              {/* Subtle overlay ring */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,.3)',
                pointerEvents: 'none',
              }} />
            </div>

            {/* Capture button */}
            <button
              onClick={captureSelfie}
              style={{
                width: 68, height: 68, borderRadius: '50%',
                background: '#fff', border: '4px solid rgba(99,102,241,.4)',
                cursor: 'pointer', margin: '0 auto 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform .15s, box-shadow .15s',
                boxShadow: '0 4px 24px rgba(0,0,0,.3)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 32px rgba(99,102,241,.3)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,.3)' }}
              aria-label="Take selfie"
            >
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: '#fff', border: '2px solid rgba(0,0,0,.08)',
              }} />
            </button>

            <p style={{
              fontSize: 12, color: 'rgba(255,255,255,.25)', margin: '8px 0 0',
            }}>
              or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'none', border: 'none', color: 'rgba(99,102,241,.6)',
                  cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
                  padding: 0, fontFamily: 'inherit',
                }}
              >upload a photo</button>
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* THINKING                                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'thinking' && (
          <div style={{ animation: 'fse-fadeIn .4s ease both' }}>
            {/* Selfie circle with glow */}
            {selfieUrl && (
              <div style={{
                width: 140, height: 140, borderRadius: '50%',
                margin: '0 auto 32px', overflow: 'hidden',
                border: '3px solid rgba(99,102,241,.4)',
                animation: 'fse-pulse 2.5s ease-in-out infinite',
                position: 'relative',
              }}>
                {/* Glow ring behind */}
                <div style={{
                  position: 'absolute', inset: -15, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(99,102,241,.15) 0%, transparent 70%)',
                  animation: 'fse-glow 2.5s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
                <img
                  src={selfieUrl}
                  alt=""
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    animation: 'fse-breathe 3s ease-in-out infinite',
                  }}
                />
              </div>
            )}

            {/* Thinking text lines */}
            <div style={{
              minHeight: 100, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8, direction: 'rtl',
            }}>
              {THINKING_LINES.map((line, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 15, margin: 0, lineHeight: 1.6,
                    color: i === visibleLines - 1
                      ? 'rgba(255,255,255,.7)'
                      : 'rgba(255,255,255,.3)',
                    opacity: i < visibleLines ? 1 : 0,
                    transform: i < visibleLines ? 'translateY(0)' : 'translateY(10px)',
                    transition: 'all .5s cubic-bezier(.16,1,.3,1)',
                    fontWeight: i === visibleLines - 1 ? 500 : 400,
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FOUND                                                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'found' && (
          <div style={{ animation: 'fse-scaleIn .6s cubic-bezier(.16,1,.3,1) both' }}>
            {/* Selfie with success ring */}
            {selfieUrl && (
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                margin: '0 auto 24px', overflow: 'hidden',
                border: '3px solid rgba(34,197,94,.5)',
                boxShadow: '0 0 30px rgba(34,197,94,.2)',
                animation: 'fse-scaleIn .5s cubic-bezier(.16,1,.3,1) .1s both',
              }}>
                <img src={selfieUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            <h2 style={{
              fontSize: 28, fontWeight: 800, color: '#fff',
              margin: '0 0 8px', direction: 'rtl',
              animation: 'fse-fadeIn .5s ease .15s both',
            }}>
              מצאנו אותך 🔥
            </h2>

            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,.45)',
              margin: '0 0 12px', direction: 'rtl', lineHeight: 1.6,
              animation: 'fse-fadeIn .5s ease .25s both',
            }}>
              יש פה רגעים שלך — יאללה, תתחיל/י לעבור
            </p>

            {/* Photo count badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 20px', borderRadius: 20,
              background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.15)',
              margin: '0 0 28px',
              animation: 'fse-fadeIn .5s ease .3s both',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span style={{ fontSize: 14, color: 'rgba(34,197,94,.8)', fontWeight: 600 }}>
                {matchCount} Your photos
              </span>
            </div>

            <div style={{ animation: 'fse-fadeIn .5s ease .4s both' }}>
              <button
                className="fse-btn fse-btn--primary"
                onClick={handleViewPhotos}
                style={{ width: '100%', justifyContent: 'center', maxWidth: 320 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                צפה בתמונות שלך
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* NOT FOUND — Regular gallery                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'not-found' && (
          <div style={{ animation: 'fse-fadeIn .6s ease both' }}>
            {selfieUrl && (
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                margin: '0 auto 24px', overflow: 'hidden',
                border: '3px solid rgba(255,255,255,.1)',
                opacity: .6,
              }}>
                <img src={selfieUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            <h2 style={{
              fontSize: 24, fontWeight: 700, color: '#fff',
              margin: '0 0 10px', direction: 'rtl',
            }}>
              מוזר… לא מצאנו אותך לפי הסלפי 🤔
            </h2>

            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,.4)',
              margin: '0 0 32px', direction: 'rtl', lineHeight: 1.6,
            }}>
              אם אתה בטוח שהצטלמת — שווה לעבור על כל הגלריה
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <button
                className="fse-btn fse-btn--primary"
                onClick={onBrowseAll}
                style={{ width: '100%', justifyContent: 'center', maxWidth: 320 }}
              >
                צפה בכל התמונות
              </button>
              <button
                className="fse-btn fse-btn--secondary"
                onClick={retry}
                style={{ width: '100%', justifyContent: 'center', maxWidth: 320 }}
              >
                נסה שוב
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* NOT FOUND — Private gallery                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'not-found-private' && (
          <div style={{ animation: 'fse-fadeIn .6s ease both' }}>
            {/* Lock icon */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              margin: '0 auto 24px',
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2 style={{
              fontSize: 22, fontWeight: 700, color: '#fff',
              margin: '0 0 10px', direction: 'rtl',
            }}>
              לא הצלחנו לזהות אותך לפי הסלפי
            </h2>

            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,.35)',
              margin: '0 0 32px', direction: 'rtl', lineHeight: 1.6,
            }}>
              יכול להיות שהתמונות שלך לא זמינות בגלריה הזו
            </p>

            <button
              className="fse-btn fse-btn--secondary"
              onClick={retry}
              style={{ width: '100%', justifyContent: 'center', maxWidth: 320, marginBottom: 16 }}
            >
              צלם שוב
            </button>

            <p style={{
              fontSize: 12, color: 'rgba(255,255,255,.22)',
              margin: 0, direction: 'rtl',
            }}>
              אם נראה לך שיש טעות — דבר עם הצלם
            </p>
          </div>
        )}
      </div>

      {/* Hidden elements */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="user"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
