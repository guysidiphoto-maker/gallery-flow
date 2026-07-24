// gallery-metadata.ts — owner-side write surface for gallery event metadata
// (Overnight 2026-07-24, contract C4). Single action:
//
//   POST { action: 'update_gallery_metadata', galleryId, ...fields }
//     fields: event_type?, event_location?, event_date?, event_size_bucket?,
//             industry?, venue_type?, time_of_day?, event_keywords?
//
// Security contract (same shape as api/client-admin.ts):
//   1. valid Supabase JWT (Bearer)                    → requireOwnerBusiness
//   2. business resolved from auth.uid() (never body) → requireOwnerBusiness
//   3. the target gallery belongs to that business (fail closed)
//   4. enum/length validation server-side (shared pure module) — matches the
//      CHECK constraints from migrations 064 + 097
//   5. audited to client_access_audit as 'gallery_metadata_updated' with only
//      the changed FIELD NAMES in metadata (never the values — could be PII)
//
// NULL values clear a field back to "Unclassified"; nothing is ever fabricated.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { requireOwnerBusiness } from '../server/clientAdmin.js'
import {
  validateGalleryMetadataPatch, galleryBelongsToBusiness, type GalleryDbLike,
} from '../src/components/tender/metadata.js'

export const maxDuration = 15

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null

// Same origin allowlist as api/client-admin.ts (kept local: that file is owned
// by another agent tonight and must not be edited).
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const h = new URL(origin).hostname
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app') ||
      h === 'pixflow.co.il' || h.endsWith('.pixflow.co.il') ||
      h === 'pixflow-ai.com' || h.endsWith('.pixflow-ai.com') ||
      h === 'eclipsemedia.co.il' || h.endsWith('.eclipsemedia.co.il')
  } catch { return false }
}

type Json = Record<string, unknown>
const bad = (res: VercelResponse, status: number, code: string, extra?: Json) =>
  res.status(status).json({ ok: false, error: code, ...(extra ?? {}) })

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { bad(res, 405, 'method_not_allowed'); return }
  if (!isAllowedOrigin(req.headers.origin as string | undefined)) { bad(res, 403, 'forbidden_origin'); return }
  if (!supabase) { bad(res, 500, 'supabase_not_configured'); return }

  const body = (req.body ?? {}) as Json
  const action = String(body.action ?? '')

  // Gate: valid JWT + resolve the caller's business (never trust body business_id).
  const owner = await requireOwnerBusiness(req, supabase)
  if (!owner.ok) { bad(res, owner.status, owner.code); return }
  const businessId = owner.businessId
  const actorUserId = owner.userId

  try {
    switch (action) {
      case 'update_gallery_metadata': {
        const galleryId = String(body.galleryId ?? '')
        if (!galleryId) return void bad(res, 400, 'galleryId_required')

        // Tenant check FIRST (fail closed before touching the payload).
        const target = await galleryBelongsToBusiness(
          supabase as unknown as GalleryDbLike, galleryId, businessId)
        if (!target.belongs) return void bad(res, 403, 'forbidden')

        // Validate enums + length caps server-side; whole patch rejected on
        // any invalid value (no partial applies).
        const v = validateGalleryMetadataPatch(body)
        if (!v.ok) return void bad(res, 400, v.error)

        const { error } = await supabase
          .from('galleries').update(v.patch)
          .eq('id', galleryId).eq('business_id', businessId)
        if (error) return void bad(res, 500, 'update_failed', { detail: error.message?.slice(0, 200) })

        // Audit with changed field NAMES only (values may identify people/venues).
        // 'gallery_metadata_updated' requires migration 097's extended CHECK; the
        // action type in server/clientAdmin.ts is owned by another agent tonight,
        // so we call the same append RPC directly. Audit failure is non-fatal
        // (matches appendAudit, which also ignores rpc errors).
        await supabase.rpc('append_client_audit', {
          p_business_id: businessId,
          p_client_id: target.clientId,
          p_actor_type: 'owner',
          p_actor_user_id: actorUserId,
          p_action: 'gallery_metadata_updated',
          p_target_type: 'gallery',
          p_target_id: galleryId,
          p_metadata: { fields: v.fields },
        })

        return void res.status(200).json({ ok: true, gallery_id: galleryId, fields: v.fields })
      }

      default:
        return void bad(res, 400, 'unknown_action')
    }
  } catch (e) {
    return void bad(res, 500, 'internal_error', { detail: (e as Error)?.message?.slice(0, 200) })
  }
}

export default withSentry('gallery-metadata', handler)
