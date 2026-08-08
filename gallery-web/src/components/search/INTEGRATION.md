# Global Search — integration notes (Agent-SEARCH, wave 1)

Owner-side, tenant-scoped global search over clients / galleries / photos.
Metadata-first, plain ILIKE matching (Hebrew + English). No semantic search.

## SQL: apply 097 BEFORE 098 on QA

Migration `supabase/migrations/098_search_rpcs.sql` references the 097 columns
on `galleries` (`event_size_bucket`, `industry`, `venue_type`, `time_of_day`,
`event_keywords`) in both its indexes and the RPC body. Order on the QA
project (`pixflow-cpv2-qa2`):

1. `097_*` (gallery event metadata, owned by the DB/metadata agent)
2. `098_search_rpcs.sql`

Rollback: `098_search_rpcs_rollback.sql` (drops the function + indexes, keeps
the shared `pg_trgm` extension). Nothing has been applied anywhere by this
agent.

Security posture: identical to the 092 `cpv2_owner_*` family. SECURITY
DEFINER, `SET search_path = public`, business resolved internally from
`auth.uid()`, fails closed to `{clients:[],galleries:[],images:[]}` when the
caller has no business, EXECUTE revoked from PUBLIC/anon and granted only to
`authenticated` + `service_role`. No secrets in the payload.

## Mount (wave 2, Agent-OVERVIEW)

```tsx
import GlobalSearch from '../components/search/GlobalSearch'

<GlobalSearch
  onOpenGallery={(galleryId) => {/* Dashboard in-page gallery selection */}}
  onOpenClient={(clientId) => {/* Clients Manager detail */}}
  locale={locale}                 // from useOwnerLocale(); default 'he'
  clientOptions={clients}         // optional, see below
/>
```

Suggested nav label keys (already shipped in `strings.ts`): `search.title`
('חיפוש' / 'Search').

## Prop contract

| Prop | Type | Required | Notes |
|---|---|---|---|
| `onOpenGallery` | `(galleryId: string) => void` | yes | Called on gallery row AND photo card click (photos navigate to their gallery). The component does no routing itself. |
| `onOpenClient` | `(clientId: string) => void` | yes | Called on client row click. |
| `locale` | `'he' \| 'en'` | no (default `'he'`) | Sets `dir` (rtl/ltr) and dictionary. Wave 2: pass `useOwnerLocale().locale`. |
| `clientOptions` | `{ id: string; name: string }[]` | no | Populates the "client" filter select. Feed it from `cpv2_owner_clients_overview()` (id + name). Omitted/empty → the client filter is hidden; everything else works. |

Default export: `GlobalSearch`. No context providers, no router dependency,
no global state.

## Behavior

- Debounce 300ms. `supabase.rpc` cannot be aborted, so cancellation is a
  request-sequence guard: only the latest in-flight request may commit its
  response; late responses are dropped (`searchLogic.createSequenceGuard`).
- Empty query + at least one filter = filter-only gallery browse (cap 200).
- Query >= 1 char adds clients (cap 50) and photos (cap 60, thumbnails only
  via the existing `displayUrl('gallery-images', thumbnail_path, 320)`
  pattern; full collections are never loaded).
- Every result row shows match-reason chips ("התאמה: שם" / "Matched: name").
- States: idle prompt, loading skeletons, error + retry, empty
  ('לא נמצאו תוצאות' / 'No results').

## i18n decision (contract C8)

`src/lib/ownerLocale.ts` is created concurrently by Agent-TOUR, so this
component does NOT import it (wave-1 isolation). Strings live in
`src/components/search/strings.ts` as a flat `{he, en}` dictionary in the
portalLocale shape, and the component takes `locale` as a prop. Wave 2 wires
the prop from `useOwnerLocale()`; Agent-OVERVIEW may merge `strings.ts` into
`ownerLocale.ts` later or keep it local (both allowed by the contract). Both
languages are complete; copy has no long dashes and no internal jargon.

## Filters sent to the RPC (contract C5)

`client_id, status ('live'|'draft'), assigned (bool), event_type,
event_size_bucket, industry, venue_type, time_of_day, year_from, year_to,
keywords (string[], overlap with event_keywords), imported_source
(delivery_settings->'importSource'->>'provider': pixieset / generic_csv /
local_folder)`. Malformed values are dropped client-side
(`buildFilterPayload`) AND server-side (RPC validation), so a bad filter can
never widen a result set.

## Tests

`npx tsx tests/search.test.ts` — offline, no DB: payload builder, keyword
parsing, debounce, sequence guard, match-reason mapping, he/en dictionary
parity, defensive result normalization. All green at hand-off.
