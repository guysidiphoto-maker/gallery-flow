// replace-photo.test.ts — contract guard for the "Replace photo" P0.
//
// Two surfaces are asserted here without a live DB (matching this repo's
// offline regression-guard style):
//   1. migration 110 (replace_image RPC) — ownership, least-privilege grants,
//      identity preservation, face-index invalidation, old-path return.
//   2. replacePhoto.ts — the fail-closed ordering that guarantees a failed
//      replace never orphans the live object or breaks the original.
// Run: npx tsx tests/replace-photo.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const mig = readFileSync(resolve(root, 'supabase/migrations/112_replace_image_rpc.sql'), 'utf8')
const migBody = mig.replace(/--[^\n]*/g, '') // strip comments
const lib = readFileSync(resolve(here, '..', 'src/lib/replacePhoto.ts'), 'utf8')
const pipeline = readFileSync(resolve(here, '..', 'src/lib/uploadPipeline.ts'), 'utf8')

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── Migration 110: authz + grants ────────────────────────────────────────────
ok('rejects null auth.uid()', /auth\.uid\(\)\s+IS\s+NULL[\s\S]*?not_authenticated/.test(migBody))
ok('checks owner user against auth.uid()', /v_owner_user\s*<>\s*auth\.uid\(\)[\s\S]*?not_authorized/.test(migBody))
ok('scopes image lookup to the gallery (cross-gallery guard)',
  /FROM images\s+WHERE id = p_image_id AND gallery_id = p_gallery_id/.test(migBody))
ok('UPDATE is scoped to id AND gallery_id',
  /UPDATE images SET[\s\S]*?WHERE id = p_image_id AND gallery_id = p_gallery_id/.test(migBody))
ok('grants authenticated + service_role',
  /GRANT\s+EXECUTE ON FUNCTION public\.replace_image\b[^;]*TO authenticated/.test(migBody) &&
  /GRANT\s+EXECUTE ON FUNCTION public\.replace_image\b[^;]*TO service_role/.test(migBody))
ok('revokes anon + PUBLIC',
  /REVOKE EXECUTE ON FUNCTION public\.replace_image\b[^;]*FROM anon/.test(migBody) &&
  /REVOKE EXECUTE ON FUNCTION public\.replace_image\b[^;]*FROM PUBLIC/.test(migBody))
ok('is SECURITY DEFINER with pinned search_path',
  /SECURITY DEFINER SET search_path = public/.test(migBody))

// ── Migration 110: identity preservation ─────────────────────────────────────
const updateBlock = (migBody.match(/UPDATE images SET([\s\S]*?)WHERE id = p_image_id/) || [,''])[1]
ok('does NOT reassign sort_order', !/\bsort_order\s*=/.test(updateBlock))
ok('does NOT reassign section_id', !/\bsection_id\s*=/.test(updateBlock))
ok('does NOT reassign is_top_pick', !/\bis_top_pick\s*=/.test(updateBlock))
ok('does NOT reassign gallery_id', !/\bgallery_id\s*=/.test(updateBlock))
ok('swaps all three path columns', /web_preview_path\s*=/.test(updateBlock) &&
  /thumbnail_path\s*=/.test(updateBlock) && /original_path\s*=/.test(updateBlock))

// ── Migration 110: face-index invalidation ───────────────────────────────────
ok('resets face_indexed_at to NULL', /face_indexed_at\s*=\s*NULL/.test(updateBlock))
ok('resets face_count to NULL', /face_count\s*=\s*NULL/.test(updateBlock))
ok('deletes old image_faces rows', /DELETE FROM image_faces WHERE image_id = p_image_id/.test(migBody))

// ── Migration 110: returns old paths + cover hint ────────────────────────────
ok('returns old paths for storage cleanup',
  /old_web_path/.test(migBody) && /old_original_path/.test(migBody))
ok('returns was_cover hint', /was_cover/.test(migBody))
ok('does NOT consume a token (no business_tokens UPDATE)', !/business_tokens/.test(migBody))

// ── replacePhoto.ts: fail-closed ordering ────────────────────────────────────
const iUpload = lib.indexOf('uploadReplacementOriginal')
const iRpc = lib.indexOf("rpc('replace_image'")
const iCleanup = lib.lastIndexOf('removeObjects')
ok('uploads new original BEFORE the DB flip', iUpload > 0 && iRpc > 0 && iUpload < iRpc)
ok('deletes old objects AFTER the DB flip', iCleanup > iRpc)
ok('on RPC failure, removes the just-uploaded object (no orphan)',
  /error \|\| !data[\s\S]*?removeObjects\(\[newPath\]\)/.test(lib))
ok('never deletes the new object during cleanup', /p !== newPath/.test(lib))
ok('validates the file with the shared upload gate', /validateUploadFile\(file\)/.test(lib))

// ── cover re-point happens BEFORE old-object cleanup (no 404-cover window) ────
const iRepoint = lib.indexOf('onRepointCover(newPath)')
ok('re-points the cover before deleting old objects',
  iRepoint > iRpc && iRepoint < iCleanup, `repoint=${iRepoint} rpc=${iRpc} cleanup=${iCleanup}`)
ok('cover re-point only runs when the replaced image was the cover',
  /result\.was_cover && opts\.onRepointCover/.test(lib))
// ── cleanup also removes the stale public-thumb copy ─────────────────────────
ok('cleanup covers the public thumbs bucket too',
  /gallery-images-thumbs-public/.test(lib) && /CLEANUP_BUCKETS/.test(lib))

// ── uploadPipeline: replacement helper does not record a row / consume token ──
const helper = (pipeline.match(/export async function uploadReplacementOriginal[\s\S]*?\n}/) || [''])[0]
ok('uploadReplacementOriginal does NOT call record_image_upload',
  helper.length > 0 && !/record_image_upload/.test(helper))
ok('uploadReplacementOriginal is content-addressed (embeds size + lastModified)',
  /pathHash\(`\$\{galleryId\}\/\$\{file\.name\}\/\$\{file\.size\}\/\$\{file\.lastModified\}`\)/.test(helper))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
