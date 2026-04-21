import React, { useState, useEffect, useRef, useCallback } from 'react'

type Phase = 'welcome' | 'camera' | 'thinking' | 'found'

const accent = '#6366f1'
const bg = '#07070d'

const keyframes = `
@keyframes demoPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99,102,241,.4); }
  50% { transform: scale(1.04); box-shadow: 0 0 30px 10px rgba(99,102,241,.25); }
}
@keyframes demoGlow {
  0%, 100% { box-shadow: 0 0 20px 4px rgba(99,102,241,.3); }
  50% { box-shadow: 0 0 40px 12px rgba(99,102,241,.5); }
}
@keyframes demoBreathe {
  0%, 100% { opacity: .85; }
  50% { opacity: 1; }
}
@keyframes demoSlideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes demoScaleIn {
  from { opacity: 0; transform: scale(.7); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes demoSuccessRing {
  0% { box-shadow: 0 0 0 0 rgba(34,197,94,.6); }
  70% { box-shadow: 0 0 0 14px rgba(34,197,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
`

const thinkingLines = [
  'רגע… מחפשים אותך',
  'עוברים על התמונות 👀',
  'יש מצב שתפסנו אותך…',
  'עוד שנייה ויש לנו את זה',
]

export function DemoPage() {
  const [phase, setPhase] = useState<Phase>('welcome')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [visibleLines, setVisibleLines] = useState(0)
  const [visibleThumbs, setVisibleThumbs] = useState(0)
  const [cameraAvailable, setCameraAvailable] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Inject keyframes
  useEffect(() => {
    const id = 'demo-keyframes'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = keyframes
      document.head.appendChild(style)
    }
    return () => { document.getElementById(id)?.remove() }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraAvailable(true)
    } catch {
      setCameraAvailable(false)
    }
  }, [])

  useEffect(() => {
    if (phase === 'camera') startCamera()
    else stopCamera()
    return stopCamera
  }, [phase, startCamera, stopCamera])

  // Thinking phase: reveal lines one by one
  useEffect(() => {
    if (phase !== 'thinking') { setVisibleLines(0); return }
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleLines(i)
      if (i >= thinkingLines.length) clearInterval(timer)
    }, 600)
    // Transition to found after all lines + delay
    const done = setTimeout(() => setPhase('found'), thinkingLines.length * 600 + 1400)
    return () => { clearInterval(timer); clearTimeout(done) }
  }, [phase])

  // Found phase: reveal thumbnails
  useEffect(() => {
    if (phase !== 'found') { setVisibleThumbs(0); return }
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleThumbs(i)
      if (i >= 6) clearInterval(timer)
    }, 180)
    return () => clearInterval(timer)
  }, [phase])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    setSelfieUrl(canvas.toDataURL('image/jpeg', 0.85))
    stopCamera()
    setPhase('thinking')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setSelfieUrl(reader.result as string)
      setPhase('thinking')
    }
    reader.readAsDataURL(file)
  }

  function reset() {
    setSelfieUrl(null)
    setVisibleLines(0)
    setVisibleThumbs(0)
    setPhase('welcome')
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: `radial-gradient(ellipse at 50% 30%, rgba(99,102,241,.10) 0%, ${bg} 70%)`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Inter, sans-serif', direction: 'rtl', color: '#fff', padding: 24,
    position: 'relative', overflow: 'hidden',
  }

  const pillBtn = (primary: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '14px 40px', borderRadius: 50, fontSize: 16, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: 'none',
    ...(primary
      ? { background: `linear-gradient(135deg, ${accent}, #818cf8)`, color: '#fff' }
      : { background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.7)', backdropFilter: 'blur(8px)' }),
  })

  const selfieCircle = (size: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width: size, height: size, borderRadius: '50%', objectFit: 'cover',
    border: '3px solid rgba(99,102,241,.35)',
    ...extra,
  })

  // --- WELCOME ---
  if (phase === 'welcome') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.9 }}>📸</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 12, lineHeight: 1.3 }}>
            מצא את התמונות שלך
          </h1>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 15, marginBottom: 40, lineHeight: 1.7 }}>
            צלמו סלפי ונמצא את כל התמונות שלכם מהאירוע
          </p>
          <button style={pillBtn(true)} onClick={() => setPhase('camera')}>בואו נתחיל</button>
        </div>
      </div>
    )
  }

  // --- CAMERA ---
  if (phase === 'camera') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>צלמו סלפי</h2>

          {cameraAvailable ? (
            <>
              <div style={{
                width: 220, height: 220, borderRadius: '50%', overflow: 'hidden',
                margin: '0 auto 32px', border: '3px solid rgba(99,102,241,.35)',
                position: 'relative',
              }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
              </div>
              <button
                onClick={capture}
                style={{
                  width: 72, height: 72, borderRadius: '50%', border: '4px solid #fff',
                  background: 'rgba(255,255,255,.15)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto',
                }}
                aria-label="Capture"
              >
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff' }} />
              </button>
            </>
          ) : (
            <div style={{ marginTop: 20 }}>
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, marginBottom: 20 }}>
                לא הצלחנו לגשת למצלמה. העלו תמונה במקום.
              </p>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileRef.current?.click()}
            style={{ ...pillBtn(false), marginTop: 28, fontSize: 14, padding: '10px 28px' }}
          >
            העלאת תמונה מהגלריה
          </button>
        </div>
      </div>
    )
  }

  // --- THINKING ---
  if (phase === 'thinking') {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          {selfieUrl && (
            <img
              src={selfieUrl}
              alt=""
              style={{
                ...selfieCircle(160),
                animation: 'demoPulse 2s ease-in-out infinite, demoGlow 2s ease-in-out infinite',
                marginBottom: 36,
              }}
            />
          )}
          <div style={{ minHeight: 120, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            {thinkingLines.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: 15,
                  direction: 'rtl',
                  color: i === visibleLines - 1 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.35)',
                  opacity: i < visibleLines ? 1 : 0,
                  animation: i < visibleLines ? 'demoSlideUp .4s ease-out forwards' : 'none',
                  transition: 'color .3s',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // --- FOUND ---
  return (
    <div style={containerStyle}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        {selfieUrl && (
          <img
            src={selfieUrl}
            alt=""
            style={{
              ...selfieCircle(130, {
                border: '3px solid #22c55e',
                animation: 'demoSuccessRing 1.5s ease-out',
              }),
              marginBottom: 20,
            }}
          />
        )}
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
          מצאנו אותך 🔥
        </h1>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 16, marginBottom: 28 }}>
          47 תמונות נמצאו
        </p>

        {/* Placeholder thumbnails */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
          marginBottom: 36,
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1', borderRadius: 12,
                background: `linear-gradient(135deg, hsl(${230 + i * 15}, 40%, ${18 + i * 3}%), hsl(${240 + i * 15}, 35%, ${24 + i * 2}%))`,
                opacity: i < visibleThumbs ? 1 : 0,
                transform: i < visibleThumbs ? 'scale(1)' : 'scale(.7)',
                animation: i < visibleThumbs ? 'demoScaleIn .35s ease-out forwards' : 'none',
                transition: 'opacity .3s, transform .3s',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <a href="/" style={{ ...pillBtn(true), textDecoration: 'none' }}>צפה בתמונות</a>
          <button onClick={reset} style={pillBtn(false)}>נסה שוב</button>
        </div>
      </div>
    </div>
  )
}
