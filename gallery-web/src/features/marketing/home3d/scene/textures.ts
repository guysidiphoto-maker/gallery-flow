import * as THREE from 'three'

/** Deterministic pseudo-random in [0,1) — stable across frames so cards never reflow. */
export function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 13.7) * 43758.5453
  return x - Math.floor(x)
}

export function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture> {
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

/** Aspect of a loaded texture's image (16:9 until it has dimensions). */
export function textureAspect(tex: THREE.Texture): number {
  const img = tex.image as HTMLImageElement
  return img && img.width && img.height ? img.width / img.height : 16 / 9
}

/** Remap a plane's UVs to a sub-rectangle, so cards show distinct crops of a shared texture. */
export function cropUV(geo: THREE.PlaneGeometry, u0: number, v0: number, w: number, h: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  // PlaneGeometry corner order: (0,1) (1,1) (0,0) (1,0)
  uv.setXY(0, u0, v0 + h)
  uv.setXY(1, u0 + w, v0 + h)
  uv.setXY(2, u0, v0)
  uv.setXY(3, u0 + w, v0)
  uv.needsUpdate = true
}

/** Soft radial sprite baked to a canvas (centre → transparent edge). */
export function makeRadialTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, col] of stops) g.addColorStop(o, col)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Warm studio glow and the soft lift shadow behind each product plane.
export const GLOW_STOPS: Array<[number, string]> = [[0, 'rgba(255,247,233,1)'], [0.42, 'rgba(255,244,224,0.5)'], [1, 'rgba(255,244,224,0)']]
export const LIFT_STOPS: Array<[number, string]> = [[0, 'rgba(58,58,50,0.5)'], [0.5, 'rgba(58,58,50,0.2)'], [1, 'rgba(58,58,50,0)']]
