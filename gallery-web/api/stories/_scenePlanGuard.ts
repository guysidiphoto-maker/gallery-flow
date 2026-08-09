// _scenePlanGuard.ts — SELF-CONTAINED server-side ScenePlan guard for the Vercel
// functions. Deliberately has NO relative imports: Vercel compiles each api file
// to .js and preserves import specifiers, so a `.ts` specifier (or an
// extensionless/`.js` one that maps to a .ts) fails at runtime with
// ERR_MODULE_NOT_FOUND. Keeping this file import-free sidesteps that entirely.
//
// It mirrors the tested src/lib/storyStudio/{sceneplan,serverPlan}.ts logic
// (tenant isolation, client-src discard, server-authoritative dims, injection +
// range checks). Keep in sync with those; a follow-up can dedupe via a build step.

const MIN_SCENE_SEC = 1.8;
const MAX_SCENE_SEC = 6.0;
const MAX_TRANSITION_SEC = 1.2;
const MIN_SCENES = 3;
const MAX_SCENES = 40;
const MAX_TEXT_LEN = 120;
const MAX_TITLE_LEN = 80;
const TEMPLATES = ['editorial-clean', 'cinematic-energy', 'fast-highlights'];
const MOTION = ['none', 'push-in', 'pull-out', 'pan', 'focus-zoom'];
const TRANSITIONS = ['cut', 'cross-dissolve', 'slide', 'soft-blur', 'light-leak'];

export interface OwnerImage {
  id: string;
  width?: number | null;
  height?: number | null;
}

export interface GuardResult {
  ok: boolean;
  errors: string[];
  plan?: any;
}

const hasMarkup = (s: unknown): boolean => typeof s === 'string' && /[<>]/.test(s);

export function resolveAndValidatePlan(
  plan: any,
  galleryId: string,
  ownerImages: readonly OwnerImage[],
  resolveSrc: (imageId: string) => string,
): GuardResult {
  const errors: string[] = [];
  if (!plan || typeof plan !== 'object') return { ok: false, errors: ['plan is not an object'] };
  if (plan.galleryId !== galleryId) errors.push('plan.galleryId does not match authorized gallery');
  if (plan.format !== '9:16') errors.push('unsupported format');
  if (!TEMPLATES.includes(plan.template)) errors.push('unknown template');
  if (plan.width !== 1080 || plan.height !== 1920) errors.push('bad dimensions');
  if (plan.fps !== 30) errors.push('bad fps');

  const byId = new Map<string, OwnerImage>();
  for (const im of ownerImages) byId.set(im.id, im);

  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  if (scenes.length < MIN_SCENES) errors.push('too few scenes');
  if (scenes.length > MAX_SCENES) errors.push('too many scenes');

  const seen = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s || typeof s !== 'object') { errors.push(`scene[${i}] invalid`); continue; }
    if (!s.imageId || !byId.has(s.imageId)) errors.push(`scene[${i}] references foreign imageId ${s.imageId}`);
    if (!s.id || seen.has(s.id)) errors.push(`scene[${i}] bad/duplicate id`); else seen.add(s.id);
    if (typeof s.durationSec !== 'number' || s.durationSec < MIN_SCENE_SEC - 1e-6 || s.durationSec > MAX_SCENE_SEC + 1e-6)
      errors.push(`scene[${i}] duration out of range`);
    if (typeof s.transitionDurationSec !== 'number' || s.transitionDurationSec < 0 || s.transitionDurationSec > MAX_TRANSITION_SEC + 1e-6)
      errors.push(`scene[${i}] transition duration out of range`);
    if (!MOTION.includes(s.motion)) errors.push(`scene[${i}] bad motion`);
    if (!TRANSITIONS.includes(s.transitionIn)) errors.push(`scene[${i}] bad transition`);
    if (!s.focal || s.focal.x < 0 || s.focal.x > 1 || s.focal.y < 0 || s.focal.y > 1) errors.push(`scene[${i}] bad focal`);
    if (s.text) {
      if (typeof s.text.content !== 'string' || s.text.content.length > MAX_TEXT_LEN) errors.push(`scene[${i}] bad text`);
      if (hasMarkup(s.text.content)) errors.push(`scene[${i}] text contains disallowed characters`);
    }
  }
  for (const card of [plan.opening, plan.outro]) {
    if (!card) continue;
    if (card.title && (card.title.length > MAX_TITLE_LEN || hasMarkup(card.title))) errors.push('bad card title');
    if (card.subtitle && hasMarkup(card.subtitle)) errors.push('bad card subtitle');
  }
  if (!plan.brand || typeof plan.brand.accentHex !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(plan.brand.accentHex))
    errors.push('bad brand accent');

  if (errors.length) return { ok: false, errors };

  // Server-authoritative rebuild: discard client src, take dims from our records.
  const safeScenes = scenes.map((s: any) => {
    const rec = byId.get(s.imageId)!;
    const { _reason, ...rest } = s;
    return { ...rest, src: resolveSrc(s.imageId), width: rec.width ?? s.width, height: rec.height ?? s.height };
  });
  return { ok: true, errors: [], plan: { ...plan, galleryId, scenes: safeScenes } };
}

export function stripForPersistence(plan: any): any {
  if (!plan || !Array.isArray(plan.scenes)) return plan;
  return { ...plan, scenes: plan.scenes.map((s: any) => { const { src, _reason, ...rest } = s; return rest; }) };
}
