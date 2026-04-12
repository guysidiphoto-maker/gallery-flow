import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── Boot-aware session storage ───────────────────────────────────────────────
// We persist the Supabase session in localStorage so the user stays signed in
// across normal app restarts, but tag it with the system boot time so a full
// reboot clears the session and forces a fresh sign-in.
//
// TODO: when this matures, switch to standard market behavior (long-lived
// refresh tokens, no boot-time invalidation).

const BOOT_TIME_KEY = 'pixflow.boot_time'
// Reading os.uptime() at slightly different moments yields slightly different
// computed boot times. A few seconds of slack avoids false invalidations.
const BOOT_TIME_TOLERANCE_MS = 10_000

type ElectronApi = {
  getSystemBootTime?: () => Promise<number | null>
}

// We cache the boot time once at module load so the storage adapter can stay
// fully synchronous. supabase-js calls setItem in tight paths where awaiting
// an IPC round-trip causes auth flows (signUp, signIn) to hang.
let cachedBootTime: number | null = null
;(function primeBootTime() {
  try {
    if (typeof window === 'undefined') return
    const api = (window as unknown as { api?: ElectronApi }).api
    if (!api?.getSystemBootTime) return
    api.getSystemBootTime().then(t => { cachedBootTime = t }).catch(() => { /* noop */ })
  } catch { /* noop */ }
})()

const bootAwareStorage = {
  getItem(key: string): string | null {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(key)
    if (!value) return null

    const storedBootRaw = localStorage.getItem(BOOT_TIME_KEY)
    const storedBoot = storedBootRaw ? Number(storedBootRaw) : NaN

    // If we can't verify (boot time not yet primed, or running outside
    // Electron), trust the stored value rather than logging the user out.
    if (!Number.isFinite(storedBoot) || cachedBootTime == null) return value

    if (Math.abs(cachedBootTime - storedBoot) > BOOT_TIME_TOLERANCE_MS) {
      // System was rebooted since the session was persisted — wipe it.
      try {
        localStorage.removeItem(key)
        localStorage.removeItem(BOOT_TIME_KEY)
      } catch { /* noop */ }
      return null
    }
    return value
  },

  setItem(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
    if (cachedBootTime != null) {
      localStorage.setItem(BOOT_TIME_KEY, String(cachedBootTime))
    }
  },

  removeItem(key: string): void {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: bootAwareStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
