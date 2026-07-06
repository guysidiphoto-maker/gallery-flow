// ─────────────────────────────────────────────────────────────────────────────
// Homepage3D — the Pixflow product homepage rendered at `/`.
//
// A cinematic, scroll-driven Web-3D experience on capable desktops; a graceful,
// same-copy static story on phones / tablets / reduced-motion / no-WebGL. The
// device decision lives in useDeviceCapability; this shell just wires the header,
// the story (3D overlay OR static cards), the final CTA, and the footer.
//
// The Three.js scene is a lazy import, so `three` only downloads when a device
// actually renders the canvas — never on mobile, never on other routes.
//
// Isolated by design: it renders only at `/` (see main.tsx Router) and touches
// no gallery / dashboard / auth / backend code.
// ─────────────────────────────────────────────────────────────────────────────

import { lazy, Suspense, useRef } from 'react'
import { signInWithGoogle } from '../../lib/auth'
import { Button } from '../ui'
import { color, text, font, space } from '../../theme'
import { SCENES } from './scenes'
import { ScrollStorySection } from './ScrollStorySection'
import { HomepagePricing } from './HomepagePricing'
import { HomepageCTA } from './HomepageCTA'
import { useDeviceCapability } from './useDeviceCapability'

const Pixflow3DScene = lazy(() => import('./Pixflow3DScene'))

const CREAM_BG = 'radial-gradient(120% 120% at 50% 0%, #F6F3ED 0%, #F2EFE9 46%, #E9EBE0 100%)'

function HeroCTAs() {
  return (
    <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
      <Button size="lg" onClick={() => signInWithGoogle()} style={{ padding: '15px 34px', fontSize: 16 }}>
        התחילו עכשיו
      </Button>
      <Button variant="secondary" size="lg" onClick={() => { window.location.href = '/demo' }}>
        צפו בדמו
      </Button>
    </div>
  )
}

function Header() {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px clamp(20px, 6vw, 96px)',
        background: 'rgba(246,243,237,.72)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      <a href="/" style={{ ...text.h3, fontFamily: font.display, color: color.ink, textDecoration: 'none', fontWeight: 700 }}>
        pixflow
      </a>
      <nav style={{ display: 'flex', alignItems: 'center', gap: space[5] }}>
        <a href="#upload" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }} className="pf-hide-sm">איך זה עובד</a>
        <a href="#manage" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }} className="pf-hide-sm">לצלמים</a>
        <a href="/demo" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }} className="pf-hide-sm">דמו</a>
        <Button size="sm" onClick={() => signInWithGoogle()}>התחילו עכשיו</Button>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer style={{ position: 'relative', zIndex: 2, background: color.bg, borderTop: `1px solid ${color.border}`, padding: `${space[6]}px clamp(20px, 6vw, 96px)` }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: space[4], alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...text.h3, fontFamily: font.display, color: color.ink }}>pixflow</span>
        <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap' }}>
          <a href="/pricing" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>מחירים</a>
          <a href="/terms" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>תנאי שימוש</a>
          <a href="/privacy" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>פרטיות</a>
          <a href="mailto:support@pixflow-ai.com" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>צור קשר</a>
        </div>
      </div>
    </footer>
  )
}

// Injected once: hide secondary nav links on narrow screens; guard the page
// against horizontal overflow regardless of path.
const PAGE_CSS = `
  .pf-home-3d { overflow-x: hidden; }
  @media (max-width: 640px) { .pf-hide-sm { display: none !important; } }
`

export function Homepage3D() {
  const storyRef = useRef<HTMLDivElement>(null)
  const { use3D, lite, ready } = useDeviceCapability()

  const start = () => signInWithGoogle()

  // First paint (pre-decision): header + hero copy + CTA over cream. Instant
  // LCP, no wasted image loads, no canvas — then we upgrade once `ready`.
  if (!ready) {
    return (
      <div className="pf-home-3d" style={{ background: CREAM_BG, minHeight: '100vh' }}>
        <style>{PAGE_CSS}</style>
        <Header />
        <ScrollStorySection scene={SCENES[0]}>
          <HeroCTAs />
        </ScrollStorySection>
      </div>
    )
  }

  if (use3D) {
    return (
      <div className="pf-home-3d" style={{ background: CREAM_BG }}>
        <style>{PAGE_CSS}</style>
        <Suspense fallback={null}>
          <Pixflow3DScene scenes={SCENES} storyRef={storyRef} lite={lite} />
        </Suspense>
        <Header />
        {/* Tall trigger: each 100vh section drives one camera beat. */}
        <div ref={storyRef}>
          {SCENES.map(scene => (
            <ScrollStorySection key={scene.id} scene={scene}>
              {scene.id === 'hero' ? <HeroCTAs /> : undefined}
            </ScrollStorySection>
          ))}
        </div>
        <HomepagePricing onStart={start} />
        <HomepageCTA onStart={start} />
        <Footer />
      </div>
    )
  }

  // Static / mobile path: same copy + assets, images inline, cream background.
  return (
    <div className="pf-home-3d" style={{ background: CREAM_BG }}>
      <style>{PAGE_CSS}</style>
      <Header />
      <div ref={storyRef}>
        {SCENES.map(scene => (
          <ScrollStorySection key={scene.id} scene={scene} image>
            {scene.id === 'hero' ? <HeroCTAs /> : undefined}
          </ScrollStorySection>
        ))}
      </div>
      <HomepagePricing onStart={start} />
      <HomepageCTA onStart={start} />
      <Footer />
    </div>
  )
}

export default Homepage3D
