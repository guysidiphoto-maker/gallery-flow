// galleryAdapter.ts — map real Dashboard gallery data into the editor's inputs.
// Keeps the (large) Dashboard wiring to a couple of calls and is unit-testable.

import { displayUrl } from "../../supabase";
import type { PlannerImage } from "./planner";
import type { BrandResolved } from "./sceneplan";

/** The subset of a Dashboard GalleryImage row we consume. */
export interface GalleryImageRow {
  id: string;
  width?: number | null;
  height?: number | null;
  sort_order?: number | null;
  is_top_pick?: boolean | null;
  storage_path?: string | null; // = web_preview_path in the Dashboard query
  thumbnail_path?: string | null;
  original_path?: string | null;
  section_id?: string | null;
}

/** Real gallery rows -> PlannerImage[] (with a display src for preview/thumbs). */
export function toPlannerImages(rows: GalleryImageRow[]): PlannerImage[] {
  return rows
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => {
      const path = r.thumbnail_path || r.storage_path || r.original_path || "";
      return {
        id: r.id,
        src: path ? displayUrl("gallery-images", path, 720) : undefined,
        width: r.width ?? undefined,
        height: r.height ?? undefined,
        sortOrder: r.sort_order ?? 0,
        isTopPick: !!r.is_top_pick,
        sectionId: r.section_id ?? null,
      };
    });
}

export interface BrandInputs {
  accentHex?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  studioName?: string | null;
  logoUrl?: string | null;
  watermarkEnabled?: boolean | null;
  watermarkOpacityPercent?: number | null;
}

/** Resolve BrandResolved from whatever brand data the Dashboard has, with
 *  safe, readable defaults (guarantees a valid hex accent for the validator). */
export function toBrandResolved(b: BrandInputs): BrandResolved {
  const accent = b.accentHex && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(b.accentHex) ? b.accentHex : "#B45309";
  return {
    accentHex: accent,
    headingFont: b.headingFont || "Playfair Display, Georgia, serif",
    bodyFont: b.bodyFont || "Inter, -apple-system, sans-serif",
    studioName: b.studioName || null,
    logoUrl: b.logoUrl || null,
    watermark: {
      enabled: b.watermarkEnabled ?? true,
      opacityPercent: b.watermarkOpacityPercent ?? 18,
      position: "bottom-right",
    },
  };
}
