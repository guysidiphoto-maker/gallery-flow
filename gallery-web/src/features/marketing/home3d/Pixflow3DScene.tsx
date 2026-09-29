// Cinematic WebGL layer behind the homepage story: a fixed, pointer-transparent canvas
// where the camera dollies along a filmstrip of product planes as the user scrolls.
// Lazy-imported by Homepage3D; everything Three.js creates is disposed on unmount.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Scene as StoryScene } from './scenes'
import { EXTRA_TEXTURES } from './scenes'
import {
  CAM_Z, CARDS_PER_HERO, FOV, HERO_Y, NARROW_ASPECT, NARROW_CAM_Z, SPACING,
  type Disposable, type FloatingCard, type HeroFx,
} from './scene/config'
import { GLOW_STOPS, LIFT_STOPS, loadTexture, makeRadialTexture } from './scene/textures'
import { buildBokeh } from './scene/bokeh'
import { buildHeroes } from './scene/heroes'
import { buildFaceRig, type FaceRig } from './scene/faceRig'
import { SceneOverlays } from './scene/SceneOverlays'

gsap.registerPlugin(ScrollTrigger)

interface Props {
  scenes: StoryScene[]
  storyRef: React.RefObject<HTMLDivElement | null>
  /** Lighter mode for mobile/low-power: fewer cards, lower DPR, lower product. */
  lite?: boolean
}

