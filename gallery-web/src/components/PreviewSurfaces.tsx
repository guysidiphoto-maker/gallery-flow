// ─── PreviewSurfaces — shared viewer chrome ──────────────────────────────
//
// Reusable preview render extracted from App.tsx so the dashboard's
// Live-Preview pane can render the SAME visuals as the public viewer
// without bouncing through an iframe → CDN → JS bundle → Supabase round
// trip per keystroke.
//
// Only the WelcomeScreen is extracted here for now (the dominant surface
// in the side-preview pane); a future pass can lift the stacked-chapter
// grid out of App.tsx the same way.

import { useState } from 'react'
import type { GalleryImage } from '../types'
import { t, type Lang } from '../i18n'

// ─── Welcome Screen ─────────────────────────────────────────────────────────

export function WelcomeScreen({ style = 'mosaic', galleryTitle, galleryDescription, welcomeMessage, textAnimation = 'blur', animationSpeed = 'normal', eventDate, eventLocation, clientName, studioName, studioWebsite, images, storageUrl: getUrl, coverImageUrl, coverCrop, onEnter, faceSearchAvailable, facePrivacyMode, onFindMyPhotos, lang = 'he', headingFont, bodyFont }: {
  style?: 'mosaic' | 'cinematic' | 'minimal'
  galleryTitle: string
  galleryDescription?: string
  welcomeMessage?: string
  textAnimation?: 'blur' | 'typewriter' | 'slide'
  animationSpeed?: 'slow' | 'normal' | 'fast'
  eventDate?: string
  eventLocation?: string
  clientName: string
  studioName: string
  studioWebsite?: string
  images: GalleryImage[]
  storageUrl: (path: string) => string
  coverImageUrl?: string | null
  coverCrop?: { zoom: number; x: number; y: number } | null
  onEnter: () => void
  faceSearchAvailable: boolean
  facePrivacyMode: 'open' | 'private' | null
  onFindMyPhotos: () => void
  lang?: Lang
  // Photographer-chosen fonts from the Design tab. Applied to the heading
  // (h1) and supporting body text. Undefined = use the global stack.
  headingFont?: string
  bodyFont?: string
}) {
  const wsTxt = t(lang)
  // Initial render must already have animations applied. Otherwise the first
  // paint shows every element at its default style (opacity 1), then the
  // animation flips them to opacity 0 ("from" via fill-mode both), then they
  // fade back in — that's the visible flash. Starting `visible` true means
  // fill-mode both pins each element to opacity 0 during its start delay
  // from frame one.
  const [visible] = useState(true)
  const [entered, setEntered] = useState(false)

  const isPrivate = faceSearchAvailable && facePrivacyMode === 'private'
  const showFindButton = faceSearchAvailable && facePrivacyMode !== null
  const isMinimal = style === 'minimal'
  const isCinematic = style === 'cinematic'

  const handleEnter = () => {
    setEntered(true)
    setTimeout(onEnter, 600)
  }

  // ── Shared content overlay (all styles) ──
  const renderContent = () => (
    <div style={{
      position: 'relative', zIndex: 2, textAlign: 'center',
      padding: '0 24px', maxWidth: isMinimal ? 800 : 680,
    }}>
      {/* Studio name */}
      {studioName && (
        <div style={{ animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) .3s both' : 'none' }}>
          {studioWebsite ? (
            <a href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,.4)', margin: '0 0 20px', fontWeight: 500,
                textDecoration: 'none', transition: 'color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.8)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)' }}
              onClick={e => e.stopPropagation()}
            >{studioName}</a>
          ) : (
            <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', margin: '0 0 20px', fontWeight: 500 }}>
              {studioName}
            </p>
          )}
        </div>
      )}

      {/* Title */}
      <div style={{
        animation: visible
          ? (isCinematic ? 'wcReveal 1.4s cubic-bezier(.16,1,.3,1) .5s both'
            : isMinimal ? 'wcLetterSpace 1.2s cubic-bezier(.16,1,.3,1) .4s both'
            : 'wcFadeUp 1s cubic-bezier(.16,1,.3,1) .5s both')
          : 'none',
      }}>
        <h1 style={{
          fontSize: isMinimal ? 'clamp(40px, 9vw, 88px)' : 'clamp(32px, 7vw, 68px)',
          fontWeight: isMinimal ? 800 : 700, color: '#fff',
          margin: 0,
          lineHeight: isMinimal ? 1.02 : 1.08,
          letterSpacing: isMinimal ? '0.04em' : '-0.025em',
          textShadow: isCinematic ? '0 4px 60px rgba(0,0,0,.7)' : isMinimal ? 'none' : '0 2px 40px rgba(0,0,0,.5)',
          textTransform: isMinimal ? 'uppercase' : 'none',
          fontFamily: headingFont ? `'${headingFont}', inherit` : undefined,
        }}>{galleryTitle}</h1>
      </div>

      {/* Client name */}
      {clientName && (
        <div style={{ animation: visible ? 'wcFadeUp .9s cubic-bezier(.16,1,.3,1) .65s both' : 'none' }}>
          <p style={{
            fontSize: isMinimal ? 'clamp(12px, 1.5vw, 15px)' : 'clamp(14px, 2vw, 19px)',
            color: isMinimal ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.45)',
            margin: isMinimal ? '16px 0 0' : '10px 0 0', fontWeight: 400,
            letterSpacing: isMinimal ? '0.15em' : '0.01em',
            textTransform: isMinimal ? 'uppercase' : 'none',
            fontFamily: bodyFont ? `'${bodyFont}', inherit` : undefined,
          }}>{clientName}</p>
        </div>
      )}

      {/* Welcome message — animated */}
      {welcomeMessage && (() => {
        // Split into tokens: words + line breaks
        const tokens: Array<{ text: string; isBreak: boolean }> = []
        welcomeMessage.split('\n').forEach((line, li) => {
          if (li > 0) tokens.push({ text: '', isBreak: true })
          line.split(' ').filter(Boolean).forEach(w => tokens.push({ text: w, isBreak: false }))
        })
        const wordCount = tokens.filter(t => !t.isBreak).length
        const msgRTL = /[֐-׿؀-ۿ]/.test(welcomeMessage.charAt(0))
        const speedMul = animationSpeed === 'slow' ? 1.5 : animationSpeed === 'fast' ? 0.6 : 1
        const baseDelay = 0.8 * speedMul
        const perWord = Math.min(0.12, 2 / wordCount) * speedMul

        const animKeyframes = {
          blur: `@keyframes wcWordIn { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: blur(0); } }`,
          typewriter: `@keyframes wcWordIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`,
          slide: `@keyframes wcWordIn { from { opacity: 0; transform: translateX(${msgRTL ? '20px' : '-20px'}); } to { opacity: 1; transform: translateX(0); } }`,
        }
        const wordDuration = textAnimation === 'typewriter' ? 0.3 : textAnimation === 'slide' ? 0.5 : 0.4

        return (<>
          <style>{animKeyframes[textAnimation]}</style>
          <div style={{
            margin: '24px auto 0', maxWidth: 520, padding: '0 20px',
            direction: msgRTL ? 'rtl' : 'ltr',
            textAlign: 'center',
          }}>
            <p style={{
              fontSize: 'clamp(15px, 2vw, 20px)',
              color: 'rgba(255,255,255,.7)',
              margin: 0, fontWeight: 400,
              lineHeight: 1.7,
              fontStyle: 'italic',
              letterSpacing: '0.01em',
            }}>
              {(() => {
                let wordIdx = 0
                return tokens.map((token, ti) => {
                  if (token.isBreak) return <br key={`br-${ti}`} />
                  const wi = wordIdx++
                  return (
                    <span key={ti} style={{
                      opacity: 0,
                      animation: visible ? `wcWordIn ${wordDuration}s cubic-bezier(.16,1,.3,1) ${baseDelay + wi * perWord}s both` : 'none',
                    }}>
                      {token.text}{' '}
                    </span>
                  )
                })
              })()}
            </p>
          </div>
        </>)
      })()}

      {/* Event meta */}
      {(eventDate || eventLocation) && (
        <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .8s both' : 'none' }}>
          {/* TODO: a11y — event meta at rgba(.25) is ~1.8:1 contrast on black. Design decision needed: raise opacity or use a larger font size to meet WCAG 3.1.4 for decorative metadata. */}
          <p style={{
            fontSize: 12, color: 'rgba(255,255,255,.25)', margin: '10px 0 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '0.03em',
          }}>
            {eventDate && <span>{eventDate}</span>}
            {eventDate && eventLocation && <span style={{ opacity: .3 }}>{isMinimal ? '|' : '·'}</span>}
            {eventLocation && <span>{eventLocation}</span>}
          </p>
        </div>
      )}

      {galleryDescription && (
        <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .85s both' : 'none' }}>
          {/* TODO: a11y — gallery description at rgba(.22) is ~1.6:1 contrast. Needs design decision: bump opacity to at least .65 for AA compliance, or confirm this text is purely decorative and not load-bearing. */}
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.22)', margin: '8px auto 0', maxWidth: 420 }}>
            {galleryDescription}
          </p>
        </div>
      )}

      {/* Private mode notice */}
      {isPrivate && (
        <div style={{ animation: visible ? 'wcFadeUp .8s cubic-bezier(.16,1,.3,1) .9s both' : 'none', marginTop: 20 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', borderRadius: isMinimal ? 0 : 20,
            background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,.55)" strokeWidth="1.8" style={{ animation: 'wcFloat 2.5s ease-in-out infinite' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontWeight: 400 }}>
              {wsTxt.privacyModeBadge}
            </span>
          </div>
        </div>
      )}

      {/* Buttons — delayed until welcome message is half done */}
      <div style={{
        display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32,
        animation: visible ? `wcFadeUp .9s cubic-bezier(.16,1,.3,1) ${
          welcomeMessage
            ? (() => { const wc = welcomeMessage.split(/\s+/).filter(Boolean).length; return 2.2 + wc * Math.min(0.12, 2 / wc) * 0.6 })()
            : 1
        }s both` : 'none',
      }}>
        {!isPrivate && (
          <button onClick={handleEnter} style={{
            padding: isMinimal ? '14px 48px' : '15px 44px',
            borderRadius: isMinimal ? 0 : 50,
            border: isMinimal ? '1px solid rgba(255,255,255,.25)' : '1px solid rgba(255,255,255,.18)',
            background: isMinimal ? 'transparent' : 'rgba(255,255,255,.07)',
            backdropFilter: isMinimal ? 'none' : 'blur(20px)',
            color: '#fff',
            fontSize: isMinimal ? 11 : 15,
            fontWeight: isMinimal ? 500 : 600, cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: isMinimal ? '0.18em' : '0.01em',
            textTransform: isMinimal ? 'uppercase' as const : 'none' as const,
            transition: 'all .3s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = isMinimal ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.16)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.35)'; e.currentTarget.style.transform = 'scale(1.03)' }}
            onMouseLeave={e => { e.currentTarget.style.background = isMinimal ? 'transparent' : 'rgba(255,255,255,.07)'; e.currentTarget.style.borderColor = isMinimal ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.18)'; e.currentTarget.style.transform = 'scale(1)' }}
          >{wsTxt.viewGallery}</button>
        )}

        {showFindButton && (
          <button onClick={onFindMyPhotos} style={{
            padding: isPrivate ? '16px 48px' : '15px 36px',
            borderRadius: isMinimal ? 0 : 50, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'all .3s',
            display: 'flex', alignItems: 'center', gap: 10,
            animation: isPrivate ? 'wcGlow 3s ease-in-out infinite' : 'none',
            position: 'relative', zIndex: 10,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
            {wsTxt.findMyPhotos}
          </button>
        )}
      </div>
    </div>
  )

  // ── Mosaic background ──
  const renderMosaicBg = () => (
    <>
      <style>{`
        @keyframes wcScroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes wcBgFadeIn { from { opacity: 0; } to { opacity: var(--wc-bg-target, 0.45); } }
        .wc-col { display: flex; flex-direction: column; gap: 2px; }
        .wc-col img {
          width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block;
          opacity: 0; transition: opacity .6s ease;
        }
        .wc-col img.wc-loaded { opacity: 1; }
        /* Reduced-motion: stop the infinite mosaic scroll (WCAG 2.3.3) */
        @media (prefers-reduced-motion: reduce) {
          .wc-col { animation: none !important; }
          .hero__bg { animation: none !important; }
        }
      `}</style>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', gap: 2,
        ['--wc-bg-target' as string]: isPrivate ? 0.06 : 0.45,
        animation: 'wcBgFadeIn 2s ease .2s both',
        filter: isPrivate ? 'blur(40px) saturate(.3)' : 'none',
      }}>
        {(() => {
          const colCount = 6
          const allImgs = images.length > 0 ? images : []
          const shuffle = (arr: typeof images, seed: number) => {
            const a = [...arr]
            for (let i = a.length - 1; i > 0; i--) {
              seed = (seed * 16807 + 0) % 2147483647
              const j = seed % (i + 1)
              ;[a[i], a[j]] = [a[j], a[i]]
            }
            return a
          }
          const columns = Array.from({ length: colCount }, (_, ci) => {
            const col: typeof images = []
            const shuffled = shuffle(allImgs, ci * 7919 + 1)
            const needed = Math.max(12, Math.ceil(allImgs.length / colCount) * 3)
            let lastId = ''
            for (let j = 0; col.length < needed; j++) {
              const img = shuffled[j % shuffled.length]
              if (img.id !== lastId || allImgs.length <= 1) {
                col.push(img)
                lastId = img.id
              }
            }
            return col
          })
          return columns.map((col, ci) => {
            const doubled = [...col, ...col]
            const speed = 40 + (ci % 3) * 15
            const dir = ci % 2 === 0 ? 'normal' : 'reverse'
            return (
              <div key={ci} style={{ flex: 1, overflow: 'hidden' }}>
                <div className="wc-col" style={{
                  animation: `wcScroll ${speed}s linear infinite`,
                  animationDirection: dir,
                }}>
                  {doubled.map((img, i) => (
                    <img
                      key={`${ci}-${i}`}
                      src={getUrl(img.thumbnail_path || img.storage_path)}
                      alt=""
                      onLoad={e => e.currentTarget.classList.add('wc-loaded')}
                    />
                  ))}
                </div>
              </div>
            )
          })
        })()}
      </div>
      {/* Mosaic overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: isPrivate
          ? 'radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, rgba(0,0,0,.88) 100%)'
          : 'radial-gradient(ellipse at center, rgba(0,0,0,.35) 0%, rgba(0,0,0,.78) 100%)',
      }} />
    </>
  )

  // ── Cinematic background ──
  const renderCinematicBg = () => {
    const bgSrc = coverImageUrl || (images.length > 0 ? getUrl(images[0].thumbnail_path || images[0].storage_path) : null)
    return (
      <>
        <style>{`
          @keyframes wcCineZoom { 0% { transform: scale(1.05); } 100% { transform: scale(1.12); } }
          @keyframes wcCineFadeIn { from { opacity: 0; } to { opacity: var(--wc-cine-target, 0.55); } }
          @keyframes wcParticle {
            0% { transform: translateY(0) translateX(0); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(-100vh) translateX(40px); opacity: 0; }
          }
          /* Ken Burns zoom is a looping motion animation — suppress it for
             vestibular safety (WCAG 2.3.3 / prefers-reduced-motion).       */
          @media (prefers-reduced-motion: reduce) {
            [style*="wcCineZoom"] { animation: wcCineFadeIn 2.5s ease .2s both !important; }
          }
        `}</style>
        {bgSrc && (
          <div style={{
            position: 'absolute', inset: '-10%',
            ['--wc-cine-target' as string]: isPrivate ? 0.08 : 0.55,
            filter: isPrivate ? 'blur(50px) saturate(.2)' : 'blur(8px) saturate(1.1)',
            animation: 'wcCineFadeIn 2.5s ease .2s both, wcCineZoom 20s ease-in-out infinite alternate',
          }}>
            {/* Cover image — meaningful alt derived from gallery title so screen
                readers convey context rather than announcing an empty alt.
                The image is decorative when private (blur makes it unrecognisable),
                so alt="" is correct there. */}
            <img
              src={bgSrc}
              alt={isPrivate ? '' : `${galleryTitle} cover photo`}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                ...(coverCrop ? { objectPosition: `${50 + (coverCrop.x || 0)}% ${50 + (coverCrop.y || 0)}%` } : {}),
              }}
            />
          </div>
        )}
        {/* Heavy vignette */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: [
            'radial-gradient(ellipse at center, rgba(0,0,0,.25) 0%, rgba(0,0,0,.85) 100%)',
            'linear-gradient(to bottom, rgba(0,0,0,.3) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.5) 100%)',
          ].join(', '),
        }} />
        {/* Floating particles */}
        {visible && !isPrivate && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${(i * 37 + 13) % 100}%`,
                bottom: '-5%',
                width: i % 3 === 0 ? 2 : 1,
                height: i % 3 === 0 ? 2 : 1,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.4)',
                animation: `wcParticle ${8 + (i % 7) * 2}s linear ${i * 0.7}s infinite`,
              }} />
            ))}
          </div>
        )}
      </>
    )
  }

  // ── Minimal background (pure black + subtle accent lines) ──
  const renderMinimalBg = () => (
    <>
      <style>{`
        @keyframes wcMinLine { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
      `}</style>
      {visible && (
        <>
          <div style={{
            position: 'absolute', top: '38%', left: '10%', right: '10%', height: 1,
            background: 'rgba(255,255,255,.04)', transformOrigin: 'left center',
            animation: 'wcMinLine 1.5s cubic-bezier(.16,1,.3,1) .6s both',
          }} />
          <div style={{
            position: 'absolute', top: '62%', left: '10%', right: '10%', height: 1,
            background: 'rgba(255,255,255,.04)', transformOrigin: 'right center',
            animation: 'wcMinLine 1.5s cubic-bezier(.16,1,.3,1) .8s both',
          }} />
        </>
      )}
    </>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: entered ? 0 : 1, transition: 'opacity .7s ease',
      overflow: 'hidden',
    }}>
      {/* Shared keyframes */}
      <style>{`
        @keyframes wcFadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wcGlow { 0%, 100% { box-shadow: 0 0 24px rgba(99,102,241,.3); } 50% { box-shadow: 0 0 48px rgba(99,102,241,.5), 0 0 80px rgba(99,102,241,.15); } }
        @keyframes wcFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes wcLine { from { left: -30%; } to { left: 130%; } }
        @keyframes wcReveal { from { opacity: 0; transform: translateY(30px) scale(.97); clip-path: inset(100% 0 0 0); } to { opacity: 1; transform: translateY(0) scale(1); clip-path: inset(0 0 0 0); } }
        @keyframes wcLetterSpace { from { opacity: 0; letter-spacing: 0.12em; } to { opacity: 1; letter-spacing: 0.04em; } }
      `}</style>

      {/* Style-specific background */}
      {style === 'mosaic' && renderMosaicBg()}
      {style === 'cinematic' && renderCinematicBg()}
      {style === 'minimal' && renderMinimalBg()}

      {/* Private mode: accent line (all styles) */}
      {isPrivate && visible && (
        <div style={{
          position: 'absolute', top: '50%', width: '20%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,.35), transparent)',
          animation: 'wcLine 3.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* Content */}
      {renderContent()}
    </div>
  )
}
