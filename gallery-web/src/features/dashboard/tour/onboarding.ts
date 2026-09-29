// Per-user onboarding progress per (surface, version): DB table first,
// localStorage fallback, never throws. Visibility logic is pure so
// tests/tour.test.ts can cover it without a DOM.

export const TOUR_VERSION = 1

export type OnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed'

export interface OnboardingProgress {
  surface: string
  version: number
  status: OnboardingStatus
  step: number
}

const STATUSES: readonly OnboardingStatus[] = ['pending', 'in_progress', 'completed', 'dismissed']

// ─── Pure helpers (unit-tested, no I/O) ─────────────────────────────────────

export function storageKey(surface: string, version: number): string {
  return `pixflow-onboarding:${surface}:v${version}`
}

export function defaultProgress(surface: string, version: number = TOUR_VERSION): OnboardingProgress {
  return { surface, version, status: 'pending', step: 0 }
}

// Validate an untrusted value (DB row or parsed localStorage JSON) into a
// well-formed progress record, or null when it cannot be trusted.
export function normalizeProgress(raw: unknown, surface: string, version: number): OnboardingProgress | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const status = r.status
  if (typeof status !== 'string' || !STATUSES.includes(status as OnboardingStatus)) return null
  const stepNum = typeof r.step === 'number' && Number.isFinite(r.step) ? Math.floor(r.step) : 0
  return {
    surface,
    version,
    status: status as OnboardingStatus,
    step: Math.max(0, stepNum),
  }
}

export function clampStep(step: number, totalSteps: number): number {
  if (!Number.isFinite(step) || totalSteps <= 0) return 0
  return Math.min(Math.max(0, Math.floor(step)), totalSteps - 1)
}

// Show when there's no progress, an older version, or pending/in_progress
// (resuming at the saved step); hide when completed/dismissed. The caller
// ANDs this with its own owner-only `enabled` gate.
export function resolveVisibility(
  progress: OnboardingProgress | null,
  currentVersion: number = TOUR_VERSION,
): { show: boolean; startStep: number } {
  if (!progress) return { show: true, startStep: 0 }
  if (progress.version < currentVersion) return { show: true, startStep: 0 }
  if (progress.status === 'completed' || progress.status === 'dismissed') {
    return { show: false, startStep: 0 }
  }
  return { show: true, startStep: Math.max(0, progress.step) }
}

// ─── Injectable persistence (tests pass fakes; app uses the defaults) ───────

export interface OnboardingStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface OnboardingDb {
  fetch(surface: string, version: number): Promise<OnboardingProgress | null>
  save(progress: OnboardingProgress): Promise<void>
}

export interface OnboardingDeps {
  db?: OnboardingDb | null
  storage?: OnboardingStore | null
}

function readLocal(storage: OnboardingStore | null | undefined, surface: string, version: number): OnboardingProgress | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(storageKey(surface, version))
    if (!raw) return null
    return normalizeProgress(JSON.parse(raw), surface, version)
  } catch {
    return null
  }
}

function writeLocal(storage: OnboardingStore | null | undefined, progress: OnboardingProgress): void {
  if (!storage) return
  try {
    storage.setItem(
      storageKey(progress.surface, progress.version),
      JSON.stringify({ status: progress.status, step: progress.step }),
    )
  } catch { /* storage may be blocked; the DB (or defaults) still carry us */ }
}

// DB first, localStorage fallback, defaults last. Never throws.
export async function getProgressWith(
  deps: OnboardingDeps,
  surface: string,
  version: number = TOUR_VERSION,
): Promise<OnboardingProgress> {
  try {
    if (deps.db) {
      const fromDb = await deps.db.fetch(surface, version)
      if (fromDb) {
        // Mirror to localStorage so a later offline visit resumes correctly.
        writeLocal(deps.storage, fromDb)
        return fromDb
      }
    }
  } catch { /* table missing / offline / RLS: fall through */ }
  const fromLocal = readLocal(deps.storage, surface, version)
  if (fromLocal) return fromLocal
  return defaultProgress(surface, version)
}

// localStorage is written FIRST (synchronous, reliable), then the DB write is
// attempted best-effort. Never throws; returns the record that was persisted.
export async function saveProgressWith(
  deps: OnboardingDeps,
  surface: string,
  patch: { status: OnboardingStatus; step: number },
  version: number = TOUR_VERSION,
): Promise<OnboardingProgress> {
  const stepNum = typeof patch.step === 'number' && Number.isFinite(patch.step) ? Math.floor(patch.step) : 0
  const progress: OnboardingProgress = {
    surface,
    version,
    status: STATUSES.includes(patch.status) ? patch.status : 'in_progress',
    step: Math.max(0, stepNum),
  }
  writeLocal(deps.storage, progress)
  try {
    if (deps.db) await deps.db.save(progress)
  } catch { /* best effort; localStorage already holds the state */ }
  return progress
}

// ─── Default adapters (browser + Supabase) ──────────────────────────────────
// Supabase modules are imported LAZILY so importing this module in a bare
// node/tsx test never constructs a network client.

// The user id comes from the local session (no /auth/v1/user round trip);
// RLS still checks the JWT on every onboarding_progress query.
async function sessionUserId(): Promise<string | null> {
  const { supabase } = await import('@/shared/lib/supabase')
  const { data, error } = await supabase.auth.getSession()
  return error ? null : data.session?.user.id ?? null
}

const supabaseDb: OnboardingDb = {
  async fetch(surface, version) {
    const uid = await sessionUserId()
    if (!uid) return null
    const { getOnboardingProgress } = await import('@/shared/data/onboarding')
    const { data, error } = await getOnboardingProgress(uid, surface, version)
    if (error || !data) return null
    return normalizeProgress(data, surface, version)
  },
  async save(progress) {
    const uid = await sessionUserId()
    if (!uid) return
    const { upsertOnboardingProgress } = await import('@/shared/data/onboarding')
    await upsertOnboardingProgress({
      user_id: uid,
      surface: progress.surface,
      version: progress.version,
      status: progress.status,
      step: progress.step,
    })
  },
}

function browserStore(): OnboardingStore | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function defaultDeps(): OnboardingDeps {
  return { db: supabaseDb, storage: browserStore() }
}

// ─── Public app-facing API ──────────────────────────────────────────────────

export async function getProgress(surface: string): Promise<OnboardingProgress> {
  return getProgressWith(defaultDeps(), surface, TOUR_VERSION)
}

export async function saveProgress(
  surface: string,
  patch: { status: OnboardingStatus; step: number },
): Promise<OnboardingProgress> {
  return saveProgressWith(defaultDeps(), surface, patch, TOUR_VERSION)
}
