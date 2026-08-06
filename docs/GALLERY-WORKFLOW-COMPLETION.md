# Gallery Workflow Completion — design notes & deferrals

> RECONCILIATION NOTE (2026-08): to avoid a migration-number collision with main.download-tracking 088/089, the CPV2 chain was renumbered +2. Original 088-112 -> 090-114. Numbers below are the RECONCILED numbers; SQL bodies are byte-identical to the originals.

Branch: `feat/gallery-workflow-completion` (off `feat/client-portal-v2-overnight` @ `18aa55b`).
Migrations added: **112** (replace_image RPC), **113** (gallery_presets), **114** (draft-isolation hardening).

This document records the non-obvious design decisions and the items deliberately
deferred, so the follow-up work starts from a known position instead of re-deriving it.

---

## Replace photo — face-index invalidation (decided)

`replace_image` (migration 112) resets `images.face_indexed_at` / `face_count` to
NULL and **deletes every `image_faces` row** for the replaced image. Rationale:

- Recognition data belonging to the OLD pixels must not stay attributed to the
  photo after its bytes change. Clearing the rows + the indexed marker means the
  photo reads as "not indexed" and is picked up by the next face-index run, which
  re-detects faces on the NEW pixels.
- **Known limitation (documented, not a blocker):** the AWS Rekognition face
  vectors for the old pixels are keyed by `image_faces.rekognition_face_id` in the
  gallery's Rekognition collection. Dropping the DB rows does **not** delete those
  vectors from the AWS collection. They become orphaned (no DB row references
  them) until a collection reconciliation/rebuild. This is acceptable because
  search is driven by the DB rows; an orphaned vector can only ever match back to
  a deleted `image_faces` row, which no longer exists, so it cannot surface stale
  results. A future `DeleteFaces` call in the face-index worker (given the old
  `rekognition_face_id`s) would make cleanup immediate — tracked as a follow-up.

## Replace photo — fail-closed ordering (decided)

Upload new original → flip row (`replace_image`) → delete old object. A failure
before the flip leaves the row pointing at the original object (fully usable); a
failure of the flip deletes the just-uploaded object (no orphan). Only after the
flip commits is the old object removed. Content-addressed keys (hash embeds size +
lastModified) guarantee the new object never collides with the old one, so the two
coexist during the window between upload and flip.

---

## Deferred: Quick share photo (single-photo deep link)

**Status: deferred — cannot be done without weakening access gates.**

The goal was a link that opens the published gallery on a specific photo. The
blocker is that the public viewer's access model is gallery-scoped: a gallery is
gated as a whole (draft/private/password/client-assigned), and the viewer bootstrap
(`gallery_bootstrap`) enforces those gates before any image is returned. A
per-photo link has two unsafe shapes and one safe-but-incomplete shape:

1. **Signed URL to the original** — rejected. Persisting/serving a signed storage
   URL exposes the original bytes outside every gallery gate. Explicitly forbidden.
2. **Deep link that bypasses the gallery gate** — rejected. Any path that resolves
   a photo without re-running the gallery's password/client-assignment checks
   weakens access control.
3. **Deep link INTO the gated gallery, positioned on the photo** (e.g.
   `/{biz}/{slug}#photo=<id>`) — safe, but requires viewer work: the viewer must
   (a) run the normal gate, (b) validate the photo id belongs to that gallery, and
   (c) scroll/open the lightbox to it. This is the correct future implementation.

**Recommendation:** implement shape (3) in the public viewer as a follow-up. It
reuses `gallery_bootstrap` unchanged and adds only a client-side "focus this photo
id after the gate passes" behavior. No RLS change, no new storage exposure. It was
out of scope for this sprint because it touches the viewer, not the editor.

---

## Deferred / out of scope: cross-gallery photo copy

Explicitly out of scope. Recorded design constraints for when it is picked up:

- **Storage ownership** — originals are content-addressed under
  `{business}/{galleryId}/originals/...`. A copy must re-upload (or reference-count)
  the object under the destination gallery's path; you cannot simply re-point a row
  at another gallery's object (deleting the source gallery would break the copy).
- **Quotas / tokens** — a copy either consumes a token (new billable photo) or is
  explicitly free; this is a pricing decision, not a mechanical one.
- **Favourites / references** — favourites and any references key on `image_id`;
  a copy is a new id, so those do not carry over (correct), but the UX must make
  that clear.
- **Face index** — a copied photo needs its own `image_faces` rows in the
  destination gallery's Rekognition collection; it cannot share the source's.
- **Deletion semantics** — deleting either the source or the copy must not orphan
  or double-delete the shared bytes; reference-counting or full duplication must be
  chosen up front.

---

## Integration order with PR #214

`feat/client-portal-v2-overnight` (this branch's base) is Draft PR #214's branch.
This work sits on top of `18aa55b` (PR #216 already merged into it). Ordering:

1. **PR #214 first.** It carries migrations 090–105 (renumbered from 088–103) and the client-portal-v2 base.
2. **PR #216 next** (already merged into the CPV2 branch): migrations 106–111 (renumbered from 104–109).
3. **This branch last:** migrations **112**, **113**, **114** (numeric order; all are
   additive and independent of each other, but keep the sequence).

Because everything here branched from the current CPV2 HEAD, a Draft PR of
`feat/gallery-workflow-completion` targeting `feat/client-portal-v2-overnight`
merges cleanly with no rebase. Do not target `main` directly.

Migrations 112/113/114 are additive and reversible (each ships a `_rollback.sql`).
They have NOT been applied to Production or shared Staging.
