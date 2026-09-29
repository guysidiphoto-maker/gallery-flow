// The product homepage at `/`: a scroll-driven Web-3D story on capable devices, the
// same copy as a static story on reduced-motion / no-WebGL. `three` is lazy-loaded
// so it only downloads when a device actually renders the canvas.

import { lazy, Suspense, useRef } from 'react'
import { signInWithGoogle } from '@/shared/lib/auth'
import '../styles/marketing.css'
import { SCENES } from './scenes'
import { ScrollStorySection } from './ScrollStorySection'
import { HomepagePricing } from './HomepagePricing'
import { HomepageCTA } from './HomepageCTA'
import { HomeHeader } from './HomeHeader'
import { HomeFooter } from './HomeFooter'
import { HeroCTAs } from './HeroCTAs'
import { useDeviceCapability } from './useDeviceCapability'

const Pixflow3DScene = lazy(() => import('./Pixflow3DScene'))

const ROOT = 'mk-root overflow-x-hidden bg-(image:--mk-cream-gradient)'

export function Homepage3D() {
  const storyRef = useRef<HTMLDivElement>(null)
  const { use3D, lite, ready } = useDeviceCapability()

  const start = () => signInWithGoogle()

  // Pre-decision first paint: header + hero copy only (instant LCP, no canvas).
  if (!ready) {
    return (
      <div className={`${ROOT} min-h-screen`}>
        <HomeHeader />
        <ScrollStorySection scene={SCENES[0]}>
          <HeroCTAs />
        </ScrollStorySection>
      </div>
    )
  }

  return (
    <div className={ROOT}>
      {use3D && (
        <Suspense fallback={null}>
          <Pixflow3DScene scenes={SCENES} storyRef={storyRef} lite={lite} />
        </Suspense>
      )}
      <HomeHeader />
      {/* Each 100vh section drives one camera beat; the static path inlines the images. */}
      <div ref={storyRef}>
        {SCENES.map(scene => (
          <ScrollStorySection key={scene.id} scene={scene} image={!use3D}>
            {scene.id === 'hero' ? <HeroCTAs /> : undefined}
          </ScrollStorySection>
        ))}
      </div>
      <HomepagePricing onStart={start} />
      <HomepageCTA onStart={start} />
      <HomeFooter />
    </div>
  )
}
