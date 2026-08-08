# Import Center — integration notes (wave-1 handoff)

Owner: Agent-IMPORT. Mount point: a new Dashboard nav view. Wave-1 rule: this
module exposes ONE default-exported component and does NOT edit `Dashboard.tsx`
or `main.tsx`. The wave-2 integrator (Agent-OVERVIEW) wires it in.

## What to mount

```tsx
import ImportCenter from './components/importer/ImportCenter'

// inside the Dashboard view switch:
<ImportCenter
  onOpenGallery={(galleryId) => navigateToGallery(galleryId)}  // optional
  onExit={() => setView('galleries')}                          // optional
  locale="he"                                                  // optional, default 'he'
/>
```

### Nav label (contract C8 — strings live in the module, not hard-coded)

Add the nav item using the owner locale. Suggested keys (add to `ownerLocale.ts`
in wave 2, or read from this module's `strings.ts`):

- he: `ייבוא`
- en: `Import`

Longer label available today from `importer/strings.ts`:
`import.title` = `ייבוא גלריות` / `Import galleries`.

The nav item is always routable (no entitlement gate on the Import Center
itself — quota enforcement happens later, during the actual photo uploads,
inside the existing upload pipeline). It is NOT a locked "coming soon" card like
Social Studio.

## Prop contract

| Prop | Type | Required | Meaning |
|---|---|---|---|
| `onOpenGallery` | `(galleryId: string) => void` | no | Step 5 "open gallery" links call this. If omitted, the link is hidden. |
| `onExit` | `() => void` | no | Header close button + step-5 "Done" call this. If omitted, no exit affordance is shown. |
| `locale` | `'he' \| 'en'` | no (default `'he'`) | Pins text + direction. When omitted, follows the owner-wide locale from `useOwnerLocale()`. |

The component is otherwise self-contained: it resolves the owner's business and
creates the import job lazily (only when the user leaves step 1), so a user who
merely reads the instructions leaves no draft job behind.

## Data flow (no new mechanisms)

- Reads: `supabase` directly under the owner session (own business, own
  clients) via `importApi.ts` + `clients/api.ts::fetchClientsOverview`.
- Writes: `POST /api/import-center` (service-role, `requireOwnerBusiness`,
  audited). Client creation reuses `POST /api/client-admin` `create_client`.
- Photos: the EXISTING `src/lib/uploadPipeline.ts::uploadMany`. No new storage
  path, no server-side unzip. ZIPs are read client-side with `jszip@3.10.1`
  (already a dependency) and streamed in small chunks so photo bytes are
  released to GC between chunks.

## DEPENDENCY: database migrations (apply to QA before use)

This UI is inert until the Import Center tables and audit actions exist:

1. **Migration 099** (`import_sources`, `import_jobs`, `import_collections`,
   `import_files` + owner-scoped RLS). Without it every `/api/import-center`
   call fails at the first table read.
2. **Migration 097** — extends the `client_access_audit` action CHECK with the
   `import_*` audit actions (`import_job_created`, `import_job_started`,
   `import_job_completed`, `import_job_cancelled`, `import_collection_imported`).
   Without it, audit inserts for import actions are rejected by the CHECK
   constraint. (097 is owned by the DB/metadata agent in this sprint.)

Apply ONLY to the QA project `icxitoczqtcgdkwiaxxc` per the sprint contract.
NEVER to prod or staging. NOTE: these migration files are not present in this
working copy checkout; they are authored/applied by the DB-owning agents. This
UI branch does not carry them.

## Decisions made in this workstream

- **Extra API action used:** `update_collection_progress` (already present in
  `api/import-center.ts`, beyond the original C7 action list). It is required
  because uploads run in the BROWSER, so per-collection checkpoints/bookkeeping
  must be pushed back to the server. `importApi.ts::reportCollectionProgress`
  wraps it. Documented here per the endpoint's own comment.
- **Duplicate policy:** only `skip` is implemented (content-hash + resume-name
  dedupe, never re-uploads, never deletes). `replace` and `create_copy` are
  shown DISABLED with honest "coming in a next version" labels.
- **Locale source:** the wizard uses its own `strings.ts` (`makeT`) for text and
  `useOwnerLocale()` only for the default locale/direction, matching the C8
  clarification (components keep a local strings module; Agent-OVERVIEW may
  merge them into `ownerLocale.ts` in wave 2).
- **No bugs found** in `importer.ts` / `import-center.ts` / `importApi.ts` /
  `zipRules.ts` during this workstream. No minimal fixes were needed; all
  required helpers were already exported. `tests/import-center.test.ts` exercises
  the real `server/importer.ts` exports (76 assertions, all green).

## File map (this module)

- `ImportCenter.tsx` — default-exported wizard shell + step router.
- `steps/Step1Explain.tsx` — truthful Pixieset export recipe (links/text only).
- `steps/Step2Csv.tsx` — CSV upload, server dry-run, per-collection mapping.
- `steps/Step3Zip.tsx` — client-side ZIP listing + auto-match + re-map.
- `steps/Step4Run.tsx` — run engine driver, pause/resume/cancel, dup policy.
- `steps/Step5Report.tsx` — counts, failures, retry-failed, open-gallery.
- `ui.tsx` — inline-styled presentational primitives (RTL-aware).
- `wizardTypes.ts` — shared wizard state shapes.
- `strings.ts` — he/en copy (pre-existing, extended as needed).
- `importApi.ts`, `zipRules.ts` — pre-existing data + validation layers.
