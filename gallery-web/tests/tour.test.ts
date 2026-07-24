// tour.test.ts: deterministic offline proof of the onboarding/tour state
// logic (contract C2). Run:
//   npx tsx tests/tour.test.ts
//
// Proves, WITHOUT network and WITHOUT a DOM:
//   • visibility rules: no record / pending / in_progress → show;
//     completed / dismissed → hide; version bump → show again from step 0
//   • step save + resume round-trip (in_progress at step N resumes at N)
//   • skip (dismissed) persists and keeps the tour hidden
//   • DB-first read with localStorage fallback, and mirror-to-local on DB hit
//   • fail-soft contract: throwing DB and throwing storage never throw out
//   • storage key + normalization of garbage input

import {
  TOUR_VERSION,
  storageKey,
  defaultProgress,
  normalizeProgress,
  resolveVisibility,
  clampStep,
  getProgressWith,
  saveProgressWith,
  type OnboardingDb,
  type OnboardingProgress,
  type OnboardingStore,
} from '../src/lib/onboarding.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── fakes ────────────────────────────────────────────────────────────────────

function makeStore(initial: Record<string, string> = {}): OnboardingStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v) },
  }
}

function makeDb(row: OnboardingProgress | null): OnboardingDb & { saved: OnboardingProgress[] } {
  const saved: OnboardingProgress[] = []
  return {
    saved,
    fetch: async () => row,
    save: async (p) => { saved.push(p) },
  }
}

const throwingDb: OnboardingDb = {
  fetch: async () => { throw new Error('relation "onboarding_progress" does not exist') },
  save: async () => { throw new Error('db down') },
}

const throwingStore: OnboardingStore = {
  getItem: () => { throw new Error('storage blocked') },
  setItem: () => { throw new Error('storage blocked') },
}

