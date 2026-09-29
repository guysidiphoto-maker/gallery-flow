import * as THREE from 'three'
import { SAGE, type Disposable, type FocusAt, type PointerRef } from './config'
import { cropUV, textureAspect } from './textures'

export interface FaceRig {
  focus: () => number
  update: (t: number) => void
}

interface RigEnv {
  scene: THREE.Scene
  disposables: Disposable[]
  focusAt: FocusAt
  pointer: PointerRef
  heroY: number
  /** Portrait/narrow viewport: rig sits closer to centre and smaller. */
  narrow: boolean
}

/** Floating selfie framed by sage scan brackets + landmark nodes, beside the faces scene. */
export function buildFaceRig(env: RigEnv, baseX: number, tex: THREE.Texture): FaceRig {
  const { scene, disposables, focusAt, pointer, heroY, narrow } = env
  const group = new THREE.Group()
  const RIG_X = baseX + (narrow ? -0.85 : -2.05), RIG_Y = heroY + (narrow ? 1.05 : 0.9)
  group.position.set(RIG_X, RIG_Y, 1.2)
  group.rotation.z = 0.04
  group.scale.setScalar(narrow ? 0.72 : 1)
  scene.add(group)

  const fade: Array<{ mat: THREE.MeshBasicMaterial; max: number }> = []
  const mk = (mat: THREE.MeshBasicMaterial, max: number) => { disposables.push(mat); fade.push({ mat, max }); return mat }

  // Selfie card: portrait crop of a face from the faces render.
  const tAspect = textureAspect(tex)
  const cw = 0.15, ch = 0.32, u0 = 0.44, v0 = 0.42
  const cardH = 1.5, cardW = cardH * ((cw * tAspect) / ch)
  const cgeo = new THREE.PlaneGeometry(cardW, cardH); cropUV(cgeo, u0, v0, cw, ch)
  disposables.push(cgeo)
  group.add(new THREE.Mesh(cgeo, mk(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0 }), 1)))

  // Scan brackets: four sage L-shapes.
  const hw = cardW / 2 + 0.06, hh = cardH / 2 + 0.06, armL = 0.3, th = 0.032
  const barGeoH = new THREE.PlaneGeometry(armL, th)
  const barGeoV = new THREE.PlaneGeometry(th, armL)
  disposables.push(barGeoH, barGeoV)
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const h = new THREE.Mesh(barGeoH, mk(new THREE.MeshBasicMaterial({ color: SAGE, transparent: true, opacity: 0 }), 0.9))
    h.position.set(sx * (hw - armL / 2), sy * hh, 0.02)
    group.add(h)
    const v = new THREE.Mesh(barGeoV, mk(new THREE.MeshBasicMaterial({ color: SAGE, transparent: true, opacity: 0 }), 0.9))
    v.position.set(sx * hw, sy * (hh - armL / 2), 0.02)
    group.add(v)
  }

  // Landmark nodes (eyes, nose, mouth, chin).
  const nodeGeo = new THREE.CircleGeometry(0.028, 16)
  disposables.push(nodeGeo)
  const nodes: Array<[number, number]> = [[-0.16, 0.3], [0.16, 0.3], [0, 0.08], [-0.12, -0.12], [0.12, -0.12], [0, -0.32]]
  for (const [nx, ny] of nodes) {
    const n = new THREE.Mesh(nodeGeo, mk(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0.9))
    n.position.set(nx, ny, 0.05)
    group.add(n)
  }

  return {
    focus: focusAt(baseX),
    update: (t: number) => {
      const foc = focusAt(baseX)()
      for (const it of fade) it.mat.opacity = it.max * Math.pow(foc, 1.4)
      const p = pointer.current
      group.position.x = RIG_X + p.x * 0.6
      group.position.y = RIG_Y + Math.sin(t * 0.6) * 0.06 - p.y * 0.4
    },
  }
}
