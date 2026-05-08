// backfill-public-thumbs — Phase 4.2
//
// Copies thumbnails from `gallery-images` to `gallery-images-thumbs-public` at
// the SAME key, and sets `images.public_thumb_present = true` on success.
// Idempotent: re-running just skips rows already flagged true.
//
// Auth: service-role only. The Authorization bearer must equal
// SUPABASE_SERVICE_ROLE_KEY. Anon and photographer JWTs are rejected.
//
// Input (POST JSON, all optional):
//   { batchSize?: number, businessId?: string, galleryId?: string }
//   - batchSize defaults to 200, capped at 500.
//   - businessId / galleryId narrow the work to a single owner / gallery.
//
// Output:
//   { processed, succeeded, failed, errors, remaining }
//   - errors is an array of { imageId, message } (truncated to 20 entries).
//   - remaining = count of rows still needing the flag flipped after this run.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRIVATE_BUCKET = 'gallery-images'
const PUBLIC_BUCKET  = 'gallery-images-thumbs-public'
const DEFAULT_BATCH = 200
const MAX_BATCH = 500
const CONCURRENCY = 6

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function requireServiceRole(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('unauthorized')
  }
}

interface Row {
  id: string
  gallery_id: string
  thumbnail_path: string
}

async function copyOne(
  sb: SupabaseClient,
  row: Row,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error: dlErr } = await sb.storage
    .from(PRIVATE_BUCKET)
    .download(row.thumbnail_path)
  if (dlErr || !data) {
    return { ok: false, message: `download: ${dlErr?.message ?? 'no data'}` }
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  const { error: upErr } = await sb.storage
    .from(PUBLIC_BUCKET)
    .upload(row.thumbnail_path, bytes, {
      upsert: true,
      contentType: 'image/jpeg',
    })
  if (upErr) {
    return { ok: false, message: `upload: ${upErr.message}` }
  }
  const { error: updErr } = await sb
    .from('images')
    .update({ public_thumb_present: true })
    .eq('id', row.id)
  if (updErr) {
    return { ok: false, message: `flag: ${updErr.message}` }
  }
  return { ok: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    requireServiceRole(req)
  } catch {
    return json({ error: 'unauthorized' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const batchSize = Math.min(
    Math.max(1, Number(body.batchSize) || DEFAULT_BATCH),
    MAX_BATCH,
  )
  const businessId: string | undefined = body.businessId
  const galleryId: string | undefined = body.galleryId

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Find candidates. We narrow by gallery if asked, otherwise by business
  // (joining via galleries), otherwise the whole table.
  let query = sb
    .from('images')
    .select('id, gallery_id, thumbnail_path, galleries!inner(business_id)')
    .eq('public_thumb_present', false)
    .not('thumbnail_path', 'is', null)
    .order('id', { ascending: true })
    .limit(batchSize)

  if (galleryId) {
    query = query.eq('gallery_id', galleryId)
  } else if (businessId) {
    query = query.eq('galleries.business_id', businessId)
  }

  const { data: rows, error: qErr } = await query
  if (qErr) {
    return json({ error: 'query_failed', detail: qErr.message }, 500)
  }
  const candidates = (rows ?? []) as unknown as Row[]

  let succeeded = 0
  let failed = 0
  const errors: Array<{ imageId: string; message: string }> = []

  let cursor = 0
  const running = new Set<Promise<void>>()
  const runOne = async (row: Row) => {
    const r = await copyOne(sb, row)
    if (r.ok) {
      succeeded += 1
    } else {
      failed += 1
      if (errors.length < 20) errors.push({ imageId: row.id, message: r.message })
    }
  }

  while (cursor < candidates.length || running.size > 0) {
    while (cursor < candidates.length && running.size < CONCURRENCY) {
      const p = runOne(candidates[cursor++]).then(() => { running.delete(p) })
      running.add(p)
    }
    if (running.size > 0) await Promise.race(running)
  }

  const { count: remaining } = await sb
    .from('images')
    .select('id', { count: 'exact', head: true })
    .eq('public_thumb_present', false)
    .not('thumbnail_path', 'is', null)

  return json({
    processed: candidates.length,
    succeeded,
    failed,
    errors,
    remaining: remaining ?? null,
  })
})