async function run() {
  // ── constants + pure helpers ──────────────────────────────────────────────
  ok('TOUR_VERSION is 1', TOUR_VERSION === 1)
  ok('storageKey matches the C2 contract format',
    storageKey('owner_tour', 1) === 'pixflow-onboarding:owner_tour:v1')
  ok('defaultProgress is pending at step 0',
    JSON.stringify(defaultProgress('owner_tour')) ===
    JSON.stringify({ surface: 'owner_tour', version: TOUR_VERSION, status: 'pending', step: 0 }))

  ok('normalizeProgress rejects garbage status',
    normalizeProgress({ status: 'wat', step: 2 }, 'owner_tour', 1) === null)
  ok('normalizeProgress rejects non-objects',
    normalizeProgress('nope', 'owner_tour', 1) === null && normalizeProgress(null, 'owner_tour', 1) === null)
  {
    const p = normalizeProgress({ status: 'in_progress', step: -4 }, 'owner_tour', 1)
    ok('normalizeProgress clamps negative step to 0', p !== null && p.step === 0, JSON.stringify(p))
  }
  {
    const p = normalizeProgress({ status: 'completed', step: 3.9 }, 'owner_tour', 1)
    ok('normalizeProgress floors fractional steps', p !== null && p.step === 3, JSON.stringify(p))
  }

  ok('clampStep clamps into [0, total-1]',
    clampStep(-1, 7) === 0 && clampStep(99, 7) === 6 && clampStep(3, 7) === 3 && clampStep(NaN, 7) === 0)

  // ── visibility rules ──────────────────────────────────────────────────────
  {
    const v = resolveVisibility(null)
    ok('no record → show from step 0', v.show === true && v.startStep === 0)
  }
  {
    const v = resolveVisibility({ surface: 's', version: TOUR_VERSION, status: 'pending', step: 0 })
    ok('pending → show', v.show === true && v.startStep === 0)
  }
  {
    const v = resolveVisibility({ surface: 's', version: TOUR_VERSION, status: 'in_progress', step: 4 })
    ok('in_progress at step 4 → show, resume at 4', v.show === true && v.startStep === 4)
  }
  {
    const v = resolveVisibility({ surface: 's', version: TOUR_VERSION, status: 'completed', step: 6 })
    ok('completed (current version) → hide', v.show === false)
  }
  {
    const v = resolveVisibility({ surface: 's', version: TOUR_VERSION, status: 'dismissed', step: 2 })
    ok('dismissed (current version) → hide', v.show === false)
  }
  {
    // Version bump: user completed v1, product ships v2 → show again from 0.
    const v = resolveVisibility({ surface: 's', version: 1, status: 'completed', step: 6 }, 2)
    ok('version bump → show again from step 0', v.show === true && v.startStep === 0)
  }

  // ── getProgressWith: DB first, localStorage fallback, defaults last ──────
  {
    const dbRow: OnboardingProgress = { surface: 'owner_tour', version: TOUR_VERSION, status: 'in_progress', step: 3 }
    const store = makeStore()
    const p = await getProgressWith({ db: makeDb(dbRow), storage: store }, 'owner_tour')
    ok('DB row wins when present', p.status === 'in_progress' && p.step === 3)
    ok('DB hit is mirrored to localStorage',
      store.map.get(storageKey('owner_tour', TOUR_VERSION)) === JSON.stringify({ status: 'in_progress', step: 3 }),
      String(store.map.get(storageKey('owner_tour', TOUR_VERSION))))
  }
  {
    const store = makeStore({
      [storageKey('owner_tour', TOUR_VERSION)]: JSON.stringify({ status: 'dismissed', step: 2 }),
    })
    const p = await getProgressWith({ db: throwingDb, storage: store }, 'owner_tour')
    ok('DB throws (table missing) → localStorage fallback', p.status === 'dismissed' && p.step === 2)
  }
  {
    const store = makeStore({ [storageKey('owner_tour', TOUR_VERSION)]: '{{{not json' })
    const p = await getProgressWith({ db: makeDb(null), storage: store }, 'owner_tour')
    ok('corrupt localStorage → clean default (pending, 0)', p.status === 'pending' && p.step === 0)
  }
  {
    const p = await getProgressWith({ db: throwingDb, storage: throwingStore }, 'owner_tour')
    ok('everything broken → still returns default, never throws',
      p.status === 'pending' && p.step === 0 && p.version === TOUR_VERSION)
  }

  // ── saveProgressWith: writes both layers, fail-soft on DB ────────────────
  {
    const store = makeStore()
    const db = makeDb(null)
    const p = await saveProgressWith({ db, storage: store }, 'owner_tour', { status: 'in_progress', step: 5 })
    ok('save returns the persisted record', p.status === 'in_progress' && p.step === 5 && p.version === TOUR_VERSION)
    ok('save writes localStorage',
      store.map.get(storageKey('owner_tour', TOUR_VERSION)) === JSON.stringify({ status: 'in_progress', step: 5 }))
    ok('save writes the DB with the full record',
      db.saved.length === 1 && db.saved[0].surface === 'owner_tour' && db.saved[0].step === 5 && db.saved[0].version === TOUR_VERSION)
  }
  {
    const store = makeStore()
    const p = await saveProgressWith({ db: throwingDb, storage: store }, 'owner_tour', { status: 'completed', step: 6 })
    ok('DB save throws → localStorage still written, no throw',
      p.status === 'completed' &&
      store.map.get(storageKey('owner_tour', TOUR_VERSION)) === JSON.stringify({ status: 'completed', step: 6 }))
  }
  {
    const store = makeStore()
    const p = await saveProgressWith({ db: null, storage: store }, 'owner_tour', { status: 'in_progress', step: -9 })
    ok('save clamps negative step to 0', p.step === 0)
  }

  // ── round-trips (what the component actually does) ───────────────────────
  {
    // Resume: save in_progress at 4, reload with a dead DB → resume at 4.
    const store = makeStore()
    await saveProgressWith({ db: throwingDb, storage: store }, 'owner_tour', { status: 'in_progress', step: 4 })
    const p = await getProgressWith({ db: throwingDb, storage: store }, 'owner_tour')
    const v = resolveVisibility(p)
    ok('save → reload resumes at the saved step', v.show === true && v.startStep === 4)
  }
  {
    // Skip: dismiss persists → never auto-shows again this version.
    const store = makeStore()
    await saveProgressWith({ db: makeDb(null), storage: store }, 'owner_tour', { status: 'dismissed', step: 1 })
    const p = await getProgressWith({ db: makeDb(null), storage: store }, 'owner_tour')
    ok('skip persists as dismissed → hidden', resolveVisibility(p).show === false)
  }
  {
    // Version bump with the versioned key: v1 state is invisible to v2 reads,
    // so a bumped tour starts clean (pending → shows).
    const store = makeStore()
    await saveProgressWith({ db: null, storage: store }, 'owner_tour', { status: 'completed', step: 6 }, 1)
    const p2 = await getProgressWith({ db: null, storage: store }, 'owner_tour', 2)
    ok('bumped version reads a clean slate → shows again',
      p2.status === 'pending' && resolveVisibility(p2, 2).show === true)
    ok('v1 and v2 use distinct storage keys',
      storageKey('owner_tour', 1) !== storageKey('owner_tour', 2))
  }
  {
    // Restart: RestartTourButton writes pending/0 → visible from the top.
    const store = makeStore()
    await saveProgressWith({ db: null, storage: store }, 'owner_tour', { status: 'dismissed', step: 5 })
    await saveProgressWith({ db: null, storage: store }, 'owner_tour', { status: 'pending', step: 0 })
    const p = await getProgressWith({ db: null, storage: store }, 'owner_tour')
    const v = resolveVisibility(p)
    ok('restart (pending/0 overwrite) → shows from step 0', v.show === true && v.startStep === 0)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run()
