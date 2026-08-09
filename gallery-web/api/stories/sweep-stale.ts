// stories/sweep-stale.ts — scheduled reaper for orphaned Story Studio renders.
//
// The render endpoint reaps a stale in-flight row lazily (only when a NEW render
// is requested for the same gallery). This cron is the safety net for galleries
// nobody retries: it flips every 'queued'/'rendering' row older than the render
// ceiling to 'failed', so the in-flight unique index is never permanently held
// and the library never shows a render stuck "rendering" forever.
//
// Scheduled via vercel.json crons. Guarded so only Vercel Cron (or a caller with
// CRON_SECRET) can trigger it — it uses the service-role key.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''

// Must exceed vercel.json maxDuration for the render function (300s). Anything
// older is definitively an orphan, not a legitimately-running job.
const STALE_RENDER_MS = 6 * 60 * 1000

function isAuthorized(req: VercelRequest): boolean {
  // Vercel Cron sets this header on scheduled invocations.
  if (req.headers['x-vercel-cron']) return true
  if (CRON_SECRET) {
    const auth = req.headers.authorization || ''
    return auth === `Bearer ${CRON_SECRET}`
  }
  return false
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cutoff = new Date(Date.now() - STALE_RENDER_MS).toISOString()
  const { data: reaped, error } = await admin
    .from('story_renders')
    .update({ status: 'failed', error_message: 'render timed out (swept by cron)' })
    .in('status', ['queued', 'rendering'])
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    console.error('[stories/sweep-stale] failed', error.message)
    return res.status(500).json({ ok: false, error: 'sweep_failed' })
  }

  const count = reaped?.length ?? 0
  if (count > 0) console.warn(`[stories/sweep-stale] reaped ${count} stale render(s)`)
  return res.status(200).json({ ok: true, reaped: count })
}

export default withSentry('stories/sweep-stale', handler)
