// assignment.test.ts — offline proofs for bulk gallery assignment + the
// portal-visibility indicator.
//   npx tsx tests/assignment.test.ts

import {
  BULK_ASSIGN_MAX, validateBulkAssignInput, runBulkAssign, clientBelongsToBusiness,
} from '../server/clientAdmin.js'
import { computeVisibilityIndicator } from '../src/components/assignment/visibility.js'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── Mock supabase for runBulkAssign ─────────────────────────────────────────
// cpv2_assign_gallery behavior is scripted per gallery id; append_client_audit
// calls are recorded so the audit contract is provable.

type AssignScript = { prev?: string | null; error?: string }
function makeBulkSupabase(script: Record<string, AssignScript>) {
  const audits: Array<{ action: string; targetId: string; metadata: Record<string, unknown> }> = []
  const supabase: any = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'cpv2_assign_gallery') {
        const s = script[String(args.p_gallery_id)] ?? {}
        if (s.error) return { data: null, error: { message: s.error } }
        return { data: { previous_client_id: s.prev ?? null }, error: null }
      }
      if (name === 'append_client_audit') {
        audits.push({
          action: String(args.p_action),
          targetId: String(args.p_target_id),
          metadata: (args.p_metadata ?? {}) as Record<string, unknown>,
        })
        return { data: null, error: null }
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    },
  }
  return { supabase, audits }
}

function makeClientCheckSupabase(found: boolean): any {
  const builder: any = {
    select: () => builder, eq: () => builder,
    maybeSingle: async () => ({ data: found ? { id: 'c1' } : null }),
  }
  return { from: () => builder }
}

