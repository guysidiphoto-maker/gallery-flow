# Social lockdown (Agent-SOCIAL): INTEGRATION notes

Overnight sprint 2026-07-24, contract C1. Social/Production studio is closed for EVERYONE, including entitled members, until both feature flags are set. Entitlement architecture untouched underneath.

## The rule

`socialAllowed = SOCIAL_STUDIO_ENABLED && production_suite`

- Client flag: `import.meta.env.VITE_FEATURE_SOCIAL_STUDIO === 'true'` (src/lib/features.ts, build-time, fail closed)
- Server flag: `process.env.FEATURE_SOCIAL_STUDIO === 'true'` (server/features.ts, read per request, fail closed, exact string match only)
- No environment sets either variable today, so everything below is OFF everywhere.

## Files changed

| File | Change |
|---|---|
| `src/lib/features.ts` | NEW. Exports `SOCIAL_STUDIO_ENABLED` (client flag). |
| `server/features.ts` | NEW. Exports `socialStudioEnabled()` + `requireSocialStudio(res)` (writes the canonical `403 {ok:false, error:'feature_disabled'}`). |
| `api/generate-feed.ts` | Flag check is the FIRST statement of the handler, before origin/method/config/entitlement. |
| `api/generate-campaign.ts` | Same. |
| `api/plan-event.ts` | Same. |
| `api/score-images.ts` | Same. |
| `api/generate-captions.ts` | Flag check first, PLUS the missing entitlement gate (see decision 2). |
| `api/append-event-posts.ts` | Flag check for the four Social actions only (see decision 1). |
| `src/pages/ClientDashboard.tsx` | `socialAllowed` drives redirect guard, nav model, and every Production tab mount. Locked Social nav item + Coming-soon panel. |
| `src/lib/portalLocale.ts` | Additive keys only (he+en): `nav.comingSoon`, `socialLock.title`, `socialLock.body`, `socialLock.cta`. |
| `src/components/social-lock/SocialComingSoon.tsx` | NEW. The Coming-soon panel (default export, props `{ loc, onGoGalleries }`). |
| `tests/social-lockdown.test.ts` | NEW. 30 offline assertions, all green. |

No Social code files were deleted. FeedStudio, SocialManager, EventPlanDialog, CreativeEngineDialog, GalleryDeepDive etc. are intact, just unmountable while the flag is off.

## Decisions

1. **append-event-posts is a MIXED dispatcher, gated per action.** Its `verify_code` and `redeem_token` actions power the legacy PIN login, and `signed_url` + `public_gallery_session` power CORE gallery viewing (image signing, public sessions). Gating the whole endpoint would have broken every gallery in production behavior. Only the Social actions are flag-gated: `append_event_posts` (also the implicit default when `action` is missing), `choose_variant`, `unchoose_variant`, `save_post_edit`. The flag check runs before the origin and supabase-config checks for those actions.

2. **generate-captions now requires entitlement.** It previously required only `requireAuthedUser` (any logged-in user could spend Anthropic budget). Its payload carried no tenant resource, so I made `clientId` REQUIRED and wired `requireProductionOwnerOfClient` (JWT + business ownership of the client + `production_suite`), identical to the sibling Social endpoints. Nothing reachable breaks today because the feature flag rejects first anyway.
   **Re-enable checklist item:** the two callers in `src/components/SocialManager.tsx` (`generateAllCaptions` ~line 148, `generateSingleCaption` ~line 183) must add `clientId` to the request body. SocialManager already receives `clientId` as a prop, so it is a two-line change, but SocialManager.tsx is not owned by this agent in wave 1.

3. **Locked nav item rendering.** `PortalNav`'s `NavItem.icon` is restricted to the shared `IconName` union, which has no `lock` glyph, and `Icon.tsx`/`PortalNav.tsx` are not mine to edit. So the nav item is labeled `"<Social Studio> · <Coming soon>"` (locale-aware via `nav.comingSoon`) with the existing `stories` icon, and the real lock glyph (inline SVG) lives in the `SocialComingSoon` panel that opens on click. Optional integrator polish: add a `'lock'` name to `Icon.tsx` and switch the nav item's icon.

4. **Selecting the locked item never touches `tab`.** It flips presentation-only state (`socialLockOpen`), same pattern as the existing `nonEntitledOverview`. The redirect guard (now keyed on `socialAllowed`) keeps `tab` pinned to `'galleries'`, so no Production module can mount, no Instagram connect flow is reachable, and refresh lands on Galleries.

5. **My Page stays for entitled members.** `'page'` (PortfolioEditor) is not in `PRODUCTION_TABS`, not in the contract's redirect list, and not a Social surface. When the flag is off, an entitled member's nav is: Overview, Galleries, Social Studio (locked), My Page. Non-entitled and legacy-PIN users get: Overview, Galleries, Social Studio (locked).

6. **Locked item is shown only when the flag is off** (`!SOCIAL_STUDIO_ENABLED`). If the flag is ever ON and a member is simply not entitled, the nav reverts to the exact prior behavior (no Social entry point at all), preserving the entitlement UX.

7. **Stories tab hardening.** `tab === 'stories'` rendered without any production gate before (redirect guard was the only protection, with a transient render window). It is now also gated on `socialAllowed`.

## Leak audit (files not mine to edit)

- `src/main.tsx`: verified read-only. No route reaches a Social component directly; FeedStudio/SocialManager/etc. mount ONLY inside `ClientDashboard` (routes `/:slug/c/:id` and `/client/:id/dashboard`), which is now gated. **No leak, no integrator action needed in main.tsx.**
- `src/pages/Dashboard.tsx` (owner side): no Social component mounts (one comment mention only).
- All frontend callers of the Social APIs (`generate-feed`, `generate-campaign`, `plan-event`, `score-images`, `generate-captions`) live in components mounted exclusively behind `socialAllowed`. Even if a stale bundle called them, the server flag rejects with 403.
- Dead code note: `CreativeEngineDialog` inside ClientDashboard can never open (`setCreativeGallery` has no caller). Left as is per "keep all Social code files intact".

## How to re-enable later

1. Set `VITE_FEATURE_SOCIAL_STUDIO=true` (build-time, Vercel env for the frontend build).
2. Set `FEATURE_SOCIAL_STUDIO=true` (server env for the API functions).
3. Add `clientId` to the two generate-captions calls in SocialManager.tsx (decision 2).
4. Entitled members (`production_suite`) get the full studio back; everyone else keeps the entitlement-gated behavior that existed before this change.

## Verification

- `npx tsc --noEmit -p .` clean (src). Standalone strict typecheck of the api/server/test files also clean.
- `npx tsx tests/social-lockdown.test.ts`: 30 passed, 0 failed.
- `npx tsx tests/cpv2-entitlements.test.ts`: 13 passed, 0 failed (no regression).