export default function Pixflow3DScene({ scenes, storyRef, lite = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const mount = mountRef.current
    const storyEl = storyRef.current
    if (!mount || !storyEl) return

    let disposed = false
    let raf = 0
    const disposables: Disposable[] = []

    // Portrait / narrow viewports pull the camera back; recomputed on resize.
    const isNarrow = () => window.innerWidth / window.innerHeight < NARROW_ASPECT
    const baseCamZFor = () => (isNarrow() ? NARROW_CAM_Z : CAM_Z)
    let baseCamZ = baseCamZFor()
    const cardsPerHero = lite ? 3 : CARDS_PER_HERO
    const dprCap = lite ? 1.5 : 2
    // Lower product on mobile leaves a clean band for the taller copy.
    const HY = lite ? -2.0 : HERO_Y

    const renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '0' })
    mount.appendChild(renderer.domElement)

    const glowTex = makeRadialTexture(GLOW_STOPS)
    const liftTex = makeRadialTexture(LIFT_STOPS)
    disposables.push(glowTex, liftTex)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 0, baseCamZ)

    const bokeh = buildBokeh(scene, disposables, lite ? 6 : 10)
    const heroes: FloatingCard[] = []
    const cards: FloatingCard[] = []
    const heroFx: HeroFx[] = []
    let faceRig: FaceRig | null = null

    const focusAt = (baseX: number) => () => {
      const camX = camera.position.x - pointerRef.current.x * 0.4
      return Math.max(0, 1 - Math.abs((baseX - camX) / SPACING))
    }

    const buildScene = (heroTex: THREE.Texture[], poolTex: THREE.Texture[]) => {
      if (disposed) return
      const built = buildHeroes({ scene, disposables, focusAt, heroY: HY, cardsPerHero, glowTex, liftTex }, heroTex, poolTex)
      heroes.push(...built.heroes)
      cards.push(...built.cards)
      heroFx.push(...built.heroFx)
      const facesIdx = scenes.findIndex(s => s.id === 'faces')
      if (facesIdx >= 0) {
        faceRig = buildFaceRig(
          { scene, disposables, focusAt, pointer: pointerRef, heroY: HY, narrow: isNarrow() },
          facesIdx * SPACING, heroTex[facesIdx],
        )
      }
    }

    const loader = new THREE.TextureLoader()
    const maxAniso = renderer.capabilities.getMaxAnisotropy()
    const heroUrls = scenes.map(s => s.img)
    const poolUrls = [...heroUrls, ...EXTRA_TEXTURES]
    Promise.all(poolUrls.map(u => loadTexture(loader, u)))
      .then(all => {
        all.forEach(t => { t.anisotropy = maxAniso; disposables.push(t) })
        buildScene(all.slice(0, heroUrls.length), all)
      })
      .catch(() => {})

    // Scroll → 0..1 progress (section i centred at i/(N-1)).
    const st = ScrollTrigger.create({
      trigger: storyEl,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: self => { progressRef.current = self.progress },
    })

    const onPointer = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap))
      renderer.setSize(window.innerWidth, window.innerHeight)
      baseCamZ = baseCamZFor()
    }
    window.addEventListener('resize', onResize, { passive: true })

    const clock = new THREE.Clock()
    let camX = 0
    const N = scenes.length
    const render = () => {
      if (disposed) return
      raf = requestAnimationFrame(render)
      // Skip GPU work while hidden or once the opaque pricing/CTA cover the canvas.
      if (document.hidden) return
      if (window.scrollY > storyEl.offsetTop + storyEl.offsetHeight) return
      const t = clock.getElapsedTime()
      const p = pointerRef.current

      const targetX = progressRef.current * (N - 1) * SPACING
      camX += (targetX - camX) * 0.07
      // Gentle idle drift keeps the scene alive between inputs.
      camera.position.x = camX + p.x * 0.4 + Math.sin(t * 0.12) * 0.05
      camera.position.y = -p.y * 0.26 + Math.sin(t * 0.17) * 0.03

      let focusMax = 0
      for (const fx of heroFx) {
        const f = fx.focus()
        focusMax = Math.max(focusMax, f)
        ;(fx.lift.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.pow(f, 1.6)
        ;(fx.glow.material as THREE.MeshBasicMaterial).opacity = 0.26 * Math.pow(f, 1.4)
      }
      camera.position.z = baseCamZ - 0.5 * focusMax
      // Straight ahead (no keystone) so the product stays in the bottom band.
      camera.lookAt(camX, camera.position.y, 0)

      if (faceRig) faceRig.update(t)

      for (const h of heroes) {
        const f = h.focus()
        const mat = h.mesh.material as THREE.MeshBasicMaterial
        mat.opacity = 0.12 + 0.88 * Math.pow(f, 1.5)
        h.mesh.scale.setScalar(0.86 + 0.14 * f)
        const dNorm = (h.baseX - camX) / SPACING
        h.mesh.position.z = -0.6 - 1.8 * (1 - f)
        h.mesh.position.y = h.baseY + Math.sin(t * 0.6 + h.phase) * 0.06 * (0.4 + f)
        h.mesh.rotation.y = dNorm * 0.5
        h.mesh.rotation.x = Math.sin(t * 0.4 + h.phase) * 0.014
      }

      for (const c of cards) {
        const f = c.focus()
        const mat = c.mesh.material as THREE.MeshBasicMaterial
        // Foreground cards a touch more transparent so they never fight the copy.
        const cap = c.depth > 0 ? 0.62 : 0.8
        mat.opacity = cap * Math.pow(f, 1.8)
        const par = 0.5 + c.depth * 0.25
        c.mesh.position.x = c.baseX + p.x * par
        c.mesh.position.y = c.baseY + Math.sin(t * 0.7 + c.phase) * 0.12 - p.y * par * 0.7
        c.mesh.rotation.y = (c.baseX - camX) / SPACING * 0.35
      }

      for (const b of bokeh) {
        b.position.x = b.userData.baseX + Math.sin(t * 0.15 + b.userData.phase) * 0.4 + p.x * 1.4
        b.position.y = b.userData.baseY + Math.cos(t * 0.12 + b.userData.phase) * 0.3 - p.y * 0.9
      }

      renderer.render(scene, camera)
    }
    render()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      st.kill()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', onResize)
      for (const d of disposables) { try { d.dispose() } catch { /* noop */ } }
      renderer.dispose()
      renderer.forceContextLoss()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div ref={mountRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-(image:--mk-cream-gradient)" />
      <SceneOverlays />
    </>
  )
}
