// AssignClientField — self-contained, searchable client picker for the
// gallery-creation flow and any owner surface that needs "attach a client".
//
// - Fetches its own client list (cpv2_owner_clients_overview via
//   fetchClientsOverview) — the parent passes NO data, only value/onChange.
// - Always offers "No client yet" (null) so assignment NEVER blocks a flow.
// - Optional inline "create new client" mini-form (createClientReq, no invite)
//   that selects the freshly created client without losing parent state.
// - Locale via the local strings.ts (he default, RTL). See INTEGRATION.md for
//   why this does not import src/lib/ownerLocale.ts yet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { c } from '../clients/theme'
import { inputStyle } from '../clients/primitives'
import { fetchClientsOverview, createClientReq, type ClientOverviewRow } from '../clients/api'
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

  // Inline-create mini-form
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

  const submitCreate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const name = newName.trim()
    if (!name) { setCreateError(tr('assign.field.nameRequired')); return }
    setCreateBusy(true)
    setCreateError(null)
    const res = await createClientReq({ name }) // NO invite — pure record creation
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

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
    textAlign: 'start', fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer',
    padding: '10px 12px', border: 'none', borderTop: `1px solid ${c.border}`,
    background: active ? c.bg : c.cardSolid, color: c.textPrimary,
  })

  return (
    <div ref={rootRef} dir={dir} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tr('assign.field.label')}
        style={{
          ...inputStyle, display: 'flex', alignItems: 'center', gap: 10,
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1, textAlign: 'start',
        }}
      >
        <span style={{ color: c.textMuted, display: 'flex', flexShrink: 0 }}>
          <Icon name="clients" size={15} strokeWidth={1.7} />
        </span>
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? c.textPrimary : c.textMuted,
        }}>
          {loading ? tr('assign.field.loading')
            : selected ? selected.name
            : value === null ? tr('assign.field.noClient') : tr('assign.field.placeholder')}
        </span>
      </button>

      {loadError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12.5, color: c.danger }}>
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: 'transparent',
              border: `1px solid ${c.danger}`, color: c.danger, borderRadius: 2, padding: '3px 10px',
            }}
          >
            {tr('assign.field.retry')}
          </button>
        </div>
      )}

      {/* Panel */}
      {open && !loading && !loadError && (
        <div
          role="listbox"
          aria-label={tr('assign.field.label')}
          style={{
            position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: 'calc(100% + 4px)',
            zIndex: 60, background: c.cardSolid, border: `1px solid ${c.border}`, borderRadius: 2,
            boxShadow: '0 10px 30px rgba(20,20,19,.12)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: 10 }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tr('assign.field.search')}
              aria-label={tr('assign.field.search')}
              style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }}
            />
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {/* "No client yet" — always first, never filtered away */}
            <button type="button" onClick={() => pick(null)} style={{ ...optionStyle(value === null), borderTop: 'none' }}>
              <span style={{ color: c.textMuted, display: 'flex' }}><Icon name="close" size={12} strokeWidth={1.8} /></span>
              <span style={{ color: value === null ? c.textPrimary : c.textSecondary }}>{tr('assign.field.noClient')}</span>
              {value === null && <span style={{ marginInlineStart: 'auto', color: c.statusLive, display: 'flex' }}><Icon name="check" size={13} strokeWidth={2} /></span>}
            </button>

            {filtered.length === 0 ? (
              <div style={{ padding: '12px 12px', fontSize: 12.5, color: c.textMuted, borderTop: `1px solid ${c.border}` }}>
                {tr('assign.field.noResults')}
              </div>
            ) : filtered.map(cl => {
              const active = cl.client_id === value
              return (
                <button key={cl.client_id} type="button" onClick={() => pick(cl)} style={optionStyle(active)}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cl.name}</span>
                  {active && <span style={{ marginInlineStart: 'auto', color: c.statusLive, display: 'flex', flexShrink: 0 }}><Icon name="check" size={13} strokeWidth={2} /></span>}
                </button>
              )
            })}
          </div>

          {allowCreateInline && (
            <div style={{ borderTop: `1px solid ${c.border}`, padding: 10, background: c.bgSubtle }}>
              {!creating ? (
                <button
                  type="button"
                  onClick={() => { setCreating(true); setCreateError(null); setNewName(query.trim()) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'start',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    background: 'transparent', border: 'none', color: c.textPrimary, padding: '4px 2px',
                  }}
                >
                  <Icon name="plus" size={13} strokeWidth={2} />
                  {tr('assign.field.createNew')}
                </button>
              ) : (
                <form onSubmit={submitCreate}>
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder={tr('assign.field.createName')}
                    aria-label={tr('assign.field.createName')}
                    style={{ ...inputStyle, padding: '9px 11px', fontSize: 13, marginBottom: 8 }}
                  />
                  {createError && <div style={{ fontSize: 12, color: c.danger, marginBottom: 8 }}>{createError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="submit"
                      disabled={createBusy}
                      style={{
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: createBusy ? 'wait' : 'pointer',
                        background: c.textPrimary, color: '#fff', border: `1px solid ${c.textPrimary}`,
                        borderRadius: 2, padding: '7px 14px',
                      }}
                    >
                      {createBusy ? tr('assign.field.creating') : tr('assign.field.createSubmit')}
                    </button>
                    <button
                      type="button"
                      disabled={createBusy}
                      onClick={() => { setCreating(false); setCreateError(null) }}
                      style={{
                        fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: 'transparent',
                        border: `1px solid ${c.border}`, color: c.textSecondary, borderRadius: 2, padding: '7px 14px',
                      }}
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
