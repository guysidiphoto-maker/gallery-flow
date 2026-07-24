# Owner Overview + wave-2 integration (Agent-OVERVIEW)

This module is the operator "what do I do next" home, plus the wave-2 wiring
that mounts every wave-1 owner surface into `src/pages/Dashboard.tsx`. It is the
only wave-2 integration point; wave-1 components are imported and mounted as-is
(their files were not edited).

## Files

| File | What it is |
|---|---|
| `src/components/overview/OwnerOverview.tsx` | Default export. The owner home: first-run checklist + status grid + recent list. Props `{ businessId, businessSlug, locale, onNavigate, onNewGallery }`. |
| `src/lib/ownerLocale.ts` | Extended with `nav.*`, `overview.*`, and `assign.modalLabel` keys (he + en). No other module's `strings.ts` was migrated. |
| `src/pages/Dashboard.tsx` | Wiring (see edits below). |

## OwnerOverview: what it shows

Data source: ONLY the existing self-scoped owner RPCs, reused via
`src/components/clients/api.ts` — `fetchClientsOverview()`
(`cpv2_owner_clients_overview`) and `fetchAssignableGalleries()`
(`cpv2_owner_assignable_galleries`). No new RPC/endpoint, no `business_id` from
the browser. Loads only once `businessId` is resolved (avoids a false error
flash while the business row resolves). Loading skeletons, empty states, and
error + retry are all handled.

- **First-run checklist** (6 steps, dismissible): add/import a client, invite a
  client, connect an existing gallery, upload a new gallery and connect it,
  preview the client area, verify active access. Each step's done/not-done is
  derived from real data (has clients? has any member/invite? has an assigned
  gallery? has an assigned+published gallery? has a published gallery? has an
  active member?). Not-done steps show an action button that routes via
  `onNavigate` or opens the new-gallery modal via `onNewGallery`. Dismissal
  persists through `src/lib/onboarding.ts` surface `owner_checklist` (DB
  best-effort, localStorage fallback). The checklist hides itself when all
  steps are done or when dismissed.
- **Status grid** (cards, wrap on mobile): active clients, published galleries
  (with a "N in draft" hint), galleries without a client, galleries no client
  can see (`client_id IS NULL OR status !== 'live'`), pending invitations, total
  galleries. Each card links to the relevant view via `onNavigate`.
- **Recently added**: up to 5 galleries, sorted by `event_date` desc as a cheap
  recency proxy (the assignable-galleries row has no `created_at`), with client
  name, date, and a live/draft badge.

Copy is action-oriented and jargon-free, no em-dashes, he + en via ownerLocale,
RTL-correct.

## Dashboard.tsx edits (line ranges approximate, post-edit)

1. **Imports** (after the `ClientsManager` import, ~line 39-50): added
   `useOwnerLocale`, `FirstRunTour`, `RestartTourButton`, `OwnerOverview`,
   `GlobalSearch`, `TenderSearch`, `ImportCenter`, `AssignClientField`, and
   `assignGallery`.
2. **Hook** (~line 233): `const { locale, t: ownerT } = useOwnerLocale()`.
   Named `ownerT` to avoid any collision with existing local identifiers.
3. **State** (~line 246): widened `activeView` union to
   `'overview' | 'galleries' | 'clients' | 'search' | 'tender' | 'import'`
   (default stays `'galleries'`); added
   `const [newGalleryClientId, setNewGalleryClientId] = useState<string | null>(null)`.
4. **createGallery()** (~line 695-770): the insert now ends
   `.select('id').single()` capturing `{ data: created, error }`. After a
   successful insert, if `newGalleryClientId && created?.id`, it calls
   `assignGallery(...)` and shows an error toast on failure but NEVER blocks
   (gallery stays, upload proceeds). `setNewGalleryClientId(null)` added to the
   reset block.
5. **FirstRunTour mount** (~line 2368): rendered once at the top of the shell,
   right after `<ToastContainer />`, with
   `enabled={Boolean(user && businessId)} surface="owner_tour"`.
