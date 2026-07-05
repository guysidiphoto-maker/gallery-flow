// ─────────────────────────────────────────────────────────────────────────────
// Pixflow3DScene — the cinematic WebGL layer (desktop only).
//
// A fixed, full-viewport, pointer-transparent canvas sitting BEHIND the scroll
// story. The camera dollies laterally along a filmstrip of product planes; as
// each plane reaches centre it rises to full focus while its neighbours recede
// and dim. GSAP ScrollTrigger scrubs the scroll position into a 0→1 progress
// that drives the camera; a rAF loop adds idle float, mouse parallax, and the
// soft-green bokeh depth.
//
// Everything Three.js creates here is disposed on unmount (textures, geometry,
// materials, renderer, context) and the ScrollTrigger + listeners are torn
// down — no leaks when React swaps the route.
//
// This module is imported lazily by Homepage3D, so `three` never lands in the
// gallery-viewer bundle nor on any non-home route.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Scene as StoryScene } from './scenes'

gsap.registerPlugin(ScrollTrigger)

// World layout — a plane every SPACING units along X; camera SPACING tuned so
// only one plane is prominent at a time.
const PLANE_H = 3.15
const SPACING = 6.6
const CAM_Z = 6.4
const FOV = 42

interface Props {
  scenes: StoryScene[]
  /** The tall scroll container whose progress drives the camera. */
  storyRef: React.RefObject<HTMLDivElement | null>
  /** Fired once textures are loaded and the first frame is drawn. */
  onReady?: () => void
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

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0) // transparent — CSS cream gradient shows through
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 0, CAM_Z)

    // ── Soft-green bokeh depth (atmosphere, far back) ─────────────────────
    // A handful of translucent sage circles drifting in parallax. Gives the
    // "glass depth" without clutter. MeshBasicMaterial = unlit, exact colour.
    const bokeh: THREE.Mesh[] = []
    const bokehGeo = new THREE.CircleGeometry(1, 40)
    disposables.push(bokehGeo)
    const SAGE = 0x9db089
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: SAGE, transparent: true, opacity: 0.06 + (i % 3) * 0.015 })
      disposables.push(mat)
      const m = new THREE.Mesh(bokehGeo, mat)
      const r = 0.6 + (i % 4) * 0.5
      m.scale.setScalar(r)
      m.position.set(
        (i - 3) * SPACING * 0.7 + (i % 2 ? 2 : -2),
        (i % 2 ? 1.6 : -1.5) + (i % 3) * 0.3,
        -6 - (i % 3),
      )
      m.userData.baseX = m.position.x
      m.userData.baseY = m.position.y
      m.userData.phase = i * 1.3
      scene.add(m)
      bokeh.push(m)
    }

    // ── Hero planes (filmstrip) + small floating accent cards ─────────────
    interface Card { mesh: THREE.Mesh; baseX: number; baseY: number; baseZ: number; phase: number; offX: number; offY: number; focusFn: () => number }
    const heroes: Card[] = []
    const accents: Card[] = []

    const buildPlanes = (textures: THREE.Texture[]) => {
      if (disposed) return
      textures.forEach((tex, i) => {
        const img = tex.image as HTMLImageElement
        const aspect = img && img.width && img.height ? img.width / img.height : 16 / 9
        const w = PLANE_H * aspect
        const geo = new THREE.PlaneGeometry(w, PLANE_H)
        disposables.push(geo)
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1 })
        disposables.push(mat)
        const mesh = new THREE.Mesh(geo, mat)
        const baseX = i * SPACING
        mesh.position.set(baseX, 0, 0)
        scene.add(mesh)
        const focusFn = () => {
          const camX = camera.position.x - pointerRef.current.x * 0.35 // ignore parallax for focus
          const d = (baseX - camX) / SPACING
          return Math.max(0, 1 - Math.abs(d))
        }
        heroes.push({ mesh, baseX, baseY: 0, baseZ: 0, phase: i * 0.9, offX: 0, offY: 0, focusFn })

        // Two small photo-card planes flanking each hero (reuse the texture at
        // small scale) → parallax depth that belongs to the same shot.
        const smallH = PLANE_H * 0.34
        for (let k = 0; k < 2; k++) {
          const sgeo = new THREE.PlaneGeometry(smallH * aspect, smallH)
          disposables.push(sgeo)
          const smat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 })
          disposables.push(smat)
          const sm = new THREE.Mesh(sgeo, smat)
          const offX = (k === 0 ? -1 : 1) * (w * 0.42 + 0.6)
          const offY = (k === 0 ? 1 : -1) * (PLANE_H * 0.28)
          const baseZ = 1.1 + k * 0.4
          sm.position.set(baseX + offX, offY, baseZ)
          sm.rotation.z = (k === 0 ? 1 : -1) * 0.05
          scene.add(sm)
          accents.push({ mesh: sm, baseX: baseX + offX, baseY: offY, baseZ, phase: i * 0.9 + k * 2.1, offX, offY, focusFn })
        }
      })
      onReady?.()
    }

    // ── Load textures, then build ─────────────────────────────────────────
    const loader = new THREE.TextureLoader()
    const maxAniso = renderer.capabilities.getMaxAnisotropy()
    Promise.all(scenes.map(s => loadTexture(loader, s.img)))
      .then(texes => {
        texes.forEach(t => { t.anisotropy = maxAniso; disposables.push(t) })
        buildPlanes(texes)
      })
      .catch(() => { onReady?.() /* let the HTML overlay carry the page */ })

    // ── ScrollTrigger: scroll position → 0..1 progress ────────────────────
    // start/end top-top→bottom-bottom makes section i land dead-centre exactly
    // at progress i/(N-1), so camera.x = progress*(N-1)*SPACING centres plane i.
    const st = ScrollTrigger.create({
      trigger: storyEl,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: self => { progressRef.current = self.progress },
    })

    // ── Pointer parallax ──────────────────────────────────────────────────
    const onPointer = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize, { passive: true })

    // ── Render loop ───────────────────────────────────────────────────────
    const clock = new THREE.Clock()
    let camX = 0
    const N = scenes.length
    const render = () => {
      if (disposed) return
      raf = requestAnimationFrame(render)
      const t = clock.getElapsedTime()
      const p = pointerRef.current

      // Camera dolly: ease toward the scroll target, add gentle mouse parallax.
      const targetX = progressRef.current * (N - 1) * SPACING
      camX += (targetX - camX) * 0.08
      camera.position.x = camX + p.x * 0.35
      camera.position.y = -p.y * 0.22
      camera.lookAt(camX, 0, 0)

      // Hero planes: focus-driven scale / recede / turn + idle float.
      for (const h of heroes) {
        const f = h.focusFn()
        const mat = h.mesh.material as THREE.MeshBasicMaterial
        mat.opacity = 0.16 + 0.84 * Math.pow(f, 1.4)
        const s = 0.84 + 0.16 * f
        h.mesh.scale.setScalar(s)
        const dNorm = (h.baseX - camX) / SPACING
        h.mesh.position.z = -1.5 * (1 - f)
        h.mesh.position.y = Math.sin(t * 0.6 + h.phase) * 0.06 * (0.4 + f)
        h.mesh.rotation.y = dNorm * 0.5
        h.mesh.rotation.x = Math.sin(t * 0.4 + h.phase) * 0.015
      }
      // Accent cards: only visible near their hero's focus; extra parallax.
      for (const a of accents) {
        const f = a.focusFn()
        const mat = a.mesh.material as THREE.MeshBasicMaterial
        mat.opacity = 0.9 * Math.pow(f, 2.2)
        a.mesh.position.x = a.baseX + p.x * 0.5 * a.baseZ
        a.mesh.position.y = a.baseY + Math.sin(t * 0.8 + a.phase) * 0.08 - p.y * 0.3 * a.baseZ
      }
      // Bokeh drift + parallax.
      for (let i = 0; i < bokeh.length; i++) {
        const b = bokeh[i]
        b.position.x = b.userData.baseX + Math.sin(t * 0.15 + b.userData.phase) * 0.4 + p.x * 1.2
        b.position.y = b.userData.baseY + Math.cos(t * 0.12 + b.userData.phase) * 0.3 - p.y * 0.8
      }

      renderer.render(scene, camera)
    }
    render()

    // ── Teardown ──────────────────────────────────────────────────────────
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      st.kill()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', onResize)
      for (const d of disposables) {
        try { d.dispose() } catch { /* noop */ }
      }
      renderer.dispose()
      renderer.forceContextLoss()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    // scenes/storyRef are stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={mountRef}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        // Cream → soft-green world background the transparent canvas floats on.
        background: 'radial-gradient(120% 120% at 50% 0%, #F6F3ED 0%, #F2EFE9 46%, #E9EBE0 100%)',
      }}
    />
  )
}
