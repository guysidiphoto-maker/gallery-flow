// upload-count.test.ts — regression proof that uploads and reads no longer cap
// at 1000. Offline (no real uploads). Run:  npx tsx tests/upload-count.test.ts
//
// Covers the exact scenario that lost 165 images (1,165 selected → 1,000 kept):
//   • partitionUploadFiles must NOT truncate at 999/1000/1001/1165.
//   • paginateAll must return every row across pages (the read cap that hid
//     >1000 images in the dashboard), incl. the exact-multiple boundary where a
//     naive loop stops one page early or loops forever.

import { partitionUploadFiles, MAX_UPLOAD_BATCH } from '../src/lib/uploadPipeline.ts'
import { paginateAll, IMAGES_PAGE } from '../src/lib/fetchAllImages.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// Minimal File-like stub accepted by validateUploadFile (jpeg, non-empty).
function fakeFiles(n: number): File[] {
  const arr: File[] = []
  for (let i = 0; i < n; i++) {
    arr.push({ name: `IMG_${i}.jpg`, type: 'image/jpeg', size: 1024, lastModified: i } as unknown as File)
  }
  return arr
}

// ── partitionUploadFiles: no truncation up to MAX_UPLOAD_BATCH ────────────────
for (const n of [999, 1000, 1001, 1165, 3000]) {
  const { valid, truncated } = partitionUploadFiles(fakeFiles(n))
  ok(`select ${n} → all ${n} kept, not truncated`, valid.length === n && truncated === false,
    `valid=${valid.length} truncated=${truncated}`)
}

// Guardrail still exists far above any real gallery, and it's VISIBLE not silent.
{
  const over = MAX_UPLOAD_BATCH + 250
  const { valid, truncated } = partitionUploadFiles(fakeFiles(over))
  ok(`select ${over} → capped at ${MAX_UPLOAD_BATCH} with truncated=true (surfaced)`,
    valid.length === MAX_UPLOAD_BATCH && truncated === true, `valid=${valid.length} truncated=${truncated}`)
}

// ── paginateAll: returns every row across pages ───────────────────────────────
// Fixture-backed fetchPage that serves `total` rows in IMAGES_PAGE-sized slices,
// and counts calls so we can assert the loop terminates correctly.
function pager(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  let calls = 0
  const fetchPage = async (from: number, to: number) => {
    calls++
    return { data: rows.slice(from, to + 1), error: null as unknown }
  }
  return { fetchPage, calls: () => calls }
}

for (const total of [0, 14, 999, 1000, 1001, 1165, 2500]) {
  const p = pager(total)
  const out = await paginateAll<{ id: number }>(p.fetchPage)
  const complete = out.length === total
  const noDupes = new Set(out.map(r => r.id)).size === total
  const inOrder = out.every((r, i) => r.id === i)
  ok(`paginate ${total} → all rows, ordered, no dupes`, complete && noDupes && inOrder,
    `got=${out.length} calls=${p.calls()}`)
}

// Exact-multiple boundary (1000): must fetch a 2nd (empty) page then stop —
// never stop one page early, never loop forever.
{
  const p = pager(1000)
  const out = await paginateAll<{ id: number }>(p.fetchPage)
  ok('paginate exactly 1000 → 1000 rows, exactly 2 page calls', out.length === 1000 && p.calls() === 2,
    `got=${out.length} calls=${p.calls()}`)
}

// Error propagates (a transient failure must not look like "end of data").
{
  let threw = false
  try {
    await paginateAll(async () => ({ data: null, error: new Error('boom') }))
  } catch { threw = true }
  ok('paginate surfaces errors (no silent truncation on failure)', threw)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
