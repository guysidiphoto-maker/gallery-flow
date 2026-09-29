// Cron safety net: render.ts only reaps a stale in-flight row when the same
// gallery renders again, so this fails every orphan past the render ceiling.
// Service-role, so only Vercel Cron or a CRON_SECRET bearer may call it.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import { serviceClient } from '../../server/supabase.js'

const CRON_SECRET = process.env.CRON_SECRET || ''

// Above the render function's maxDuration (300s): anything older is an orphan.
const STALE_RENDER_MS = 6 * 60 * 1000

function isAuthorized(req: VercelRequest): boolean {
  if (req.headers['x-vercel-cron']) return true
  if (CRON_SECRET) {
    const auth = req.headers.authorization || ''
    return auth === `Bearer ${CRON_SECRET}`
  }
  return false
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
  const admin = serviceClient()
  if (!admin) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

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
