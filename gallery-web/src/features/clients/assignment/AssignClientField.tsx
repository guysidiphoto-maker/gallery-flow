// Self-contained searchable client picker: fetches its own list, always offers
// "No client yet" (null) so assignment never blocks a flow, and can create a
// client inline without losing the parent's state.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { Input, cn } from '@/shared/ui'
import { fetchClientsOverview, createClientReq, type ClientOverviewRow } from '../api'
import { t, dirFor, type AssignmentLocale } from './strings'

export interface AssignClientFieldProps {
  /** Selected client id, or null for "no client yet". */
  value: string | null
  /** Fired on every selection change (null = no client). */
  onChange: (clientId: string | null, client?: { id: string; name: string } | null) => void
  /** Show the inline "create new client" mini-form. Default true. */
  allowCreateInline?: boolean
  /** UI language. Default 'he' (RTL). */
  locale?: AssignmentLocale
  disabled?: boolean
}

const OPTION = 'flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-start text-[13.5px] text-ink'
const SMALL_INPUT = 'px-[11px] py-[9px] text-[13px]'

export default function AssignClientField({
  value, onChange, allowCreateInline = true, locale = 'he', disabled = false,
}: AssignClientFieldProps) {
  const dir = dirFor(locale)
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)

  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setClients(await fetchClientsOverview())
    } catch {
      setLoadError(tr('assign.field.loadError'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  useEffect(() => { void load() }, [load])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = useMemo(
    () => clients.find(cl => cl.client_id === value) ?? null,
    [clients, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(cl =>
      cl.name.toLowerCase().includes(q) || (cl.slug ?? '').toLowerCase().includes(q))
  }, [clients, query])

  const pick = (cl: ClientOverviewRow | null) => {
    onChange(cl ? cl.client_id : null, cl ? { id: cl.client_id, name: cl.name } : null)
    setOpen(false)
    setQuery('')
    setCreating(false)
  }

  const submitCreate = async (e?: FormEvent) => {
    e?.preventDefault()
    const name = newName.trim()
    if (!name) { setCreateError(tr('assign.field.nameRequired')); return }
    setCreateBusy(true)
    setCreateError(null)
    const res = await createClientReq({ name }) // record only, no invite
    setCreateBusy(false)
    if (!res.ok) { setCreateError(tr('assign.field.createFailed')); return }
    const row: ClientOverviewRow = {
      client_id: res.client_id, name, slug: null,
      gallery_count: 0, member_count: 0, active_member_count: 0,
      pending_invites: 0, last_access_at: null, has_legacy_pin: false,
    }
    setClients(prev => [row, ...prev])
    setNewName('')
    pick(row)
    void load() // refresh in the background for accurate counts/slug
  }

  const check = <span className="ms-auto flex shrink-0 text-sage"><Icon name="check" size={13} strokeWidth={2} /></span>

  return (
    <div ref={rootRef} dir={dir} className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tr('assign.field.label')}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-hair border border-line bg-raised px-3.5 py-2.5 text-start text-sm text-ink',
          'disabled:cursor-not-allowed',
          disabled && 'opacity-50',
        )}
      >
        <span className="flex shrink-0 text-muted">
          <Icon name="clients" size={15} strokeWidth={1.7} />
        </span>
        <span className={cn('min-w-0 flex-1 truncate', selected ? 'text-ink' : 'text-muted')}>
          {loading ? tr('assign.field.loading')
            : selected ? selected.name
            : value === null ? tr('assign.field.noClient') : tr('assign.field.placeholder')}
        </span>
      </button>

      {loadError && (
        <div className="mt-2 flex items-center gap-2.5 text-[12.5px] text-danger">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-hair border border-danger bg-transparent px-2.5 py-[3px] text-xs text-danger"
          >
            {tr('assign.field.retry')}
          </button>
        </div>
      )}

      {open && !loading && !loadError && (
        <div
          role="listbox"
          aria-label={tr('assign.field.label')}
          className="absolute inset-x-0 top-[calc(100%+4px)] z-[60] overflow-hidden rounded-hair border border-line bg-raised shadow-card"
        >
          <div className="p-2.5">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tr('assign.field.search')}
              aria-label={tr('assign.field.search')}
              className={SMALL_INPUT}
            />
          </div>

          <div className="max-h-60 overflow-y-auto">
            {/* "No client yet" is always first and never filtered away. */}
            <button type="button" onClick={() => pick(null)} className={cn(OPTION, 'border-t-0', value === null ? 'bg-canvas' : 'bg-raised')}>
              <span className="flex text-muted"><Icon name="close" size={12} strokeWidth={1.8} /></span>
              <span className={value === null ? 'text-ink' : 'text-ink-soft'}>{tr('assign.field.noClient')}</span>
              {value === null && check}
            </button>

            {filtered.length === 0 ? (
              <div className="border-t border-line p-3 text-[12.5px] text-muted">
                {tr('assign.field.noResults')}
              </div>
            ) : filtered.map(cl => {
              const active = cl.client_id === value
              return (
                <button key={cl.client_id} type="button" onClick={() => pick(cl)} className={cn(OPTION, active ? 'bg-canvas' : 'bg-raised')}>
                  <span className="min-w-0 truncate">{cl.name}</span>
                  {active && check}
                </button>
              )
            })}
          </div>

          {allowCreateInline && (
            <div className="border-t border-line bg-surface p-2.5">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => { setCreating(true); setCreateError(null); setNewName(query.trim()) }}
                  className="flex w-full items-center gap-2 bg-transparent px-0.5 py-1 text-start text-[13px] font-medium text-ink"
                >
                  <Icon name="plus" size={13} strokeWidth={2} />
                  {tr('assign.field.createNew')}
                </button>
              ) : (
                <form onSubmit={submitCreate}>
                  <Input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder={tr('assign.field.createName')}
                    aria-label={tr('assign.field.createName')}
                    className={cn(SMALL_INPUT, 'mb-2')}
                  />
                  {createError && <div className="mb-2 text-xs text-danger">{createError}</div>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createBusy}
                      className="rounded-hair border border-ink bg-ink px-3.5 py-[7px] text-xs font-medium text-white disabled:cursor-wait"
                    >
                      {createBusy ? tr('assign.field.creating') : tr('assign.field.createSubmit')}
                    </button>
                    <button
                      type="button"
                      disabled={createBusy}
                      onClick={() => { setCreating(false); setCreateError(null) }}
                      className="rounded-hair border border-line bg-transparent px-3.5 py-[7px] text-xs text-ink-soft"
                    >
                      {tr('assign.field.createCancel')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
