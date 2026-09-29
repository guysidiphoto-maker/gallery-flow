# Data layer

Every read/write to the Supabase backend should go through a function in this folder,
one module per thing (`galleries.ts`, `images.ts`, `businesses.ts` …). Components and hooks
call `getGalleryBySlug(...)`, not `supabase.from('galleries')...`. The client itself lives
in `shared/lib/supabase.ts`; login/session in `shared/lib/auth.ts`.

**Tables.** Supabase is Postgres with an auto-generated REST API. `supabase.from('images')
.select('id, width').eq('gallery_id', id)` is `SELECT id, width FROM images WHERE gallery_id = id`.
`a:b` in a select renames column `b` to `a` (e.g. `storage_path:web_preview_path`).

**Row Level Security (RLS).** The browser uses the public anon key, so Postgres itself
filters rows by the signed-in user. An owner's `from('galleries').select('*')` only returns
that owner's rows; an anonymous visitor gets only what a policy allows. No filter in
the code does not mean "all rows".

**RPCs.** `supabase.rpc('fn', { p_arg })` calls a Postgres function. RLS hides most
tables from guests (gallery viewers, client portal, vendors), so their reads are mostly RPCs
declared `SECURITY DEFINER`: they run with elevated rights and do their own check (password unlock
token, client session, vendor code). See `publicGallery.ts`, `clientPortal.ts`.

**Storage.** Files live in buckets (`gallery-images`, `gallery-stories` …) at paths like
`{business}/{galleryId}/...`. Public buckets are read by URL: `storageUrl()` / `displayUrl()`
(on-the-fly resize) in `shared/lib/supabase.ts`. When signed URLs are enabled,
`shared/lib/signedStorage.ts` asks our `/api/gallery-access` for short-lived ones instead.

Uploads, deletes and authenticated downloads go through `storage.ts`.

**Edge functions.** Server code run by Supabase, called with `supabase.functions.invoke`:
`rekognition` (selfie face search + face indexing, `faceSearch.ts`), `admin` (`admin.ts`),
`share-gallery` (`shareEmail.ts`) and `create-checkout` (`tokens.ts`).

**Owner modules.** The dashboard's reads/writes (`galleries`, `images`, `sections`, `stories`,
`presets`, `clients`, `search`, `activity`, `onboarding`, `tokens`) rely on RLS or on
self-scoped RPCs: they return only the signed-in owner's rows (a user id argument is a filter, never the security check).

**Error convention.** Table/RPC functions return Supabase's result untouched:
`const { data, error } = await listGallerySections(id)`. They never throw; the caller
decides what an error means. `data` is `null` on error, and `.maybeSingle()` reads give
`null` for "no row". Exceptions, documented on each function: `publicGallery.ts` retries
and returns plain values (`null`, `[]`, a status), and `fetchAllGalleryImages` throws.
