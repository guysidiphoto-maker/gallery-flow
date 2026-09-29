// Owner-side Clients Manager, rendered inside the Dashboard shell as an
// in-page view switch (list → detail / bulk assign), not a separate route.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/shared/ui/Toast'
import { fetchClientsOverview, hasProductionSuite, type ClientOverviewRow } from './api'
import { ClientDetailView } from './ClientDetailView'
import { ClientListRow } from './ClientListRow'
import { CreateClientModal } from './CreateClientModal'
import BulkAssignView from './assignment/BulkAssignView'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { ErrorBanner } from './ui/ErrorBanner'
import { Skeleton } from './ui/Skeleton'
import { SearchField } from './ui/SearchField'
import { FilterTabs } from './ui/FilterTabs'
import { RowList } from './ui/RowList'

interface Props {
  businessSlug: string | null
  businessId: string | null
}

type View =
  | { kind: 'list' }
  | { kind: 'detail'; clientId: string }
  | { kind: 'assign' }

type StatusFilter = 'all' | 'active' | 'invited' | 'legacy'

const FILTER_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'הכול' },
  { id: 'active', label: 'עם משתמשים פעילים' },
  { id: 'invited', label: 'הזמנות ממתינות' },
  { id: 'legacy', label: 'קוד PIN ישן' },
]

export function ClientsManager({ businessSlug }: Props) {
  const { showToast, ToastContainer } = useToast()
  const [view, setView] = useState<View>({ kind: 'list' })

  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasProduction, setHasProduction] = useState(false)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchClientsOverview()
      setClients(rows)
    } catch (e) {
      setError((e as Error).message || 'טעינת הלקוחות נכשלה.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void hasProductionSuite().then(setHasProduction) }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients.filter(cl => {
      if (q && !cl.name.toLowerCase().includes(q) && !(cl.slug ?? '').toLowerCase().includes(q)) return false
      if (filter === 'active' && cl.active_member_count === 0) return false
      if (filter === 'invited' && cl.pending_invites === 0) return false
      if (filter === 'legacy' && !cl.has_legacy_pin) return false
      return true
    })
  }, [clients, query, filter])

  const backToList = () => { setView({ kind: 'list' }); void load() }

  if (view.kind === 'detail') {
    return (
      <>
        <ClientDetailView clientId={view.clientId} businessSlug={businessSlug} onBack={backToList} showToast={showToast} />
        <ToastContainer />
      </>
    )
  }

  if (view.kind === 'assign') {
    return (
      <>
        <BulkAssignView businessSlug={businessSlug} onBack={backToList} showToast={showToast} />
        <ToastContainer />
      </>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3.5 flex items-center gap-2.5 text-[11px] font-medium tracking-wide-label text-muted uppercase">
            Workspace
            {hasProduction && <Badge tone="accent" icon="bolt">Production Suite</Badge>}
          </div>
          <h1 className="text-[clamp(28px,4vw,52px)] leading-[1.02] font-medium tracking-[-0.025em] text-ink">
            לקוחות
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="ghost" icon="gallery" onClick={() => setView({ kind: 'assign' })}>שיוך גלריות</Button>
          <Button variant="outline" icon="plus" onClick={() => setCreateOpen(true)}>לקוח חדש</Button>
        </div>
      </div>

      {loading ? (
        <Skeleton height={78} count={4} />
      ) : error ? (
        <ErrorBanner text={error} onRetry={load} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon="clients"
          title="עדיין אין לקוחות"
          body="צור את הלקוח הראשון כדי לשייך אליו גלריות ולתת גישה מאובטחת לפורטל."
          action={<Button variant="outline" icon="plus" onClick={() => setCreateOpen(true)}>צור לקוח ראשון</Button>}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <SearchField value={query} onChange={setQuery} placeholder="חיפוש לפי שם לקוח…" ariaLabel="חיפוש לקוחות" />
            <FilterTabs tabs={FILTER_TABS} value={filter} onChange={setFilter} ariaLabel="סינון לקוחות" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="search" title="אין תוצאות" body="לא נמצאו לקוחות התואמים את החיפוש או הסינון." />
          ) : (
            <RowList>
              {filtered.map(cl => (
                <ClientListRow
                  key={cl.client_id}
                  client={cl}
                  onOpen={() => setView({ kind: 'detail', clientId: cl.client_id })}
                />
              ))}
            </RowList>
          )}
        </>
      )}

      <CreateClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        reload={load}
        showToast={showToast}
        onOpenClient={clientId => setView({ kind: 'detail', clientId })}
      />

      <ToastContainer />
    </div>
  )
}