6. **Nav array** (~line 2540): widened to 7 items (Overview, Galleries, Search,
   Brand Kit, Clients, Tender, Import), each with a `tour?` field; the `<button>`
   spreads `{...(item.tour ? { 'data-tour': item.tour } : {})}`. `data-tour`
   values wired: `overview` (also on the `<nav>` element), `galleries`,
   `search`, `clients`, `import`. Labels come from `ownerT('nav.*')`. The array
   literal's `view` type annotation was widened to the new union.
7. **RestartTourButton** (~line 2610): placed in the Account section below the
   token card. It renders its own label from ownerLocale (`tour.restart`);
   the component has no children/label prop, so the copy is whatever
   `tour.restart` holds ("הפעלת סיור ההיכרות" / "Start the welcome tour").
8. **Content switch** (~line 2747): the old
   `{activeView === 'clients' ? <ClientsManager/> : (<> galleries </>)}` ternary
   became a chain: `overview → <OwnerOverview/>`, `clients → <ClientsManager/>`,
   `search → <GlobalSearch/>`, `tender → <TenderSearch/>`, `import →
   <ImportCenter/>`, else the ORIGINAL galleries `<>...</>` block, moved
   unchanged into the final branch. `ClientsManager` keeps its
   `businessSlug`/`businessId` props.
9. **AssignClientField in the new-gallery modal** (~line 6470): a labelled
   section (`data-tour="assign-gallery"`, label `assign.modalLabel`) between the
   event-date field and the divider, wired to `newGalleryClientId`.

`src/main.tsx` was NOT edited — no router change was needed (all wave-2 surfaces
are in-page views of the existing Dashboard shell).

## data-tour anchors

`overview` (on `<nav>` and the Overview button), `galleries`, `search`,
`clients`, `import` (nav buttons), and `assign-gallery` (the new-gallery modal
client section). Step 7 `client-preview` has no dedicated anchor yet; per the
tour doc a missing attribute is safe (the card centers and the tour still
progresses). The client-preview affordance lives inside ClientsManager /
BulkAssignView, which this agent does not own.

## Decisions

- **Default view stays `galleries`.** Making `overview` the default risked
  disrupting existing behavior/tests that assume the galleries workspace on
  load. Instead, Overview is the FIRST nav item so it is discoverable without
  changing the landing view.
- **Reused `clients/api.ts` functions** (`fetchClientsOverview`,
  `fetchAssignableGalleries`, `assignGallery`) rather than duplicating any RPC
  call — the same data path ClientsManager already uses.
- **GlobalSearch `onOpenGallery`/`onOpenClient`** switch to the galleries /
  clients view respectively. There is no cheap existing "select this gallery by
  id" setter in the galleries workspace (it lists then opens on click), so a
  deep-link was intentionally not attempted; switching views is the safe,
  non-regressing behavior. `clientOptions` is omitted (the filter hides
  gracefully) to avoid an extra fetch on the search screen.
- **ImportCenter** `onExit`/`onOpenGallery` both return to the galleries view.
- **Icons**: the Icon set has no `home`/`sparkles`; Overview uses `activity`,
  Tender uses `star`, Import uses `download`, Search uses `search`.
- **Assignment never blocks creation.** "No client yet" (null) skips the
  assign call entirely; an assign failure only toasts and leaves the gallery in
  place for later connection.

## Verification (all passed)

- `npx tsc --noEmit -p .` — clean.
- `npm run build` — succeeds (only the pre-existing >500 kB chunk-size warning).
- `npx tsx tests/assignment.test.ts` — 34 passed, 0 failed.
- `npx tsx tests/tour.test.ts` — 29 passed, 0 failed.
- Existing galleries workspace, new-gallery modal, ClientsManager and upload all
  still render: the galleries `<>...</>` block was moved unchanged into the
  default branch of the view switch; the modal only gained one section.
