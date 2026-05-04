import { useRef, useState, useCallback, useEffect } from 'react'
import { supabase } from '../supabase'
import { getStoredToken } from '../lib/galleryClient'

// ─── Types ────────────────────────────────────────────────────────────────────

const faceTexts = {
  en: {
    findYourPhotos: 'Find Your Photos',
    takeSelfie: 'Take a quick selfie and we\'ll find your photos',
    findMyPhotos: 'Find my photos',
    selfiePrivacy: 'Your photos are private — your selfie isn\'t saved',
    cameraTip: 'Take a selfie to find your photos',
    or: 'or',
    uploadPhoto: 'Upload a photo',
    photosFound: 'photos found',
    viewYourPhotos: 'View your photos',
    noMatch: 'No match found',
    noMatchMsg: 'We couldn\'t find you. Try again with better lighting, or browse all photos.',
    tipsTitle: 'Tips for better recognition:',
    tip1: 'Make sure your face is well-lit',
    tip2: 'Remove sunglasses or hats',
    tip3: 'Face the camera directly',
    browseAll: 'Browse all photos',
    tryAgain: 'Try again',
    privateNoMatch: 'Could not identify you',
    privateNoMatchMsg: 'Your photos may not be available in this gallery, or the selfie wasn\'t clear enough',
    talkToPhotographer: 'If this seems wrong — talk to the photographer',
    retake: 'Take photo again',
  },
  he: {
    findYourPhotos: 'מצא את התמונות שלך',
    takeSelfie: 'צלם סלפי מהיר ונמצא את התמונות שלך',
    findMyPhotos: 'מצא את התמונות שלי',
    selfiePrivacy: 'התמונות שלך מוגנות — סלפי לא נשמר',
    cameraTip: 'צלם סלפי כדי למצוא את התמונות שלך',
    or: 'או',
    uploadPhoto: 'העלה תמונה',
    photosFound: 'תמונות נמצאו',
    viewYourPhotos: 'צפה בתמונות שלך',
    noMatch: 'לא נמצאה התאמה',
    noMatchMsg: 'לא הצלחנו למצוא אותך לפי הסלפי. אפשר לנסות שוב עם תאורה טובה יותר, או לעבור על כל הגלריה.',
    tipsTitle: 'טיפים לזיהוי טוב יותר:',
    tip1: 'ודא שהפנים מוארות היטב',
    tip2: 'הסר משקפי שמש או כובע',
    tip3: 'הסתכל ישר למצלמה',
    browseAll: 'עבור על כל התמונות',
    tryAgain: 'נסה שוב',
    privateNoMatch: 'לא הצלחנו לזהות אותך',
    privateNoMatchMsg: 'ייתכן שהתמונות שלך אינן זמינות בגלריה זו, או שהסלפי לא היה ברור מספיק',
    talkToPhotographer: 'אם זה נראה שגוי — דבר עם הצלם',
    retake: 'צלם שוב',
  },
}

interface FaceSearchExperienceProps {
  galleryId: string
  /** Gallery images for blurred background */
  backgroundImages: Array<{ thumbnail_path: string | null; storage_path: string }>
  /** Resolve a storage path to a URL */
  storageUrl: (path: string) => string
  /** Privacy mode determines not-found behavior */
  privacyMode: 'open' | 'private'
  /** Gallery language */
  lang?: 'en' | 'he'
  /**
   * Called with matched image IDs and the hydrated image rows from the server.
   * In private mode the parent has no other source of image rows, so it must
   * adopt these as its `images` state.
   */
  onMatches: (imageIds: string[], images: ServerImageRow[]) => void
  onBrowseAll: () => void
  onClose: () => void
  onSelfieCapture?: (url: string) => void
}

interface ServerImageRow {
  id: string
  filename: string
  storage_path: string
  original_path: string | null
  thumbnail_path: string | null
  is_top_pick: boolean
  sort_order: number
  section_id: string | null
}

