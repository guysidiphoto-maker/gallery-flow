# Gallery Assignment — Integration Guide (Agent-ASSIGN, 2026-07-24)

For the wave-2 integrator (Agent-OVERVIEW). Nothing here touches `Dashboard.tsx` or `main.tsx`; this doc tells you exactly how to wire it.

## What shipped

| File | What it is |
|---|---|
| `src/components/assignment/AssignClientField.tsx` | Default export. Self-contained searchable client picker (fetches its own list, inline client creation, "no client yet" option). Reusable anywhere. |
| `src/components/assignment/BulkAssignView.tsx` | Default export. Full assignment workspace: multi-select, bulk assign, filters, visibility indicators, reassign/unassign confirms, preview-as-client. Already wired into `ClientsManager.tsx` (assign view) — no further nav work needed for it. |
| `src/components/assignment/visibility.ts` | Pure `computeVisibilityIndicator(gallery, clientActiveMembers)` helper (tested offline). |
| `src/components/assignment/strings.ts` | Local he/en strings (`t(locale, key)`, `dirFor(locale)`). |
| `api/client-admin.ts` | New action `bulk_assign_galleries { clientId, galleryIds[] }` (cap 200). |
| `server/clientAdmin.ts` | `validateBulkAssignInput`, `runBulkAssign`, `BULK_ASSIGN_MAX` (offline-tested). |
| `src/components/clients/api.ts` | `bulkAssignGalleries()` wrapper + `BulkAssignSummary`/`BulkAssignItemResult` types. |
| `tests/assignment.test.ts` | 34 offline assertions (`npx tsx tests/assignment.test.ts`). |

`src/components/clients/GalleryAssignmentView.tsx` is SUPERSEDED by BulkAssignView (ClientsManager no longer imports it). Safe to delete once Preview is verified.

## 1. AssignClientField in the Dashboard new-gallery modal

Prop contract:

```tsx
import AssignClientField from '../components/assignment/AssignClientField'

const [newGalleryClientId, setNewGalleryClientId] = useState<string | null>(null)

<AssignClientField
  value={newGalleryClientId}                 // string | null (null = "no client yet")
  onChange={(clientId) => setNewGalleryClientId(clientId)}
  allowCreateInline                          // shows the "create new client" mini-form (createClientReq, NO invite)
  locale="he"                                // 'he' (default, RTL) | 'en' — see i18n note below
/>
```

Rules the integrator MUST keep:

- **Never block gallery creation/upload on a client.** "No client yet" (null) is a first-class value. If `newGalleryClientId` is null, create the gallery exactly as today and do nothing else.
- **Where the assignment call happens:** AFTER the gallery insert succeeds (you have the new gallery id) and BEFORE/independent of the upload pipeline:

```tsx
import { assignGallery } from '../components/clients/api'

const { data: created } = await supabase.from('galleries').insert({...}).select('id').single()
if (newGalleryClientId && created?.id) {
  const res = await assignGallery({ galleryId: created.id, clientId: newGalleryClientId })
  if (!res.ok) showToast({ kind: 'error', text: errorText(res.error) }) // gallery still exists; owner can assign later
}
// proceed to upload regardless of assignment outcome
```

- Assignment failure must NOT roll back or block anything — the gallery stays, uploads proceed, the owner can assign later from the Clients screen.
- The field is fully self-contained (own fetch, loading, error+retry). Do not pass it a client list.
- Inline creation calls `create_client` with no invite and immediately selects the new client; parent state (form fields, staged files) is untouched.

## 2. AssignClientField in the post-upload settings tab

Same component, seeded with the gallery's current `client_id`:

```tsx
<AssignClientField
  value={gallery.client_id ?? null}
  onChange={async (clientId) => {
    if (clientId === gallery.client_id) return
    const res = clientId === null
      ? await unassignGallery(gallery.id)
      : await assignGallery({ galleryId: gallery.id, clientId }) // server audits reassign automatically
    if (res.ok) refreshGallery()
    else showToast({ kind: 'error', text: errorText(res.error) })
  }}
  allowCreateInline
/>
```

If the change moves the gallery away from an existing client, wrap in a confirm first (copy pattern from `BulkAssignView.submitAssign`). Assigning an already-assigned gallery to the same client is a server-side no-op.

## 3. BulkAssignView nav notes

- Already reachable: Clients screen → "שיוך גלריות" button (`ClientsManager` view `{kind:'assign'}`). No Dashboard/main.tsx change required.
- If you want a direct Dashboard nav entry, render `<BulkAssignView businessSlug={businessSlug} onBack={...} showToast={...} />` inside the shell; it needs a Toast host (`useToast`) in the parent.
- "Preview as client" links use `portalUrl(businessSlug, clientId)` exported from `src/components/clients/ClientDetailView.tsx` (`/{businessSlug}/client/{clientId}`, falls back to `/client/{clientId}`). It is the existing PUBLIC client page — a preview, not impersonation.

## 4. Bulk API contract

`POST /api/client-admin` `{ action:'bulk_assign_galleries', clientId, galleryIds: string[] }`

- Cap: 200 ids per call (after dedupe) → `400 too_many_galleries`. Strict input: any non-string/empty entry → `400 invalid_galleryIds`.
- Cross-business client → `403 forbidden` (and the RPC re-verifies per gallery).
- Response: `{ ok:true, client_id, total, assigned, reassigned, unchanged, failed, results:[{galleryId, ok, reassigned?, unchanged?, error?}] }`.
- Per-item error isolation: one bad gallery never aborts the rest.
- Idempotent: already-assigned-to-same-client → `ok:true, unchanged:true`.

## 5. Decisions made (and why)

1. **No-ops are not audited.** `bulk_assign_galleries` audits `gallery_assigned` / `gallery_reassigned` (with `metadata.bulk:true`, and `previous_client_id` on reassign) only for real state transitions. Re-running the same bulk call is safe and leaves no duplicate ledger noise.
2. **Local strings.ts instead of `src/lib/ownerLocale.ts`** (contract C8 wave-1 rule): ownerLocale is created concurrently by Agent-TOUR, so these components take a `locale` prop (default `'he'`, RTL via `dirFor`). Wave-2: pass `useOwnerLocale().locale` into the `locale` prop — no key migration required (or merge the keys, they are flat and prefixed `assign.` / `bulk.`).
3. **Visibility indicator does not speculate.** `computeVisibilityIndicator` returns `unassigned` → `not_published` → `no_active_members` (first match). An UNKNOWN active-member count (overview not loaded) returns null rather than a false alarm; only an explicit 0 triggers the member reason.
4. **BulkAssignView replaces GalleryAssignmentView** inside ClientsManager rather than editing it in place — smaller blast radius, the old file remains as reference until Preview verification.
5. **ClientDetailView** gained trivial All/Published/Draft quick filters plus the same "not visible to client" badge (all its galleries are by definition assigned, so assigned/unassigned filters would be meaningless there).
6. **No rate limit on bulk assign**: it is a single audited owner action on owned rows, consistent with the existing single `assign_gallery` action (rate limits stay reserved for invite/reset abuse surfaces).
