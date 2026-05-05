// Storage reaper. Pulls a batch of pending entries from
// storage_cleanup_queue, deletes the actual blobs from Supabase Storage,
// and marks the queue rows cleaned. Failures bump an attempt counter; rows
// that fail 5+ times are skipped on subsequent runs (manual review only).
//
// Invoke via:
//   - Supabase scheduled trigger (every 10 minutes is plenty)
//   - Manually: POST /storage-reaper with service-role auth
//
// Idempotent. Re-running while a previous invocation is in flight is safe;
// at worst the same row is attempted twice and the second delete becomes a
// no-op against an already-empty key.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const BATCH_SIZE = 200
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { data: rows, error: claimErr } = await sb.rpc('storage_cleanup_claim_batch', {
    p_limit: BATCH_SIZE,
  })
  if (claimErr) {
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, cleaned: 0 }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Group paths by bucket so we can use the bulk remove() API once per bucket.
  const byBucket = new Map<string, Array<{ id: string; path: string }>>()
  for (const r of rows as Array<{ id: string; bucket: string; storage_path: string }>) {
    const arr = byBucket.get(r.bucket) ?? []
    arr.push({ id: r.id, path: r.storage_path })
    byBucket.set(r.bucket, arr)
  }

  const cleanedIds: string[] = []
  const failures: Array<{ id: string; error: string }> = []

  for (const [bucket, items] of byBucket) {
    const paths = items.map(i => i.path)
    try {
      const { data, error } = await sb.storage.from(bucket).remove(paths)
      if (error) {
        // Whole-batch failure → bump counter on all of them.
        for (const it of items) failures.push({ id: it.id, error: error.message })
        continue
      }
      // remove() returns the keys it actually deleted; anything missing from
      // `data` was either already gone or rejected by the policy. Treat both
      // as "done" — re-attempting won't help.
      const removed = new Set((data ?? []).map(o => o.name))
      for (const it of items) {
        if (removed.has(it.path)) cleanedIds.push(it.id)
        else failures.push({ id: it.id, error: 'not present in remove() response' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      for (const it of items) failures.push({ id: it.id, error: msg })
    }
  }

  if (cleanedIds.length > 0) {
    await sb.rpc('storage_cleanup_mark_done', { p_ids: cleanedIds })
  }
  for (const f of failures) {
    await sb.rpc('storage_cleanup_mark_failed', { p_id: f.id, p_error: f.error })
  }

  return new Response(JSON.stringify({
    ok: true,
    claimed: rows.length,
    cleaned: cleanedIds.length,
    failed: failures.length,
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
})
