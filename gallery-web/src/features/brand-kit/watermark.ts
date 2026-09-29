import type { BrandKitWatermarkPosition } from './brandKit'

export const WATERMARK_POSITIONS: BrandKitWatermarkPosition[] = [
  'tl', 'tc', 'tr',
  'cl', 'cc', 'cr',
  'bl', 'bc', 'br',
]

export const WATERMARK_LABELS: Record<BrandKitWatermarkPosition, string> = {
  tl: 'שמאל למעלה', tc: 'מרכז למעלה', tr: 'ימין למעלה',
  cl: 'שמאל מרכז',  cc: 'מרכז',        cr: 'ימין מרכז',
  bl: 'שמאל למטה',  bc: 'מרכז למטה',   br: 'ימין למטה',
}

export const WATERMARK_SOURCES = [
  { id: 'logo' as const,        label: 'לוגו ראשי' },
  { id: 'studio_name' as const, label: 'שם הסטודיו (מהחתימה)' },
  { id: 'custom_text' as const, label: 'טקסט חופשי' },
]

// Public placeholder so the preview works before any gallery content exists.
export const SAMPLE_PHOTO_URL =
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=900&q=70&auto=format&fit=crop'

// Positions are physical (left/right of the photo), not reading-direction relative.
// Full class strings so Tailwind can see them.
const OVERLAY_ROW = { t: 'top-3.5', c: 'top-1/2 -translate-y-1/2', b: 'bottom-3.5' } as const
const OVERLAY_COL = { l: 'left-3.5', c: 'left-1/2 -translate-x-1/2', r: 'right-3.5' } as const
const DOT_ROW = { t: 'top-1', c: 'top-1/2 -translate-y-1/2', b: 'bottom-1' } as const
const DOT_COL = { l: 'left-1', c: 'left-1/2 -translate-x-1/2', r: 'right-1' } as const

type Row = keyof typeof OVERLAY_ROW
type Col = keyof typeof OVERLAY_COL

function split(p: BrandKitWatermarkPosition): [Row, Col] {
  return [p[0] as Row, p[1] as Col]
}

/** Absolute-position classes for the watermark inside the preview photo. */
export function overlayPositionClass(p: BrandKitWatermarkPosition): string {
  const [row, col] = split(p)
  return `${OVERLAY_ROW[row]} ${OVERLAY_COL[col]}`
}

/** Absolute-position classes for the tiny dot inside a position-picker square. */
export function positionDotClass(p: BrandKitWatermarkPosition): string {
  const [row, col] = split(p)
  return `${DOT_ROW[row]} ${DOT_COL[col]}`
}
