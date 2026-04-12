import React, { useEffect, useState } from 'react'
import { AuthCard } from './AuthCard'

const SHOWCASE_QUOTES = [
  {
    title: 'Deliver galleries that feel like your studio.',
    sub: 'Branded URLs, custom layouts, no Pixflow watermark on your work.',
  },
  {
    title: 'Publish a 4,000-photo gallery in a single drag.',
    sub: 'Resumable uploads, originals + web-optimized + thumbnails — all automatic.',
  },
  {
    title: 'Your clients open the link. Everything just works.',
    sub: 'Password gates, download quality controls, story-style highlights, no fiddling.',
  },
]

const FEATURE_PILLS = [
  { label: 'Cloud Publish', x: '8%', y: '14%', delay: '0s' },
  { label: 'Branded Links', x: '70%', y: '20%', delay: '1.2s' },
  { label: 'Client Delivery', x: '12%', y: '78%', delay: '2.4s' },
  { label: 'Story Highlights', x: '66%', y: '74%', delay: '3.6s' },
]

export function AuthShell() {
  const [quoteIdx, setQuoteIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setQuoteIdx(i => (i + 1) % SHOWCASE_QUOTES.length), 5500)
    return () => clearInterval(id)
  }, [])

  const quote = SHOWCASE_QUOTES[quoteIdx]

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0a0a0f',
      display: 'flex',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Embedded keyframes for the showcase animations */}
      <style>{`
        @keyframes pixflow-spin { to { transform: rotate(360deg); } }
        @keyframes pixflow-drift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes pixflow-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        @keyframes pixflow-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pixflow-glow { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: .5; } 50% { transform: translate(-50%,-50%) scale(1.08); opacity: .75; } }
      `}</style>

      {/* macOS draggable title region — covers full top so users can drag from anywhere */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 38,
        WebkitAppRegion: 'drag',
        zIndex: 50,
      } as React.CSSProperties} />

      {/* ─── LEFT PANE: form ───────────────────────────────────────────────── */}
      <div style={{
        width: 480,
        minWidth: 420,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 56px',
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(99,102,241,.04) 0%, rgba(10,10,15,0) 60%)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 36 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 160" width="160" height="43">
            <defs>
              <linearGradient id="auth-dot" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#818cf8"/>
                <stop offset="50%" stopColor="#38bdf8"/>
                <stop offset="100%" stopColor="#a78bfa"/>
              </linearGradient>
            </defs>
            <text x="20" y="112" fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" fontSize="120" fontWeight="800" letterSpacing="-3" fill="#ffffff">Pixflow</text>
            <circle cx="160" cy="32" r="11" fill="url(#auth-dot)"/>
          </svg>
        </div>

        <AuthCard />

        <p style={{
          marginTop: 32,
          fontSize: 11,
          color: 'rgba(255,255,255,.22)',
          textAlign: 'center',
          maxWidth: 320,
          lineHeight: 1.6,
        }}>
          By continuing you agree to Pixflow's Terms of Service and Privacy Policy.
        </p>
      </div>

      {/* ─── RIGHT PANE: animated showcase ─────────────────────────────────── */}
      <div style={{
        flex: 1,
        position: 'relative',
        background: 'radial-gradient(ellipse at 30% 20%, rgba(99,102,241,.12) 0%, rgba(10,10,15,0) 55%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,.10) 0%, rgba(10,10,15,0) 50%), #0a0a0f',
        borderLeft: '1px solid rgba(255,255,255,.04)',
        overflow: 'hidden',
      }}>
        {/* Animated radial glow */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 720,
          height: 720,
          background: 'radial-gradient(circle, rgba(99,102,241,.18) 0%, rgba(99,102,241,.06) 30%, transparent 70%)',
          animation: 'pixflow-glow 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Subtle grid */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          pointerEvents: 'none',
        }} />

        {/* Floating feature pills */}
        {FEATURE_PILLS.map(p => (
          <div
            key={p.label}
            style={{
              position: 'absolute',
              top: p.y,
              left: p.x,
              padding: '7px 14px',
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,.72)',
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 999,
              backdropFilter: 'blur(12px)',
              animation: `pixflow-drift 6s ease-in-out infinite ${p.delay}, pixflow-fade-in .6s ease both`,
              animationDelay: p.delay,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 24px rgba(0,0,0,.4)',
            }}
          >
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#6366f1',
              marginRight: 8,
              verticalAlign: 'middle',
              boxShadow: '0 0 12px rgba(99,102,241,.8)',
            }} />
            {p.label}
          </div>
        ))}

        {/* Center: gallery mockup window */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -56%)',
          width: 'min(560px, 70%)',
          background: 'rgba(20,20,28,.7)',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 14,
          boxShadow: '0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(99,102,241,.15)',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden',
        }}>
          {/* Browser chrome */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '11px 14px',
            borderBottom: '1px solid rgba(255,255,255,.05)',
            background: 'rgba(255,255,255,.02)',
          }}>
            {['#ff5f57', '#febc2e', '#28c840'].map(c => (
              <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: .8 }} />
            ))}
            <div style={{
              flex: 1,
              marginLeft: 14,
              fontSize: 10,
              color: 'rgba(255,255,255,.4)',
              fontFamily: '-apple-system, ui-monospace, monospace',
              letterSpacing: '0.02em',
            }}>
              your-studio.pixflow.app/amanda-and-mark
            </div>
          </div>

          {/* Gallery grid mock */}
          <div style={{
            padding: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}>
            {[
              'linear-gradient(135deg,#fbcfe8 0%,#a78bfa 50%,#6366f1 100%)',
              'linear-gradient(135deg,#fde68a 0%,#fb923c 60%,#be185d 100%)',
              'linear-gradient(135deg,#bae6fd 0%,#818cf8 50%,#312e81 100%)',
              'linear-gradient(135deg,#fed7aa 0%,#fb7185 50%,#7c2d12 100%)',
              'linear-gradient(135deg,#a7f3d0 0%,#34d399 50%,#065f46 100%)',
              'linear-gradient(135deg,#e9d5ff 0%,#c084fc 50%,#581c87 100%)',
            ].map((bg, i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '4/5',
                  borderRadius: 6,
                  background: bg,
                  position: 'relative',
                  overflow: 'hidden',
                  animation: `pixflow-fade-in .6s ease both`,
                  animationDelay: `${0.4 + i * 0.08}s`,
                }}
              >
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.4) 100%)',
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* Rotating tagline */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 64,
          padding: '0 56px',
          textAlign: 'center',
        }}>
          <div key={quoteIdx} style={{
            animation: 'pixflow-fade-in .55s ease both',
          }}>
            <h2 style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'rgba(255,255,255,.92)',
              margin: '0 0 8px',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}>
              {quote.title}
            </h2>
            <p style={{
              fontSize: 13,
              color: 'rgba(255,255,255,.42)',
              margin: 0,
              maxWidth: 520,
              marginInline: 'auto',
              lineHeight: 1.5,
            }}>
              {quote.sub}
            </p>
          </div>

          {/* Quote indicator dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
            {SHOWCASE_QUOTES.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === quoteIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === quoteIdx ? 'rgba(99,102,241,.8)' : 'rgba(255,255,255,.15)',
                  transition: 'all .4s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
