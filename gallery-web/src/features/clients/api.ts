// Clients Manager data layer. Reads are self-scoped owner RPCs (business comes
// from auth.uid(), never the browser); writes go through /api/client-admin,
// which re-verifies ownership. No email is sent — links are returned instead.
import { supabase } from '@/shared/lib/supabase'
import { authedFetch } from '@/shared/lib/authedFetch'

// ── RPC row/shape types (frozen data contract) ──────────────────────────────

export interface ClientOverviewRow {
  client_id: string
  name: string
  slug: string | null
  gallery_count: number
  member_count: number
  active_member_count: number
  pending_invites: number
  last_access_at: string | null
  has_legacy_pin: boolean
}

export interface ClientDetailClient {
  id: string
  name: string
  slug: string | null
  business_id: string
  [key: string]: unknown
}

export interface ClientDetailGallery {
  id: string
  name: string
  slug: string | null
  status: string
  event_date: string | null
}

export interface ClientDetailMember {
  id: string
  email: string
  role: string
  status: string
  invited_at: string | null
  accepted_at: string | null
  last_access_at: string | null
}

export interface ClientDetailInvitation {
  id: string
  email: string
  status: string
  expires_at: string | null
  created_at: string | null
  resent_count: number
}

export interface ClientDetailAudit {
  action: string
  actor_type: string
  created_at: string | null
  metadata: Record<string, unknown> | null
}

export interface ClientDetail {
  client: ClientDetailClient
  galleries: ClientDetailGallery[]
  members: ClientDetailMember[]
  invitations: ClientDetailInvitation[]
  audit: ClientDetailAudit[]
}

export interface AssignableGalleryRow {
  gallery_id: string
  name: string
  slug: string | null
  status: string
  client_id: string | null
  client_name: string | null
  event_date: string | null
}

export type MemberRole = 'client_admin' | 'approver' | 'viewer'
export type SettableStatus = 'active' | 'disabled' | 'revoked'

export interface InviteLink {
  link: string
  email: string
}

// Discriminated result so callers get typed success/error without `any`.
export type ApiResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status: number }

// ── Reads ───────────────────────────────────────────────────────────────────

export async function fetchClientsOverview(): Promise<ClientOverviewRow[]> {
  const { data, error } = await supabase.rpc('cpv2_owner_clients_overview')
  if (error) throw new Error(error.message)
  return (data ?? []) as ClientOverviewRow[]
}

export async function fetchClientDetail(clientId: string): Promise<ClientDetail | null> {
  const { data, error } = await supabase.rpc('cpv2_owner_client_detail', { p_client_id: clientId })
  if (error) throw new Error(error.message)
  return (data ?? null) as ClientDetail | null
}

export async function fetchAssignableGalleries(): Promise<AssignableGalleryRow[]> {
  const { data, error } = await supabase.rpc('cpv2_owner_assignable_galleries')
  if (error) throw new Error(error.message)
  return (data ?? []) as AssignableGalleryRow[]
}

interface EntitlementRow {
  capability: string
  active: boolean
  expires_at: string | null
}

// Soft signal for a UI badge only: fails closed (no badge) on any error.
export async function hasProductionSuite(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('my_business_entitlements')
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as EntitlementRow[]
    return rows.some(
      r => r.capability === 'production_suite' && r.active &&
        (!r.expires_at || new Date(r.expires_at).getTime() > Date.now()),
    )
  } catch {
    return false
  }
}

// ── Writes (POST /api/client-admin) ──────────────────────────────────────────

async function post<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await authedFetch('/api/client-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: 'network_error', status: 0 }
  }
  let json: unknown = null
  try { json = await res.json() } catch { /* empty/invalid body */ }
  const obj = (json ?? {}) as Record<string, unknown>
  if (!res.ok || obj.ok !== true) {
    return { ok: false, error: String(obj.error ?? 'request_failed'), status: res.status }
  }
  return obj as ApiResult<T>
}

export function createClientReq(input: {
  name: string
  contactName?: string
  email?: string
  invite?: boolean
}): Promise<ApiResult<{ client_id: string; invite?: InviteLink }>> {
  return post({ action: 'create_client', ...input })
}

export function inviteMember(input: {
  clientId: string
  email: string
  role: MemberRole
}): Promise<ApiResult<{ invite: InviteLink }>> {
  return post({ action: 'invite_member', ...input })
}

export function resendInvitation(invitationId: string): Promise<ApiResult<{ invite: InviteLink }>> {
  return post({ action: 'resend_invitation', invitationId })
}

export function cancelInvitation(invitationId: string): Promise<ApiResult<Record<string, never>>> {
  return post({ action: 'cancel_invitation', invitationId })
}

export function setMembershipStatus(input: {
  membershipId: string
  status: SettableStatus
}): Promise<ApiResult<{ status: string }>> {
  return post({ action: 'set_membership_status', ...input })
}

export function sendPasswordReset(membershipId: string): Promise<ApiResult<{ reset_link: string | null }>> {
  return post({ action: 'send_password_reset', membershipId })
}

export function assignGallery(input: {
  galleryId: string
  clientId: string
}): Promise<ApiResult<{ gallery_id: string; client_id: string; reassigned: boolean }>> {
  return post({ action: 'assign_gallery', ...input })
}

export function reassignGallery(input: {
  galleryId: string
  clientId: string
}): Promise<ApiResult<{ gallery_id: string; client_id: string; reassigned: boolean }>> {
  return post({ action: 'reassign_gallery', ...input })
}

export function unassignGallery(galleryId: string): Promise<ApiResult<{ gallery_id: string }>> {
  return post({ action: 'unassign_gallery', galleryId })
}

// ── Bulk assignment (mirrors server/clientAdmin.ts BulkAssign* shapes) ───────

export const BULK_ASSIGN_MAX = 200

export interface BulkAssignItemResult {
  galleryId: string
  ok: boolean
  /** Moved from a different client to the target client. */
  reassigned?: boolean
  /** Was already assigned to the target client — idempotent no-op. */
  unchanged?: boolean
  error?: string
}

export interface BulkAssignSummary {
  client_id: string
  total: number
  assigned: number
  reassigned: number
  unchanged: number
  failed: number
  results: BulkAssignItemResult[]
}

/** Assign up to 200 galleries to one client in a single server call. */
export function bulkAssignGalleries(input: {
  clientId: string
  galleryIds: string[]
}): Promise<ApiResult<BulkAssignSummary>> {
  return post({ action: 'bulk_assign_galleries', ...input })
}
