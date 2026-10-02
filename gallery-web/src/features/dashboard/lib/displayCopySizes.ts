// Widths match the viewer's srcset descriptors (MasonryTile: thumb 640w, web 2048w).
export const DISPLAY_COPY_SIZES = {
  thumb: { width: 640, quality: 0.78 },
  web: { width: 2048, quality: 0.82 },
} as const

export type DisplayCopyResult =
  | { ok: true; web: Blob; thumb: Blob }
  | { ok: false; error: string }
