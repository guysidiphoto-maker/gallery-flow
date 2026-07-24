# Tender Library — integration notes (Agent-TENDER, wave 1)

Owner-side "find past work for a tender/brief" surface. Metadata-first, reuses
the real `search_owner_content` RPC (098) and real `image_ai_scores` for
ordering only. No invented match scores.

## SQL dependency (apply to QA in order)
1. `097_gallery_event_metadata.sql` — adds the classification columns + extends
   the `client_access_audit` action CHECK (contract C9). MUST be first.
2. `098_search_rpcs.sql` — the search RPC TenderSearch queries.
3. `100_tender_collections.sql` — `tender_collections` + `tender_collection_items`
   (owner-scoped RLS; writes go direct under RLS).
Rollbacks: `*_rollback.sql` for 097 and 100. Nothing applied by this agent.

## What shipped
| File | Export |
|---|---|
| `src/components/tender/TenderSearch.tsx` | **default** `TenderSearch` — props `{ locale?: 'he'\|'en' }` (default `'he'`). Self-contained: resolves the owner business via the RPC, runs the brief form + filters, renders result cards with provenance + match reasons, and manages tender collections (create/rename, add/remove galleries+images, copy-list export). |
| `src/components/tender/MetadataEnrichment.tsx` | `MetadataEnrichment` — props `{ galleryId, values, locale?, onSaved, onClose }`. Inline "classify event" editor; writes via `POST /api/gallery-metadata`. Show "Unclassified" state; enrichment is always optional. |
| `src/components/tender/metadata.ts` | pure metadata validation/match-reason helpers (offline-tested). |
| `src/components/tender/collections.ts` | pure collection item dedupe + copy-list export helpers. |
| `src/components/tender/strings.ts` | local he/en strings, `locale` prop pattern (contract C8). |
| `api/gallery-metadata.ts` | `POST` `{ action:'update_gallery_metadata', galleryId, ...fields }`, `requireOwnerBusiness`, enum/length validated server-side, audits `gallery_metadata_updated`. |
| `tests/tender.test.ts` | `npx tsx tests/tender.test.ts` (35 assertions). |

## Mount (wave 2)
```tsx
import TenderSearch from '../components/tender/TenderSearch'
// inside the Dashboard view switch, new activeView === 'tender':
<TenderSearch locale={locale} />
```
Suggested nav label (from strings): he `מאגר למכרזים`, en `Tender library`.
`MetadataEnrichment` is opened from within TenderSearch result cards; the
integrator does not mount it directly. It is also reusable from a gallery's
settings tab if desired (pass the gallery's current metadata as `values`).

## Decisions
- No PDF export tonight — "copy list" (gallery names + filenames) only.
- Image ordering uses `image_ai_scores.hero_score` when present, labelled
  "Based on existing AI score"; otherwise `sort_order`. No new scoring.
- Cross-tenant safety comes from `search_owner_content` (business-scoped) and
  the tender_collections owner RLS; the UI never trusts a client-supplied
  business id.
