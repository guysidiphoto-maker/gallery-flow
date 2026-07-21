// dedupe-upload.test.ts — proves the duplicate-safe re-upload classifier.
// Run:  npx tsx tests/dedupe-upload.test.ts
//
// Scenarios required for safely restoring the missing 165 images:
//   • re-upload the same 1,165 → 1,000 duplicates skipped, 165 new
//   • upload only the missing 165 → all new
//   • two different images with the same filename → NOT skipped (review)
//   • same filename in different folders → treated independently, not collapsed
//   • interrupted upload + retry → already-stored files dedupe on retry

import { classifyForUpload, extractExistingKeys, contentKey } from '../src/lib/dedupeUpload.ts'
import { pathHash } from '../src/lib/uploadPipeline.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

const GID = 'gallery-abc'

function file(name: string, size: number, lastModified: number): File {
  return { name, size, lastModified, type: 'image/jpeg' } as unknown as File
}

// Build an existing image row exactly as the upload pipeline would store it:
// path = <slug>/<gid>/originals/<hash8>_<name>, filename = name.
function existingFrom(f: File) {
  const h = pathHash(`${GID}/${f.name}/${f.size}/${f.lastModified}`)
  return {
    filename: f.name,
    storage_path: `slug/${GID}/originals/${h}_${f.name}`,
    original_path: `slug/${GID}/originals/${h}_${f.name}`,
  }
}

// A gallery that already has 1,000 images (files 0..999).
const original1165 = Array.from({ length: 1165 }, (_, i) => file(`IMG_${i}.jpg`, 1000 + i, 1_700_000 + i))
const stored1000 = original1165.slice(0, 1000).map(existingFrom)
const keys = extractExistingKeys(stored1000)

// 1) Re-upload the SAME 1,165 → 1,000 dup, 165 new, 0 review.
{
  const c = classifyForUpload(original1165, GID, keys)
  ok('re-upload 1,165 → 165 new', c.newFiles.length === 165, `new=${c.newFiles.length}`)
  ok('re-upload 1,165 → 1,000 duplicates skipped', c.duplicates.length === 1000, `dup=${c.duplicates.length}`)
  ok('re-upload 1,165 → 0 review', c.review.length === 0, `review=${c.review.length}`)
  const restored = c.newFiles.map(f => f.name).sort()
  const expected = original1165.slice(1000).map(f => f.name).sort()
  ok('re-upload restores exactly the missing 165', JSON.stringify(restored) === JSON.stringify(expected))
}

// 2) Upload ONLY the missing 165 → all new, none skipped.
{
  const missing = original1165.slice(1000)
  const c = classifyForUpload(missing, GID, keys)
  ok('upload only missing 165 → all 165 new', c.newFiles.length === 165 && c.duplicates.length === 0 && c.review.length === 0)
}

// 3) Two DIFFERENT images with the SAME filename → review, never silent skip.
{
  const existing = [existingFrom(file('DSC1.jpg', 500, 111))]
  const k = extractExistingKeys(existing)
  const differentSameName = file('DSC1.jpg', 999, 222) // same name, different size+mtime
  const c = classifyForUpload([differentSameName], GID, k)
  ok('different photo, same filename → review (not duplicate)',
    c.review.length === 1 && c.duplicates.length === 0 && c.newFiles.length === 0)
}

// 3b) EXACT same file (name+size+mtime) → duplicate.
{
  const f = file('DSC2.jpg', 700, 333)
  const k = extractExistingKeys([existingFrom(f)])
  const c = classifyForUpload([file('DSC2.jpg', 700, 333)], GID, k)
  ok('identical file → duplicate', c.duplicates.length === 1 && c.newFiles.length === 0)
}

// 4) Same filename in different folders (basenames collide) selected together —
// evaluated independently; different content → not collapsed into one.
{
  const k = extractExistingKeys([]) // empty gallery
  const a = file('cover.jpg', 100, 1)  // "folderA/cover.jpg"
  const b = file('cover.jpg', 200, 2)  // "folderB/cover.jpg"
  const c = classifyForUpload([a, b], GID, k)
  ok('same-name different-content both upload (not collapsed)', c.newFiles.length === 2,
    `new=${c.newFiles.length} keysDiffer=${contentKey(GID, a) !== contentKey(GID, b)}`)
}

// 5) Interrupted upload + retry: say 600/1000 got stored before a crash. Retry
// with the full 1,000 → the 600 already stored dedupe, 400 remain new.
{
  const partial = original1165.slice(0, 1000)
  const stored600 = partial.slice(0, 600).map(existingFrom)
  const k = extractExistingKeys(stored600)
  const c = classifyForUpload(partial, GID, k)
  ok('retry after interruption → only the un-stored 400 re-upload',
    c.newFiles.length === 400 && c.duplicates.length === 600, `new=${c.newFiles.length} dup=${c.duplicates.length}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
