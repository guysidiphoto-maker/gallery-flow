import * as THREE from 'three'
import { SAGE, SPACING, type Disposable } from './config'
import { rnd } from './textures'

/** Soft sage bokeh discs far behind the filmstrip (atmosphere). */
export function buildBokeh(scene: THREE.Scene, disposables: Disposable[], count: number): THREE.Mesh[] {
  const bokeh: THREE.Mesh[] = []
  const geo = new THREE.CircleGeometry(1, 40)
  disposables.push(geo)
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: SAGE, transparent: true, opacity: 0.05 + (i % 3) * 0.014 })
    disposables.push(mat)
    const m = new THREE.Mesh(geo, mat)
    m.scale.setScalar(0.5 + rnd(i) * 1.4)
    m.position.set((i - 5) * SPACING * 0.6 + (rnd(i + 9) - 0.5) * 4, (rnd(i + 3) - 0.5) * 4.5, -7 - rnd(i + 7) * 3)
    m.userData = { baseX: m.position.x, baseY: m.position.y, phase: i * 1.3 }
    scene.add(m)
    bokeh.push(m)
  }
  return bokeh
}
