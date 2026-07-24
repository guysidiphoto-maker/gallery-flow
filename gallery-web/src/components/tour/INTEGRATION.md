# First-Run Tour: Integration Guide (for Agent-OVERVIEW / wave 2)

Owner-side guided tour for the business operator. Wave-1 deliverable of
Agent-TOUR; nothing here touches `Dashboard.tsx` or `main.tsx` yet. This file
is the exact wiring recipe.

## What exists

| File | Exports |
|---|---|
| `src/components/tour/FirstRunTour.tsx` | **default** `FirstRunTour`, `OWNER_TOUR_STEPS`, `TOUR_RESTART_EVENT`, types `TourStep`, `FirstRunTourProps` |
| `src/components/tour/RestartTourButton.tsx` | **default** (and named) `RestartTourButton` |
| `src/lib/onboarding.ts` | `getProgress`, `saveProgress`, `TOUR_VERSION`, pure helpers (`resolveVisibility`, `clampStep`, …) |
| `src/lib/ownerLocale.ts` | `useOwnerLocale()` → `{ locale, dir, t, setLocale, toggle }` (shared owner-side i18n hook, key `pixflow-owner-locale`, he=RTL default) |
| `supabase/migrations/096_onboarding_progress.sql` (+ `_rollback`) | `onboarding_progress` table, self-only RLS. QA project only; the client works WITHOUT it via localStorage fallback |
| `tests/tour.test.ts` | `npx tsx tests/tour.test.ts` |

No new npm packages. No CSS files (inline styles). Focus trap reuses
`src/lib/useFocusTrap.ts` (import only, not modified).

## 1. Mount point in Dashboard.tsx

Mount ONCE, at the top level of the Dashboard shell's return (a fixed-position
overlay; placement in the tree does not matter visually, but keep it inside
the authenticated branch so it never renders for logged-out visitors):

```tsx
import FirstRunTour from '../components/tour/FirstRunTour'

// inside Dashboard()'s return, e.g. right before the closing tag of the shell:
<FirstRunTour enabled={Boolean(user && businessId)} surface="owner_tour" />
```

`steps` defaults to `OWNER_TOUR_STEPS` (7 steps); only pass a custom array if
the step set changes.

## 2. The `enabled` prop contract (owner only, never on portal routes)

- `enabled` MUST be true only for the BUSINESS OPERATOR: the authenticated
  user whose `businesses.user_id = auth.uid()` row backs this dashboard.
  In `Dashboard.tsx` that is exactly `Boolean(user && businessId)` after the
  existing business lookup resolves (the Dashboard already auto-creates the
  businesses row, so this is equivalent to "signed-in owner, data loaded").
- NEVER mount this component (or pass `enabled`) in `ClientDashboard.tsx`,
  `src/components/portal/**`, `ClientLogin.tsx`, `ClientInviteAccept.tsx`, or
  any route an external client user can reach. External clients must never
  see it.
- While `enabled` is false the component renders `null` and does nothing (no
  storage reads). Flipping it to true triggers the visibility check.
- Auto-show logic (already inside the component): shows only when stored
  progress for `(user, 'owner_tour', TOUR_VERSION)` is `pending`/`in_progress`
  or belongs to an older version; `completed`/`dismissed` stay hidden.
  Resumes at the saved step.

## 3. data-tour attributes to add (Dashboard.tsx sidebar + wave-1 mounts)

Step → selector mapping (`OWNER_TOUR_STEPS`). A missing attribute is safe:
the card centers and the tour still progresses, so attributes can land
incrementally.

