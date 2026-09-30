import type { AssignableGalleryRow, ClientOverviewRow } from '@/features/clients/api'

export interface DerivedStats {
  activeClients: number
  totalGalleries: number
  published: number
  drafts: number
  unassigned: number
  pendingInvites: number
  notVisible: number // client_id null OR status !== 'live'
  recent: AssignableGalleryRow[]
}

export function deriveOverviewStats(clients: ClientOverviewRow[], galleries: AssignableGalleryRow[]): DerivedStats {
  const published = galleries.filter(g => g.status === 'live').length
  const drafts = galleries.filter(g => g.status !== 'live').length
  const unassigned = galleries.filter(g => !g.client_id).length
  const notVisible = galleries.filter(g => !g.client_id || g.status !== 'live').length
  const pendingInvites = clients.reduce((n, c) => n + (c.pending_invites || 0), 0)
  const activeClients = clients.filter(c => (c.active_member_count || 0) > 0).length
  // "Recently added": the assignable-galleries RPC returns owner galleries; sort
  // by event_date desc as a cheap recency proxy (no created_at in the row) and
  // take the first few. Galleries without a date sink to the bottom.
  const recent = [...galleries]
    .sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''))
    .slice(0, 5)
  return {
    activeClients,
    totalGalleries: galleries.length,
    published,
    drafts,
    unassigned,
    pendingInvites,
    notVisible,
    recent,
  }
}