async function run() {
  // ── validateBulkAssignInput ────────────────────────────────────────────────
  ok('cap constant is 200', BULK_ASSIGN_MAX === 200)
  {
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: ['g1', 'g2'] })
    ok('valid input accepted', v.ok === true && v.ok && v.input.clientId === 'c1' && v.input.galleryIds.length === 2)
  }
  {
    const v = validateBulkAssignInput({ galleryIds: ['g1'] })
    ok('missing clientId rejected', v.ok === false && v.code === 'clientId_required')
  }
  {
    const v = validateBulkAssignInput({ clientId: '   ', galleryIds: ['g1'] })
    ok('blank clientId rejected', v.ok === false && v.code === 'clientId_required')
  }
  {
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: [] })
    ok('empty galleryIds rejected', v.ok === false && v.code === 'galleryIds_required')
  }
  {
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: 'g1' as unknown })
    ok('non-array galleryIds rejected', v.ok === false && v.code === 'galleryIds_required')
  }
  {
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: ['g1', 42] as unknown[] })
    ok('non-string entry rejects whole call', v.ok === false && v.code === 'invalid_galleryIds')
  }
  {
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: ['g1', ''] })
    ok('empty-string entry rejects whole call', v.ok === false && v.code === 'invalid_galleryIds')
  }
  {
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: ['g1', 'g1', ' g1 ', 'g2'] })
    ok('duplicates deduped', v.ok === true && v.ok && v.input.galleryIds.length === 2)
  }
  {
    const ids = Array.from({ length: 201 }, (_, i) => `g${i}`)
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: ids })
    ok('201 unique ids rejected (cap)', v.ok === false && v.code === 'too_many_galleries')
  }
  {
    // 250 raw entries but only 200 unique — cap applies AFTER dedupe.
    const ids = [...Array.from({ length: 200 }, (_, i) => `g${i}`), ...Array.from({ length: 50 }, (_, i) => `g${i}`)]
    const v = validateBulkAssignInput({ clientId: 'c1', galleryIds: ids })
    ok('cap applies after dedupe', v.ok === true && v.ok && v.input.galleryIds.length === 200)
  }

  // ── runBulkAssign: fresh assign / reassign / idempotent / error isolation ──
  {
    const { supabase, audits } = makeBulkSupabase({
      g1: { prev: null },              // fresh assign
      g2: { prev: 'other-client' },    // reassign
      g3: { prev: 'target' },          // already assigned to target → no-op
      g4: { error: 'gallery_not_in_business' }, // per-item failure
      g5: { prev: null },              // must still succeed after g4 failed
    })
    const s = await runBulkAssign(supabase, {
      businessId: 'biz', actorUserId: 'u1', clientId: 'target',
      galleryIds: ['g1', 'g2', 'g3', 'g4', 'g5'],
    })
    ok('summary total', s.total === 5)
    ok('summary counts', s.assigned === 2 && s.reassigned === 1 && s.unchanged === 1 && s.failed === 1)
    const byId = new Map(s.results.map(r => [r.galleryId, r]))
    ok('fresh assign ok', byId.get('g1')?.ok === true && byId.get('g1')?.reassigned === false)
    ok('reassign flagged', byId.get('g2')?.ok === true && byId.get('g2')?.reassigned === true)
    ok('idempotent no-op ok+unchanged', byId.get('g3')?.ok === true && byId.get('g3')?.unchanged === true)
    ok('failed item isolated with error', byId.get('g4')?.ok === false && String(byId.get('g4')?.error).includes('gallery_not_in_business'))
    ok('item after failure still processed', byId.get('g5')?.ok === true)

    // Audit contract: one row per state CHANGE, correct action names, no row
    // for the idempotent no-op or the failure.
    ok('audit count = state changes only', audits.length === 3, `got ${audits.length}`)
    const a1 = audits.find(a => a.targetId === 'g1')
    const a2 = audits.find(a => a.targetId === 'g2')
    ok('fresh assign audited as gallery_assigned', a1?.action === 'gallery_assigned' && a1?.metadata.bulk === true)
    ok('reassign audited as gallery_reassigned with prev', a2?.action === 'gallery_reassigned' && a2?.metadata.previous_client_id === 'other-client')
    ok('no audit for no-op', !audits.some(a => a.targetId === 'g3'))
    ok('no audit for failed item', !audits.some(a => a.targetId === 'g4'))
  }

  // runBulkAssign survives a THROWING rpc (not just an error return).
  {
    const { supabase, audits } = makeBulkSupabase({ g2: { prev: null } })
    const throwing: any = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'cpv2_assign_gallery' && args.p_gallery_id === 'g1') throw new Error('boom')
        return supabase.rpc(name, args)
      },
    }
    const s = await runBulkAssign(throwing, {
      businessId: 'biz', actorUserId: 'u1', clientId: 'target', galleryIds: ['g1', 'g2'],
    })
    ok('thrown rpc isolated', s.failed === 1 && s.assigned === 1 && s.results[0].error === 'boom')
    ok('audit still written for surviving item', audits.length === 1 && audits[0].targetId === 'g2')
  }

  // ── cross-business client rejected (handler gate = clientBelongsToBusiness) ─
  {
    const yes = await clientBelongsToBusiness(makeClientCheckSupabase(true), 'c1', 'bizA')
    const no = await clientBelongsToBusiness(makeClientCheckSupabase(false), 'cOfBizB', 'bizA')
    ok('client of own business passes gate', yes === true)
    ok('cross-business client fails gate (handler → 403)', no === false)
  }

  // ── computeVisibilityIndicator ──────────────────────────────────────────────
  ok('unassigned live gallery → unassigned',
    computeVisibilityIndicator({ client_id: null, status: 'live' }) === 'unassigned')
  ok('unassigned wins over draft',
    computeVisibilityIndicator({ client_id: null, status: 'draft' }) === 'unassigned')
  ok('assigned DRAFT does not imply visibility → not_published',
    computeVisibilityIndicator({ client_id: 'c1', status: 'draft' }, 5) === 'not_published')
  ok('assigned archived → not_published',
    computeVisibilityIndicator({ client_id: 'c1', status: 'archived' }, 5) === 'not_published')
  ok('assigned live with active members → visible (null)',
    computeVisibilityIndicator({ client_id: 'c1', status: 'live' }, 3) === null)
  ok('assigned live, 0 active members → no_active_members',
    computeVisibilityIndicator({ client_id: 'c1', status: 'live' }, 0) === 'no_active_members')
  ok('unknown member count does not speculate → null',
    computeVisibilityIndicator({ client_id: 'c1', status: 'live' }) === null &&
    computeVisibilityIndicator({ client_id: 'c1', status: 'live' }, null) === null)

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
run()
