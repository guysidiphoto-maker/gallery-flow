import { cn } from '@/shared/ui'
import type { GalleryImage } from '@/shared/types'

const MOSAIC_COLUMNS = 6

function seededShuffle(arr: GalleryImage[], seed: number) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647
    const j = seed % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Each column is sized so one un-doubled set already overflows the viewport:
 * the doubled half for the seamless loop then never shows when the animation
 * is paused (iOS Low Power Mode). Capped at 40 tiles for mobile WebKit.
 */
function mosaicColumns(images: GalleryImage[]) {
  return Array.from({ length: MOSAIC_COLUMNS }, (_, ci) => {
    const col: GalleryImage[] = []
    const shuffled = seededShuffle(images, ci * 7919 + 1)
    const estTileH = Math.max(70, (window.innerWidth / MOSAIC_COLUMNS) * (4 / 3))
    const fillCount = Math.ceil((window.innerHeight * 2.2) / estTileH)
    const needed = Math.max(12, Math.min(fillCount, 40))
    let lastId = ''
    for (let j = 0; col.length < needed; j++) {
      const img = shuffled[j % shuffled.length]
      if (img.id !== lastId || images.length <= 1) {
        col.push(img)
        lastId = img.id
      }
    }
    return col
  })
}

export function MosaicBackground({ images, isPrivate, getUrl }: {
  images: GalleryImage[]
  isPrivate: boolean
  getUrl: (path: string) => string
}) {
  return (
    <>
      <div
        className={cn(
          'absolute inset-0 flex animate-[wcBgFadeIn_2s_ease_.2s_both] gap-[2px]',
          isPrivate ? '[--wc-bg-target:0.06] blur-[40px] saturate-[.3]' : '[--wc-bg-target:0.45]',
        )}
      >
        {mosaicColumns(images).map((col, ci) => (
          <div key={ci} className="flex-1 overflow-hidden">
            <div
              className="wc-col flex flex-col gap-[2px]"
              style={{
                animation: `wcScroll ${40 + (ci % 3) * 15}s linear infinite`,
                animationDirection: ci % 2 === 0 ? 'normal' : 'reverse',
              }}
            >
              {[...col, ...col].map((img, i) => (
                <img
                  key={`${ci}-${i}`}
                  className="block aspect-[3/4] w-full object-cover opacity-0 transition-opacity duration-600 ease-[ease] [&.wc-loaded]:opacity-100"
                  src={getUrl(img.thumbnail_path || img.storage_path)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onLoad={e => e.currentTarget.classList.add('wc-loaded')}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={cn('pointer-events-none absolute inset-0', isPrivate ? 'gv-welcome-mosaic-overlay--private' : 'gv-welcome-mosaic-overlay')} />
    </>
  )
}
