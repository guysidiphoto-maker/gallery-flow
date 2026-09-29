import { cn } from '@/shared/ui'
import type { BrandKitWatermarkPosition } from '../brandKit'
import { SAMPLE_PHOTO_URL, overlayPositionClass } from '../watermark'
import { FieldLabel } from './FieldLabel'

/** The chosen watermark over a sample photo; opacity/size are live values. */
export function WatermarkPreview({ enabled, position, opacity, scale, contrastAware, logoUrl, text }: {
  enabled: boolean
  position: BrandKitWatermarkPosition
  opacity: number
  scale: number
  contrastAware: boolean
  /** Set when the source is the logo and a logo exists; otherwise `text` is shown. */
  logoUrl: string | null
  text: string
}) {
  return (
    <div>
      <FieldLabel>תצוגה מקדימה</FieldLabel>
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-hair border border-line bg-cover bg-center"
        style={{ backgroundImage: `url(${SAMPLE_PHOTO_URL})` }}
      >
        {enabled && (
          <div
            className={cn(
              'pointer-events-none absolute font-semibold tracking-[0.1em] text-white',
              contrastAware && '[text-shadow:0_1px_2px_color-mix(in_srgb,var(--color-black)_50%,transparent)]',
              overlayPositionClass(position),
            )}
            style={{ opacity: opacity / 100, fontSize: `${Math.max(10, scale * 1.2)}px` }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-auto brightness-0 invert"
                style={{ width: `${scale * 6}px` }}
              />
            ) : (
              <span>{text || 'STUDIO'}</span>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 text-[11px] leading-normal text-muted">
        התצוגה מדגימה את התוצאה הסופית על תמונת גלריה אמיתית.
      </div>
    </div>
  )
}