// Runtime guard for image rows hydrated by the rekognition edge function.
// The function runs with service-role and is trusted, but we still validate
// shape + types here so a malformed response (or a future schema drift) can't
// inject arbitrary objects into `images` state, which feeds <img src> URLs
// and download handlers.
function isServerImageRow(v: unknown): v is ServerImageRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  const isStr = (x: unknown) => typeof x === 'string'
  const isStrOrNull = (x: unknown) => x === null || typeof x === 'string'
  return (
    isStr(r.id) &&
    isStr(r.filename) &&
    isStr(r.storage_path) &&
    isStrOrNull(r.original_path) &&
    isStrOrNull(r.thumbnail_path) &&
    typeof r.is_top_pick === 'boolean' &&
    typeof r.sort_order === 'number' &&
    isStrOrNull(r.section_id)
  )
}

type Phase =
  | 'welcome'
  | 'camera'
  | 'thinking'
  | 'found'
  | 'not-found'
  | 'not-found-private'

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

// Thinking text lines per language
const THINKING_LINES_MAP = {
  he: [
    'רגע... מחפשים אותך',
    'עוברים על התמונות',
    'יש מצב שתפסנו אותך...',
    'עוד שנייה ויש לנו את זה',
  ],
  en: [
    'Hold on... searching for you',
    'Scanning through the photos',
    'We might have found you...',
    'Almost there!',
  ],
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FaceSearchExperience({
  galleryId,
  backgroundImages,
  storageUrl,
  privacyMode,
  lang = 'he',
  onMatches,
  onBrowseAll,
  onClose,
  onSelfieCapture,
}: FaceSearchExperienceProps) {
  const ft = faceTexts[lang] || faceTexts.he
  const [phase, setPhase] = useState<Phase>('welcome')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [matchIds, setMatchIds] = useState<string[]>([])
  const [matchImages, setMatchImages] = useState<ServerImageRow[]>([])
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
    THINKING_LINES_MAP[lang].forEach((_, i) => {
      lineTimers.push(setTimeout(() => setVisibleLines(i + 1), 500 + i * 600))
    })

    try {
      const form = new FormData()
      form.append('galleryId', galleryId)
      form.append('selfie', file)
      const token = getStoredToken(galleryId)
      if (token) form.append('token', token)

      const { data, error } = await supabase.functions.invoke('rekognition', {
        body: form,
      })

      if (error) throw new Error(error.message || 'Search failed')
      if (data?.error) throw new Error(String(data.error))

      const matches: Array<{ imageId: string; similarity: number }> = data?.matches ?? []
      const rawImages: unknown = data?.images ?? []
      const images: ServerImageRow[] = Array.isArray(rawImages)
        ? rawImages.filter(isServerImageRow)
        : []

      // Clear timers
      lineTimers.forEach(t => clearTimeout(t))

      // Ensure minimum thinking duration for UX
      await new Promise(r => setTimeout(r, 400))

      if (matches.length > 0) {
        const ids = matches.map(m => m.imageId)
        setMatchIds(ids)
        setMatchImages(images)
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
    onMatches(matchIds, matchImages)
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
        @keyframes fse-fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fse-fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes fse-pulse {
          0%, 100% { box-shadow: 0 0 30px rgba(99,102,241,.2), 0 0 60px rgba(99,102,241,.06); transform: scale(1); }
          50% { box-shadow: 0 0 50px rgba(99,102,241,.45), 0 0 100px rgba(99,102,241,.12); transform: scale(1.03); }
        }
        @keyframes fse-glow {
          0%, 100% { opacity: .3; transform: scale(1); }
          50% { opacity: .8; transform: scale(1.2); }
        }
        @keyframes fse-lineIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fse-scaleIn {
          from { opacity: 0; transform: scale(.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fse-imgReveal {
          from { opacity: 0; transform: scale(.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fse-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fse-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes fse-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fse-orbit-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes fse-scanline {
          0% { top: -2px; }
          100% { top: calc(100% + 2px); }
        }
        @keyframes fse-successPop {
          0% { opacity: 0; transform: scale(.6); }
          50% { transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fse-successGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,.15), 0 0 40px rgba(34,197,94,.05); }
          50% { box-shadow: 0 0 40px rgba(34,197,94,.3), 0 0 80px rgba(34,197,94,.1); }
        }
        @keyframes fse-confettiFloat {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-60px) rotate(180deg); opacity: 0; }
        }
        @keyframes fse-countUp {
          from { opacity: 0; transform: scale(.5) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fse-viewfinderCorner {
          0%, 100% { opacity: .5; }
          50% { opacity: 1; }
        }
        @keyframes fse-dotPulse {
          0%, 80%, 100% { opacity: .3; transform: scale(.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .fse-btn {
          padding: 16px 40px; border-radius: 50px; border: none;
          font-size: 15px; font-weight: 700; cursor: pointer;
          font-family: inherit; letter-spacing: .01em;
          transition: transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1);
          display: inline-flex; align-items: center; gap: 10px;
          position: relative; overflow: hidden;
        }
        .fse-btn::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.15) 0%, transparent 60%);
          opacity: 0;
          transition: opacity .25s;
        }
        .fse-btn:hover::after { opacity: 1; }
        .fse-btn:active { transform: scale(.97) !important; }
        .fse-btn--primary {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          box-shadow: 0 4px 20px rgba(99,102,241,.2);
        }
        .fse-btn--primary:hover {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 36px rgba(99,102,241,.35);
        }
        .fse-btn--success {
          background: linear-gradient(135deg, #10b981, #34d399);
          color: #fff;
          box-shadow: 0 4px 20px rgba(16,185,129,.25);
        }
        .fse-btn--success:hover {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 36px rgba(16,185,129,.35);
        }
        .fse-btn--secondary {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          color: rgba(255,255,255,.8);
          backdrop-filter: blur(8px);
        }
        .fse-btn--secondary:hover {
          background: rgba(255,255,255,.12);
          transform: translateY(-1px) scale(1.01);
          border-color: rgba(255,255,255,.18);
        }
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
          transition: 'opacity 1.2s cubic-bezier(.4,0,.2,1)',
        }} />
      )}

      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,.35) 0%, rgba(0,0,0,.85) 100%)',
      }} />

      {/* ── Close button ── */}
      {phase !== 'thinking' && (
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 10,
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
            color: 'rgba(255,255,255,.5)', cursor: 'pointer',
            fontSize: 18, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .25s cubic-bezier(.4,0,.2,1)',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,.12)'
            e.currentTarget.style.transform = 'scale(1.08)'
            e.currentTarget.style.color = 'rgba(255,255,255,.8)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,.06)'
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.color = 'rgba(255,255,255,.5)'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {/* ── Content ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        textAlign: 'center', padding: '0 28px',
        maxWidth: 480, width: '100%',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity .45s cubic-bezier(.4,0,.2,1)',
      }}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* WELCOME                                                           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'welcome' && (
          <div style={{ animation: 'fse-fadeIn .8s cubic-bezier(.16,1,.3,1) both' }}>
            {/* Face icon with animated ring */}
            <div style={{
              width: 88, height: 88, borderRadius: '50%', margin: '0 auto 32px',
              background: 'rgba(99,102,241,.06)',
              border: '1.5px solid rgba(99,102,241,.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', inset: -6, borderRadius: '50%',
                border: '1.5px dashed rgba(99,102,241,.15)',
                animation: 'fse-orbit 12s linear infinite',
              }} />
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.6)" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </div>

            <h1 style={{
              fontSize: 26, fontWeight: 800, color: '#fff',
              margin: '0 0 10px', letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}>
              {ft.findYourPhotos}
            </h1>

            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,.4)',
              margin: '0 0 32px', direction: lang === 'he' ? 'rtl' : 'ltr', lineHeight: 1.7,
              maxWidth: 280, marginInline: 'auto',
            }}>
              {ft.takeSelfie}
            </p>

            <button
              className="fse-btn fse-btn--primary"
              onClick={() => setPhase('camera')}
              style={{ fontSize: 16, padding: '18px 52px', marginBottom: 16 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {ft.findMyPhotos}
            </button>

            {/* Privacy assurance */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginTop: 8, opacity: .55,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.8)" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', letterSpacing: '.02em' }}>
                {ft.selfiePrivacy}
              </span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* CAMERA                                                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'camera' && (
          <div style={{ animation: 'fse-fadeIn .5s cubic-bezier(.16,1,.3,1) both' }}>
            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,.45)',
              margin: '0 0 28px', direction: lang === 'he' ? 'rtl' : 'ltr', lineHeight: 1.7,
              letterSpacing: '.01em',
            }}>
              {ft.cameraTip}
            </p>

            {/* Camera viewfinder */}
            <div style={{
              width: 240, height: 240, borderRadius: '50%',
              margin: '0 auto 32px',
              position: 'relative',
            }}>
              {/* Outer ring */}
              <div style={{
                position: 'absolute', inset: -8, borderRadius: '50%',
                border: '1.5px dashed rgba(99,102,241,.2)',
                animation: 'fse-orbit 8s linear infinite',
              }} />
              {/* Inner viewfinder */}
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                overflow: 'hidden',
                border: '3px solid rgba(99,102,241,.3)',
                background: '#0a0a0f',
                position: 'relative',
                boxShadow: '0 0 40px rgba(99,102,241,.08), inset 0 0 40px rgba(0,0,0,.3)',
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
                {/* Viewfinder crosshair overlay */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  pointerEvents: 'none',
                }}>
                  {/* Corner brackets */}
                  {[
                    { top: '15%', left: '15%', borderTop: '2px solid rgba(255,255,255,.35)', borderLeft: '2px solid rgba(255,255,255,.35)', borderRadius: '4px 0 0 0' },
                    { top: '15%', right: '15%', borderTop: '2px solid rgba(255,255,255,.35)', borderRight: '2px solid rgba(255,255,255,.35)', borderRadius: '0 4px 0 0' },
                    { bottom: '15%', left: '15%', borderBottom: '2px solid rgba(255,255,255,.35)', borderLeft: '2px solid rgba(255,255,255,.35)', borderRadius: '0 0 0 4px' },
                    { bottom: '15%', right: '15%', borderBottom: '2px solid rgba(255,255,255,.35)', borderRight: '2px solid rgba(255,255,255,.35)', borderRadius: '0 0 4px 0' },
                  ].map((s, i) => (
                    <div key={i} style={{
                      position: 'absolute', width: 20, height: 20,
                      animation: 'fse-viewfinderCorner 2s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                      ...s,
                    } as React.CSSProperties} />
                  ))}
                </div>
                {/* Subtle vignette */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  boxShadow: 'inset 0 0 40px rgba(0,0,0,.4)',
                  pointerEvents: 'none',
                }} />
              </div>
            </div>

            {/* Capture button */}
            <button
              onClick={captureSelfie}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'transparent', border: '3px solid rgba(255,255,255,.7)',
                cursor: 'pointer', margin: '0 auto 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                padding: 0,
                position: 'relative',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.06)'
                e.currentTarget.style.borderColor = 'rgba(99,102,241,.8)'
                e.currentTarget.style.boxShadow = '0 0 24px rgba(99,102,241,.2)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,.7)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              aria-label="Take selfie"
            >
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#fff',
                transition: 'all .15s',
              }} />
            </button>

            <p style={{
              fontSize: 13, color: 'rgba(255,255,255,.3)', margin: '4px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span style={{ width: 24, height: 1, background: 'rgba(255,255,255,.1)', display: 'inline-block' }} />
              {ft.or}
              <span style={{ width: 24, height: 1, background: 'rgba(255,255,255,.1)', display: 'inline-block' }} />
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none', border: 'none', color: 'rgba(99,102,241,.55)',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
                padding: '8px 16px', fontFamily: 'inherit',
                transition: 'color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(99,102,241,.85)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(99,102,241,.55)' }}
            >
              {ft.uploadPhoto}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* THINKING                                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'thinking' && (
          <div style={{ animation: 'fse-fadeIn .4s ease both' }}>
            {/* Selfie circle with orbital animation */}
            {selfieUrl && (
              <div style={{
                width: 150, height: 150,
                margin: '0 auto 36px',
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Outer orbit ring */}
                <div style={{
                  position: 'absolute', inset: -18, borderRadius: '50%',
                  border: '1.5px solid transparent',
                  borderTopColor: 'rgba(99,102,241,.4)',
                  borderRightColor: 'rgba(99,102,241,.15)',
                  animation: 'fse-orbit 2s linear infinite',
                }} />
                {/* Middle orbit ring */}
                <div style={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  border: '1px solid transparent',
                  borderBottomColor: 'rgba(139,92,246,.3)',
                  borderLeftColor: 'rgba(139,92,246,.1)',
                  animation: 'fse-orbit-reverse 3s linear infinite',
                }} />
                {/* Pulsing glow behind */}
                <div style={{
                  position: 'absolute', inset: -25, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(99,102,241,.12) 0%, transparent 70%)',
                  animation: 'fse-glow 2.5s ease-in-out infinite',
                  pointerEvents: 'none',
                }} />
                {/* Selfie image */}
                <div style={{
                  width: 140, height: 140, borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid rgba(99,102,241,.35)',
                  animation: 'fse-pulse 3s ease-in-out infinite',
                  position: 'relative',
                }}>
                  <img
                    src={selfieUrl}
                    alt=""
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                    }}
                  />
                  {/* Scan line effect */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0, height: 2,
                    background: 'linear-gradient(90deg, transparent, rgba(99,102,241,.5), transparent)',
                    animation: 'fse-scanline 2s ease-in-out infinite',
                    pointerEvents: 'none',
                  }} />
                </div>
              </div>
            )}

            {/* Animated dots */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24,
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'rgba(99,102,241,.6)',
                  animation: 'fse-dotPulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>

            {/* Thinking text lines */}
            <div style={{
              minHeight: 110, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 10, direction: lang === 'he' ? 'rtl' : 'ltr',
            }}>
              {THINKING_LINES_MAP[lang].map((line, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 15, margin: 0, lineHeight: 1.7,
                    color: i === visibleLines - 1
                      ? 'rgba(255,255,255,.75)'
                      : 'rgba(255,255,255,.25)',
                    opacity: i < visibleLines ? 1 : 0,
                    transform: i < visibleLines ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'all .6s cubic-bezier(.16,1,.3,1)',
                    fontWeight: i === visibleLines - 1 ? 600 : 400,
                    letterSpacing: '.01em',
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
          <div style={{ animation: 'fse-scaleIn .7s cubic-bezier(.16,1,.3,1) both' }}>
            {/* Selfie with success celebration */}
            {selfieUrl && (
              <div style={{
                position: 'relative',
                width: 110, height: 110,
                margin: '0 auto 28px',
              }}>
                {/* Success glow ring */}
                <div style={{
                  position: 'absolute', inset: -12, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(34,197,94,.15) 0%, transparent 70%)',
                  animation: 'fse-glow 2s ease-in-out infinite',
                }} />
                {/* Image */}
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid rgba(34,197,94,.5)',
                  animation: 'fse-successGlow 2.5s ease-in-out infinite',
                }}>
                  <img src={selfieUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                {/* Checkmark badge */}
                <div style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981, #34d399)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16,185,129,.3)',
                  animation: 'fse-successPop .5s cubic-bezier(.16,1,.3,1) .3s both',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                {/* Confetti-like particles */}
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{
                    position: 'absolute',
                    width: 4, height: 4, borderRadius: '50%',
                    background: i % 2 === 0 ? 'rgba(34,197,94,.6)' : 'rgba(99,102,241,.6)',
                    top: '50%', left: '50%',
                    animation: `fse-confettiFloat 1s cubic-bezier(.16,1,.3,1) ${0.2 + i * 0.08}s both`,
                    marginTop: Math.sin(i * 60 * Math.PI / 180) * 55,
                    marginLeft: Math.cos(i * 60 * Math.PI / 180) * 55,
                  }} />
                ))}
              </div>
            )}

            <h2 style={{
              fontSize: 30, fontWeight: 800, color: '#fff',
              margin: '0 0 8px', direction: lang === 'he' ? 'rtl' : 'ltr',
              animation: 'fse-fadeIn .5s cubic-bezier(.16,1,.3,1) .15s both',
              letterSpacing: '-0.03em',
            }}>
              {lang === 'he' ? '!מצאנו אותך' : 'We found you!'}
            </h2>

            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,.4)',
              margin: '0 0 16px', direction: lang === 'he' ? 'rtl' : 'ltr', lineHeight: 1.7,
              animation: 'fse-fadeIn .5s ease .25s both',
            }}>
              {lang === 'he' ? 'יש פה רגעים שלך — יאללה, תתחיל/י לעבור' : 'Your moments are here — go ahead, start browsing!'}
            </p>

            {/* Photo count badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '10px 24px', borderRadius: 24,
              background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.12)',
              margin: '0 0 32px',
              animation: 'fse-countUp .5s cubic-bezier(.16,1,.3,1) .35s both',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(34,197,94,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2" strokeLinecap="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <span style={{ fontSize: 15, color: 'rgba(34,197,94,.85)', fontWeight: 700, letterSpacing: '.01em' }}>
                {matchCount} {ft.photosFound}
              </span>
            </div>

            <div style={{ animation: 'fse-fadeIn .5s ease .45s both' }}>
              <button
                className="fse-btn fse-btn--success"
                onClick={handleViewPhotos}
                style={{ width: '100%', justifyContent: 'center', maxWidth: 320, fontSize: 16, padding: '18px 40px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {ft.viewYourPhotos}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* NOT FOUND — Regular gallery                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'not-found' && (
          <div style={{ animation: 'fse-fadeIn .6s cubic-bezier(.16,1,.3,1) both' }}>
            {selfieUrl && (
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                margin: '0 auto 28px', overflow: 'hidden',
                border: '2px solid rgba(255,255,255,.08)',
                opacity: .5,
                filter: 'grayscale(.4)',
              }}>
                <img src={selfieUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            <h2 style={{
              fontSize: 24, fontWeight: 700, color: '#fff',
              margin: '0 0 12px', direction: lang === 'he' ? 'rtl' : 'ltr',
              letterSpacing: '-0.02em',
            }}>
              {ft.noMatch}
            </h2>

            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,.38)',
              margin: '0 0 12px', direction: lang === 'he' ? 'rtl' : 'ltr', lineHeight: 1.7,
              maxWidth: 300, marginInline: 'auto',
            }}>
              לא הצלחנו למצוא אותך לפי הסלפי.
              <br />
              אפשר לנסות שוב עם תאורה טובה יותר, או לעבור על כל הגלריה.
            </p>

            {/* Tips */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              margin: '0 auto 28px', maxWidth: 280,
              padding: '14px 18px', borderRadius: 14,
              background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.3)', marginBottom: 2, direction: lang === 'he' ? 'rtl' : 'ltr' }}>
                {ft.tipsTitle}
              </div>
              {[ft.tip1, ft.tip2, ft.tip3].map((tip, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, color: 'rgba(255,255,255,.3)',
                }}>
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'rgba(99,102,241,.4)', flexShrink: 0,
                  }} />
                  {tip}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <button
                className="fse-btn fse-btn--primary"
                onClick={onBrowseAll}
                style={{ width: '100%', justifyContent: 'center', maxWidth: 320 }}
              >
                {ft.browseAll}
              </button>
              <button
                className="fse-btn fse-btn--secondary"
                onClick={retry}
                style={{ width: '100%', justifyContent: 'center', maxWidth: 320 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {ft.tryAgain}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* NOT FOUND — Private gallery                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 'not-found-private' && (
          <div style={{ animation: 'fse-fadeIn .6s cubic-bezier(.16,1,.3,1) both' }}>
            {/* Lock icon */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              margin: '0 auto 28px',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2 style={{
              fontSize: 22, fontWeight: 700, color: '#fff',
              margin: '0 0 12px', direction: lang === 'he' ? 'rtl' : 'ltr',
              letterSpacing: '-0.02em',
            }}>
              {ft.privateNoMatch}
            </h2>

            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,.32)',
              margin: '0 0 32px', direction: lang === 'he' ? 'rtl' : 'ltr', lineHeight: 1.7,
              maxWidth: 280, marginInline: 'auto',
            }}>
              {ft.privateNoMatchMsg}
            </p>

            <button
              className="fse-btn fse-btn--secondary"
              onClick={retry}
              style={{ width: '100%', justifyContent: 'center', maxWidth: 320, marginBottom: 20 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {ft.retake}
            </button>

            <p style={{
              fontSize: 12, color: 'rgba(255,255,255,.2)',
              margin: 0, direction: lang === 'he' ? 'rtl' : 'ltr',
              lineHeight: 1.6,
            }}>
              {ft.talkToPhotographer}
            </p>
          </div>
        )}
      </div>

      {/* Hidden elements */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {/* No `capture` attribute — that forced mobile browsers to open the
          front camera, which made "Upload Photo" do another selfie instead
          of opening the photo library. The dedicated camera flow uses
          getUserMedia; this input is purely the upload-from-disk path. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
