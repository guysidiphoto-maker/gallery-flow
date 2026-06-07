// Read pixel dimensions straight from an image file's header — no full decode,
// no extra disk read (we parse the same buffer we already read for upload).
// Supports JPEG (SOF marker) and PNG (IHDR). Returns null for anything else
// (the viewer then falls back to measure-on-load). Orientation is assumed
// baked into the pixels (true for Lightroom/camera exports), which is the
// photographer's workflow.

export interface ImageDimensions { width: number; height: number }

export function parseImageDimensions(buffer: ArrayBuffer): ImageDimensions | null {
  const view = new DataView(buffer)
  if (view.byteLength < 24) return null

  // ── PNG: signature 89 50 4E 47 0D 0A 1A 0A, then IHDR (width@16, height@20) ──
  if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    if (width > 0 && height > 0) return { width, height }
    return null
  }

  // ── JPEG: starts FF D8, then walk markers to the Start-Of-Frame ──
  if (view.getUint16(0) === 0xffd8) {
    let offset = 2
    const len = view.byteLength
    while (offset + 9 < len) {
      // Every marker starts with 0xFF; skip any fill bytes.
      if (view.getUint8(offset) !== 0xff) { offset++; continue }
      const marker = view.getUint8(offset + 1)
      // SOF markers carry the frame dimensions. Exclude C4 (DHT), C8 (JPG),
      // CC (DAC) and the RST/standalone markers.
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      if (isSOF) {
        // [FF][marker][len:2][precision:1][height:2][width:2]
        const height = view.getUint16(offset + 5)
        const width = view.getUint16(offset + 7)
        if (width > 0 && height > 0) return { width, height }
        return null
      }
      // Standalone markers (no length payload): RSTn (D0-D7), SOI(D8), EOI(D9).
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      // Everything else has a 2-byte big-endian length following the marker.
      const segLen = view.getUint16(offset + 2)
      if (segLen < 2) return null
      offset += 2 + segLen
    }
  }

  return null
}