| Step | `data-tour` value | Put it on |
|---|---|---|
| 1 Overview | `overview` | the sidebar `<nav>` element (Dashboard.tsx ~line 2531, the Workspace nav) or the main content header |
| 2 Clients | `clients` | the "לקוחות" nav button (item in the nav array, ~line 2535) |
| 3 Galleries | `galleries` | the "הגלריות שלי" nav button (~line 2533) |
| 4 Assign | `assign-gallery` | the assign-to-client control in Agent-ASSIGN's UI (`src/components/assignment/**`) |
| 5 Search | `search` | the search input/trigger from Agent-SEARCH (`src/components/search/**`) |
| 6 Import | `import` | the Import Center entry point from Agent-IMPORT (`src/components/importer/**`) |
| 7 Preview | `client-preview` | the "preview as client" button; until one exists, the client-portal link/copy control is the best anchor |

Since the sidebar nav buttons are generated from an inline array `.map`, the
cleanest edit is adding a `tour` field per item and spreading it:

```tsx
{ icon: 'clients' as IconName, label: 'לקוחות', tour: 'clients', ... }
// on the <button>:
{...(item.tour ? { 'data-tour': item.tour } : {})}
```

## 4. RestartTourButton in a Help menu

```tsx
import RestartTourButton from '../components/tour/RestartTourButton'

// inside any owner-side menu/dropdown (e.g. the Account section):
<RestartTourButton surface="owner_tour" />
```

It resets progress to `pending`/step 0 (localStorage + DB best-effort), then
dispatches `TOUR_RESTART_EVENT` (`pixflow:restart-tour`) with
`detail.surface`; the mounted `FirstRunTour` with the same surface reopens
immediately at step 1. Style via `className`/`style`; default is a subtle
text button that fits a menu row.

## 5. i18n

All tour copy lives in `src/lib/ownerLocale.ts` (he + en, flat keys under
`tour.*`). Direction comes from `useOwnerLocale().dir`; the card sets its own
`dir` attribute and flips ArrowLeft/ArrowRight semantics in RTL. Other wave-1
areas keep their strings in local `strings.ts` modules per contract C8; only
Agent-OVERVIEW merges into `ownerLocale.ts` in wave 2.

## 6. Decisions made (and why)

- **Restart via window CustomEvent, not context/props**: keeps Dashboard.tsx
  wiring to two one-line mounts with zero shared state; the event is
  namespaced (`pixflow:restart-tour`) and surface-filtered.
- **Save order: localStorage first, DB best-effort second** so a Preview
  without migration 096, an offline session, or an RLS hiccup never loses or
  blocks progress. DB hits are mirrored back into localStorage on read.
- **Opening the tour immediately writes `in_progress`** so a mid-tour refresh
  resumes instead of restarting.
- **Backdrop clicks are swallowed but never close/advance**: prevents
  accidental page actions under the dim; Esc, Skip and Close (×) are always
  available, so the app is never blocked.
- **`upsert` on `(user_id, surface, version)`** matches the unique index in
  migration 096; RLS INSERT+UPDATE self-policies make the upsert legal.
  There is no DELETE path anywhere (restart is an UPDATE to `pending`).
- **Spotlight = box-shadow trick** (one div, `0 0 0 200vmax` shadow): zero
  dependencies, animates smoothly between targets, and `pointer-events: none`
  keeps it inert. On mobile (<640px) the card becomes a bottom sheet and the
  dim is a plain full-screen layer.
- **Interval re-measure (350ms) while open**: tracks smooth-scroll settling
  and layout shifts without a ResizeObserver on every target.

## 7. QA checklist for the integrator

1. Fresh owner (no progress anywhere) → tour opens at step 1 in Hebrew, RTL.
2. Navigate to step 3, refresh → resumes at step 3.
3. Skip → refresh → does not reappear. RestartTourButton → reappears at 1.
4. Finish all 7 → does not reappear.
5. Delete the `onboarding_progress` table access (or run on a Preview without
   096) → everything above still works via localStorage.
6. Log in as a portal client (memberA1@qa.test) → tour never renders.
7. Keyboard only: Tab stays inside the card, Esc closes, arrows navigate
   (flipped in RTL), focus returns to the previously focused element.
