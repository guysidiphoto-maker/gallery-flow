// Server-side choke-point that makes an untrusted client ScenePlan safe to persist or render:
// no foreign images, no client-supplied URLs, no markup, no cap overruns. Pure (no I/O), so both
// the render and draft endpoints share it and it is unit-testable.

import {
  sanitizeForRender,
  validateScenePlan,
  type Scene,
  type ScenePlan,
} from "./sceneplan.ts";

/** The subset of an `images` row the server trusts for a gallery. */
export interface OwnerImage {
  id: string;
  width?: number | null;
  height?: number | null;
}

export interface ResolveResult {
  ok: boolean;
  errors: string[];
  /** Server-authoritative plan (client src/dims replaced) — only when ok. */
  plan?: ScenePlan;
}

/** Validate + harden a client plan against the gallery's own image rows (the source of truth). */
export function resolveAndValidatePlan(
  plan: ScenePlan,
  galleryId: string,
  ownerImages: readonly OwnerImage[],
  resolveSrc: (imageId: string) => string
): ResolveResult {
  const errors: string[] = [];

  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: ["plan is not an object"] };
  }
  // Never let plan.galleryId redirect to a gallery the caller wasn't authorized for.
  if (plan.galleryId !== galleryId) {
    errors.push(`plan.galleryId (${plan.galleryId}) does not match authorized gallery`);
  }

  const byId = new Map<string, OwnerImage>();
  for (const img of ownerImages) byId.set(img.id, img);
  const allowed = new Set(byId.keys());

  // 1. Structural + tenant-isolation validation, shared with the editor and tests.
  const base = validateScenePlan(plan, allowed);
  if (!base.ok) errors.push(...base.errors);

  if (errors.length > 0) return { ok: false, errors };

  // 2. Rebuild scenes with server-resolved src and dims so a tampered client can't inject URLs
  //    or skew the renderer's crop math.
  const scenes: Scene[] = plan.scenes.map((s) => {
    const rec = byId.get(s.imageId)!; // guaranteed present (validated above)
    return {
      ...s,
      src: resolveSrc(s.imageId),
      // Collage cells are server-resolved too (ids were tenant-validated above).
      collageSrc: s.layout === "collage" && s.collageImageIds ? s.collageImageIds.map((id) => resolveSrc(id)) : undefined,
      width: rec.width ?? s.width,
      height: rec.height ?? s.height,
    };
  });

  // A non-http(s) logo resolves against the render origin, 404s and kills Chromium; drop it.
  const isHttpUrl = (s: unknown): s is string => typeof s === "string" && /^https?:\/\//i.test(s);
  const brand = plan.brand
    ? { ...plan.brand, logoUrl: isHttpUrl(plan.brand.logoUrl) ? plan.brand.logoUrl : null }
    : plan.brand;

  const safe = sanitizeForRender({ ...plan, galleryId, brand, scenes });
  return { ok: true, errors: [], plan: safe };
}

/** Strip volatile/preview-only fields before persisting a draft. */
export function stripForPersistence(plan: ScenePlan): ScenePlan {
  const cleaned = sanitizeForRender(plan);
  return {
    ...cleaned,
    scenes: cleaned.scenes.map(({ src, ...rest }) => rest),
  };
}
