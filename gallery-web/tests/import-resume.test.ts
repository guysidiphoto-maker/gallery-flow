// import-resume.test.ts — resuming a paused import must reuse created galleries,
// skip finished collections and not redo handled files.
// Run:  npx tsx tests/import-resume.test.ts

import { planResume, type RunMemory } from '../src/features/importer/resumePlan.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}
const emptyMemory = (): RunMemory => ({ galleryIds: new Map(), priorFiles: new Map(), finished: new Set() })

// Persisted checkpoint only (e.g. memory lost nothing yet).
{
  const persisted = {
    collections: [
      { id: 'a', target_gallery_id: 'g-a', status: 'imported' as const },
      { id: 'b', target_gallery_id: 'g-b', status: 'importing' as const },
      { id: 'c', target_gallery_id: null, status: 'pending' as const },
    ],
    files: [
      { collection_id: 'b', filename: '1.jpg', status: 'uploaded', content_hash: 'h1' },
      { collection_id: 'b', filename: '2.jpg', status: 'skipped_duplicate', content_hash: 'h1' },
      { collection_id: 'b', filename: '3.jpg', status: 'failed', content_hash: null },
    ],
  }
  const { targets, knownHashes } = planResume(['a', 'b', 'c'], persisted, emptyMemory())
  ok('imported collection is skipped', targets.get('a')!.skip)
  ok('in-progress collection reuses its gallery', targets.get('b')!.targetGalleryId === 'g-b' && !targets.get('b')!.skip)
  ok('uploaded file not redone', targets.get('b')!.priorFiles.get('1.jpg') === 'uploaded')
  ok('skipped file stays skipped', targets.get('b')!.priorFiles.get('2.jpg') === 'skipped_duplicate')
  ok('failed file is retried', !targets.get('b')!.priorFiles.has('3.jpg'))
  ok('untouched collection creates a gallery', targets.get('c')!.targetGalleryId === null)
  ok('hashes seed dedupe', knownHashes.has('h1') && knownHashes.size === 1)
}

// Checkpoint read failed: session memory alone prevents a duplicate gallery.
{
  const memory = emptyMemory()
  memory.galleryIds.set('b', 'g-mem')
  memory.priorFiles.set('b', new Map([['1.jpg', 'uploaded']]))
  memory.finished.add('a')
  const { targets } = planResume(['a', 'b'], null, memory)
  ok('memory: finished skipped', targets.get('a')!.skip)
  ok('memory: gallery reused', targets.get('b')!.targetGalleryId === 'g-mem')
  ok('memory: file not redone', targets.get('b')!.priorFiles.get('1.jpg') === 'uploaded')
}

// The in-flight chunk's checkpoint was lost: memory wins, and the map is shared.
{
  const memory = emptyMemory()
  memory.priorFiles.set('b', new Map([['5.jpg', 'uploaded']]))
  const persisted = {
    collections: [{ id: 'b', target_gallery_id: 'g-b', status: 'importing' as const }],
    files: [
      { collection_id: 'b', filename: '1.jpg', status: 'uploaded', content_hash: 'h1' },
      { collection_id: 'b', filename: '5.jpg', status: 'skipped_duplicate', content_hash: 'h5' },
    ],
  }
  const { targets } = planResume(['b'], persisted, memory)
  const prior = targets.get('b')!.priorFiles
  ok('merge: both sources kept', prior.get('1.jpg') === 'uploaded' && prior.size === 2)
  ok('merge: uploaded beats skipped', prior.get('5.jpg') === 'uploaded')
  ok('merge: memory holds the same map', memory.priorFiles.get('b') === prior)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
