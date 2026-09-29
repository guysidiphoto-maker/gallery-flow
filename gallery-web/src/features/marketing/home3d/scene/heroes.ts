import * as THREE from 'three'
import { PLANE_H, SPACING, type Disposable, type FloatingCard, type FocusAt, type HeroFx } from './config'
import { cropUV, rnd, textureAspect } from './textures'

interface HeroEnv {
  scene: THREE.Scene
  disposables: Disposable[]
  focusAt: FocusAt
  heroY: number
  cardsPerHero: number
  glowTex: THREE.Texture
  liftTex: THREE.Texture
}

interface Built {
  heroes: FloatingCard[]
  cards: FloatingCard[]
  heroFx: HeroFx[]
}

/** Product planes along the filmstrip, each with a lift halo, a studio glow and orbiting photo cards. */
export function buildHeroes(env: HeroEnv, heroTex: THREE.Texture[], poolTex: THREE.Texture[]): Built {
  const { scene, disposables, focusAt, heroY: HY, cardsPerHero, glowTex, liftTex } = env
  const out: Built = { heroes: [], cards: [], heroFx: [] }

  heroTex.forEach((tex, i) => {
    const aspect = textureAspect(tex)
    const baseX = i * SPACING

    // Hero plane sits low so it showcases below the copy band, never behind it.
    const geo = new THREE.PlaneGeometry(PLANE_H * aspect, PLANE_H)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1 })
    disposables.push(geo, mat)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(baseX, HY, -0.6)
    scene.add(mesh)
    out.heroes.push({ mesh, baseX, baseY: HY, baseZ: -0.6, phase: i * 0.9, depth: 0, focus: focusAt(baseX) })

    // Lift halo separates the product from the cream; additive glow blooms with focus.
    const liftGeo = new THREE.PlaneGeometry(PLANE_H * aspect * 1.55, PLANE_H * 1.55)
    const liftMat = new THREE.MeshBasicMaterial({ map: liftTex, transparent: true, opacity: 0, depthWrite: false })
    disposables.push(liftGeo, liftMat)
    const lift = new THREE.Mesh(liftGeo, liftMat)
    lift.position.set(baseX, HY - 0.12, -0.9)
    scene.add(lift)

    const glowGeo = new THREE.PlaneGeometry(PLANE_H * aspect * 2.2, PLANE_H * 2.2)
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    disposables.push(glowGeo, glowMat)
    const glow = new THREE.Mesh(glowGeo, glowMat)
    glow.position.set(baseX, HY + 0.5, -2.4)
    scene.add(glow)

    out.heroFx.push({ lift, glow, focus: focusAt(baseX) })

    for (let k = 0; k < cardsPerHero; k++) {
      const seed = i * 100 + k
      const tx = poolTex[(i + k) % poolTex.length]
      const tAspect = textureAspect(tx)
      const cw = 0.28 + rnd(seed) * 0.12
      const ch = 0.26 + rnd(seed + 1) * 0.12
      const u0 = rnd(seed + 2) * (1 - cw)
      const v0 = rnd(seed + 3) * (1 - ch)
      const cardH = 0.5 + rnd(seed + 4) * 0.4
      const cardW = cardH * ((cw * tAspect) / ch)
      const cgeo = new THREE.PlaneGeometry(cardW, cardH)
      cropUV(cgeo, u0, v0, cw, ch)
      const cmat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0 })
      disposables.push(cgeo, cmat)
      const cm = new THREE.Mesh(cgeo, cmat)
      // Scatter around the lower product zone (never up in the copy band).
      const angle = rnd(seed + 5) * Math.PI * 2
      const radius = 2.4 + rnd(seed + 6) * 1.9
      const foreground = k % 2 === 0
      const depth = foreground ? 0.8 + rnd(seed + 7) * 1.6 : -1.4 - rnd(seed + 7) * 1.8
      const ox = Math.cos(angle) * radius * 1.35
      const oy = HY + (rnd(seed + 9) - 0.32) * 2.5
      cm.position.set(baseX + ox, oy, depth)
      cm.rotation.z = (rnd(seed + 8) - 0.5) * 0.25
      scene.add(cm)
      out.cards.push({ mesh: cm, baseX: baseX + ox, baseY: oy, baseZ: depth, phase: seed, depth, focus: focusAt(baseX) })
    }
  })

  return out
}
