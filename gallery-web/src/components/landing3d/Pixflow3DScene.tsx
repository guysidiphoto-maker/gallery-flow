// ─────────────────────────────────────────────────────────────────────────────
// Pixflow3DScene — the cinematic WebGL layer (desktop only).
//
// A fixed, full-viewport, pointer-transparent canvas BEHIND the (centered)
// scroll copy. The camera dollies laterally along a filmstrip of product
// planes; as each reaches centre it rises to focus while neighbours recede.
// Around every hero plane orbits a rich field of small floating photo-cards
// (unique crops of all six product renders) at many depths — foreground cards
// sweep past in strong parallax, background cards drift far behind — so the
// centered text sits in a living 3D space rather than on a flat image.
//
// Everything Three.js creates is disposed on unmount (textures, geometry,
// materials, renderer, context); ScrollTrigger + listeners are torn down.
// `three` is imported lazily by Homepage3D, so it never touches the gallery
// bundle or any non-home route.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Scene as StoryScene } from './scenes'
import { EXTRA_TEXTURES } from './scenes'

gsap.registerPlugin(ScrollTrigger)

const PLANE_H = 2.9          // hero plane height
const HERO_Y = -1.5          // heroes sit LOW so the upper band stays clean for copy
const SPACING = 6.2          // world gap between heroes along X
const CAM_Z = 6.6
const FOV = 42
const CARDS_PER_HERO = 7
const SAGE = 0x9db089

interface Props {
  scenes: StoryScene[]
  storyRef: React.RefObject<HTMLDivElement | null>
  onReady?: () => void
}

// Deterministic pseudo-random in [0,1) from an integer — stable across frames
// so card positions never reflow.
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 13.7) * 43758.5453
  return x - Math.floor(x)
}

function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

// Remap a 1×1 PlaneGeometry's UVs to sample a sub-rectangle of the texture —
// gives each card a distinct "photo" without cloning the shared texture.
function cropUV(geo: THREE.PlaneGeometry, u0: number, v0: number, w: number, h: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  // PlaneGeometry corner order: (0,1) (1,1) (0,0) (1,0)
  uv.setXY(0, u0, v0 + h)
  uv.setXY(1, u0 + w, v0 + h)
  uv.setXY(2, u0, v0)
  uv.setXY(3, u0 + w, v0)
  uv.needsUpdate = true
}

