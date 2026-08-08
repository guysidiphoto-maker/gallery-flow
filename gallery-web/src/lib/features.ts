// features.ts — client-side feature availability (overnight contract C1).
//
// Single source of truth for whether the Social / Production studio surfaces
// may render AT ALL, independent of any per-business entitlement. The rule is
//
//   socialAllowed = SOCIAL_STUDIO_ENABLED && production_suite
//
// BOTH must be true. Today no environment sets VITE_FEATURE_SOCIAL_STUDIO, so
// the studio is closed for every business and every client regardless of
// entitlement. The entitlement architecture stays intact underneath — this is
// an availability kill-switch layered ON TOP of it, never a replacement.
//
// Fail CLOSED: anything other than the exact string 'true' (missing var,
// build-time weirdness, thrown access) resolves to false.

export const SOCIAL_STUDIO_ENABLED: boolean = (() => {
  try {
    return import.meta.env.VITE_FEATURE_SOCIAL_STUDIO === 'true'
  } catch {
    return false
  }
})()
