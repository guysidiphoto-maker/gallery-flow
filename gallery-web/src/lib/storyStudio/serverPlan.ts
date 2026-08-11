// serverPlan.ts — SERVER-SIDE security boundary for a client-submitted ScenePlan.
//
// The editor sends a ScenePlan to the render/draft endpoints. The client is
// UNTRUSTED: it must not be able to (a) reference images from another gallery,
// (b) inject arbitrary image URLs, (c) smuggle unsafe text/markup, or (d) blow
// past duration/scene caps. This module is the single choke-point that makes a
// submitted plan safe before it is persisted or rendered.
//
// It is PURE (no I/O, no Supabase) so it is fully unit-testable and reusable by
// both the render endpoint and the draft endpoint. The caller supplies the
// gallery's own image records + a src resolver; this module NEVER trusts a
// client-provided scene.src.

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

/**
 * Validate + harden a client plan against the gallery's own images.
 *
 * @param plan          the untrusted plan from the editor
 * @param galleryId     the gallery the caller owns (must match plan.galleryId)
 * @param ownerImages   the gallery's real image rows (source of truth)
 * @param resolveSrc    server-side resolver: image id -> render URL (signed/public)
 */
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
  // The plan must target the gallery the caller was authorized for — never
  // trust plan.galleryId to redirect to a different gallery.
  if (plan.galleryId !== galleryId) {
    errors.push(`plan.galleryId (${plan.galleryId}) does not match authorized gallery`);
  }

  const byId = new Map<string, OwnerImage>();
  for (const img of ownerImages) byId.set(img.id, img);
  const allowed = new Set(byId.keys());

  // 1. Structural + tenant-isolation validation (foreign imageId, injection,
  //    ranges) — the shared validator is the same one the editor/tests use.
  const base = validateScenePlan(plan, allowed);
  if (!base.ok) errors.push(...base.errors);

  if (errors.length > 0) return { ok: false, errors };

  // 2. Rebuild every scene with SERVER-resolved src + SERVER dims. Any client
  //    scene.src is discarded; width/height come from our own records so the
  //    renderer's fit/crop math can't be skewed by a tampered client.
  const scenes: Scene[] = plan.scenes.map((s) => {
    const rec = byId.get(s.imageId)!; // guaranteed present (validated above)
    return {
      ...s,
      src: resolveSrc(s.imageId),
      // Collage cells are ALSO server-resolved (client collageSrc discarded);
      // every collage image id was tenant-validated above, so this can't leak
      // another gallery's photo into a collage.
      collageSrc: s.layout === "collage" && s.collageImageIds ? s.collageImageIds.map((id) => resolveSrc(id)) : undefined,
      width: rec.width ?? s.width,
      height: rec.height ?? s.height,
    };
  });

  const safe = sanitizeForRender({ ...plan, galleryId, scenes });
  return { ok: true, errors: [], plan: safe };
}

/** Convenience: strip volatile/preview-only fields before persisting a draft. */
export function stripForPersistence(plan: ScenePlan): ScenePlan {
  const cleaned = sanitizeForRender(plan);
  return {
    ...cleaned,
    scenes: cleaned.scenes.map(({ src, ...rest }) => rest),
  };
}