export default function Pixflow3DScene({ scenes, storyRef, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const mount = mountRef.current
    const storyEl = storyRef.current
    if (!mount || !storyEl) return

    let disposed = false
    let raf = 0
    const disposables: Array<{ dispose: () => void }> = []

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 0, CAM_Z)

    // ── Soft-green bokeh depth (atmosphere, far back) ─────────────────────
    const bokeh: THREE.Mesh[] = []
    const bokehGeo = new THREE.CircleGeometry(1, 40)
    disposables.push(bokehGeo)
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: SAGE, transparent: true, opacity: 0.05 + (i % 3) * 0.014 })
      disposables.push(mat)
      const m = new THREE.Mesh(bokehGeo, mat)
      m.scale.setScalar(0.5 + rnd(i) * 1.4)
      m.position.set((i - 5) * SPACING * 0.6 + (rnd(i + 9) - 0.5) * 4, (rnd(i + 3) - 0.5) * 4.5, -7 - rnd(i + 7) * 3)
      m.userData = { baseX: m.position.x, baseY: m.position.y, phase: i * 1.3 }
      scene.add(m)
      bokeh.push(m)
    }

    interface Card { mesh: THREE.Mesh; baseX: number; baseY: number; baseZ: number; phase: number; depth: number; focus: () => number }
    const heroes: Card[] = []
    const cards: Card[] = []

    const focusAt = (baseX: number) => () => {
      const camX = camera.position.x - pointerRef.current.x * 0.4
      return Math.max(0, 1 - Math.abs((baseX - camX) / SPACING))
    }

    const buildScene = (heroTex: THREE.Texture[], poolTex: THREE.Texture[]) => {
      if (disposed) return
      heroTex.forEach((tex, i) => {
        const img = tex.image as HTMLImageElement
        const aspect = img && img.width && img.height ? img.width / img.height : 16 / 9
        const baseX = i * SPACING

        // Hero plane — sits LOW (HERO_Y) so it showcases below the copy band,
        // never behind it. The upper band of the viewport stays clean cream.
        const geo = new THREE.PlaneGeometry(PLANE_H * aspect, PLANE_H)
        disposables.push(geo)
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1 })
        disposables.push(mat)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(baseX, HERO_Y, -0.6)
        scene.add(mesh)
        heroes.push({ mesh, baseX, baseY: HERO_Y, baseZ: -0.6, phase: i * 0.9, depth: 0, focus: focusAt(baseX) })

        // Orbiting floating cards — unique crops of the whole render pool.
        for (let k = 0; k < CARDS_PER_HERO; k++) {
          const seed = i * 100 + k
          const tx = poolTex[(i + k) % poolTex.length]
          const timg = tx.image as HTMLImageElement
          const tAspect = timg && timg.width && timg.height ? timg.width / timg.height : 16 / 9
          const cw = 0.28 + rnd(seed) * 0.12
          const ch = 0.26 + rnd(seed + 1) * 0.12
          const u0 = rnd(seed + 2) * (1 - cw)
          const v0 = rnd(seed + 3) * (1 - ch)
          const cardH = 0.5 + rnd(seed + 4) * 0.4
          const cardW = cardH * ((cw * tAspect) / ch)
          const cgeo = new THREE.PlaneGeometry(cardW, cardH)
          cropUV(cgeo, u0, v0, cw, ch)
          disposables.push(cgeo)
          const cmat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0 })
          disposables.push(cmat)
          const cm = new THREE.Mesh(cgeo, cmat)
          // Scatter around the LOWER product zone (never up in the copy band):
          // wide horizontal spread, vertical biased to/below centre.
          const angle = rnd(seed + 5) * Math.PI * 2
          const radius = 2.4 + rnd(seed + 6) * 1.9
          const foreground = k % 2 === 0
          const depth = foreground ? 0.8 + rnd(seed + 7) * 1.6 : -1.4 - rnd(seed + 7) * 1.8
          const ox = Math.cos(angle) * radius * 1.35
          const oy = HERO_Y + (rnd(seed + 9) - 0.32) * 2.5
          cm.position.set(baseX + ox, oy, depth)
          cm.rotation.z = (rnd(seed + 8) - 0.5) * 0.25
          scene.add(cm)
          cards.push({ mesh: cm, baseX: baseX + ox, baseY: oy, baseZ: depth, phase: seed, depth, focus: focusAt(baseX) })
        }
      })
      onReady?.()
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
      .catch(() => { onReady?.() })

    // ── ScrollTrigger: scroll → 0..1 progress (section i centred at i/(N-1)) ─
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize, { passive: true })

    const clock = new THREE.Clock()
    let camX = 0
    const N = scenes.length
    const render = () => {
      if (disposed) return
      raf = requestAnimationFrame(render)
      const t = clock.getElapsedTime()
      const p = pointerRef.current

      const targetX = progressRef.current * (N - 1) * SPACING
      camX += (targetX - camX) * 0.08
      camera.position.x = camX + p.x * 0.4
      camera.position.y = -p.y * 0.26
      // Look straight ahead (no tilt/keystone) so the low product stays in the
      // bottom band and the top band stays clear for the copy.
      camera.lookAt(camX, camera.position.y, 0)

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
    <div
      ref={mountRef}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(120% 120% at 50% 0%, #F6F3ED 0%, #F2EFE9 46%, #E9EBE0 100%)',
      }}
    />
  )
}
