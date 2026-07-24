// Step2Csv.tsx — CSV upload, server-side dry run, per-collection mapping.
//
// The file is read as TEXT in the browser and posted to parse_csv (no file goes
// to the server). The dry-run table shows match chips, dropped-password notice,
// ignored headers, and a per-row action <select>. Mapping choices persist via
// set_collection_mapping. Client picker reuses fetchClientsOverview (contract).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, Button, Chip, Notice, Spinner, palette } from '../ui'
import type { WizardCommon, ImportCollection } from '../wizardTypes'
import {
  parseCsvDryRun, setCollectionMapping, createClientInline, type DryRunResult,
} from '../importApi'
import { fetchClientsOverview, type ClientOverviewRow } from '../../clients/api'

type RowAction = 'map' | 'create_new' | 'skip' | 'review'

function chipFor(status: string): { kind: 'ok' | 'warn' | 'danger' | 'neutral'; key: string } {
  switch (status) {
    case 'matched': return { kind: 'ok', key: 'import.match.matched' }
    case 'ambiguous': return { kind: 'warn', key: 'import.match.ambiguous' }
    case 'create_new': return { kind: 'neutral', key: 'import.match.create_new' }
    case 'skip': return { kind: 'neutral', key: 'import.match.skip' }
    default: return { kind: 'danger', key: 'import.match.unmatched' }
  }
}

export function Step2Csv({
  t, jobId, collections, setCollections, onBack, onNext,
}: WizardCommon & {
  jobId: string
  collections: ImportCollection[]
  setCollections: (c: ImportCollection[]) => void
  onBack: () => void
  onNext: () => void
}) {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dry, setDry] = useState<DryRunResult | null>(null)
  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [clientQuery, setClientQuery] = useState('')
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchClientsOverview().then(setClients).catch(() => setClients([]))
  }, [])

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setError(null); setParsing(true); setDry(null)
    try {
      const text = await file.text()
      const res = await parseCsvDryRun(jobId, text)
      if (!res.ok) { setError(res.error ?? 'csv_unusable'); setParsing(false); return }
      setDry(res)
      if (res.kind === 'collections' && res.collections) setCollections(res.collections)
    } catch {
      setError('read_failed')
    } finally {
      setParsing(false)
    }
  }, [jobId, setCollections])

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    const base = q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients
    return base.slice(0, 50)
  }, [clients, clientQuery])

  const applyMapping = useCallback(async (
    col: ImportCollection, action: RowAction, clientId?: string,
  ) => {
    if (action === 'review') return
    setRowBusy(col.id)
    try {
      const server = await setCollectionMapping(
        col.id, action === 'map' ? 'map' : action === 'create_new' ? 'create_new' : 'skip', clientId,
      )
      if (server.ok) {
        setCollections(collections.map(c => c.id === col.id
          ? { ...c, client_match_status: action === 'map' ? 'matched' : action === 'create_new' ? 'create_new' : 'skip', matched_client_id: clientId ?? null }
          : c))
      } else {
        setError(server.error ?? 'mapping_failed')
      }
    } finally {
      setRowBusy(null)
    }
  }, [collections, setCollections])

  const createAndMap = useCallback(async (col: ImportCollection) => {
    setRowBusy(col.id)
    try {
      const name = (col.stats?.client_name as string) || col.source_name
      const newId = await createClientInline(name)
      if (newId) {
        setClients(await fetchClientsOverview())
        await applyMapping(col, 'map', newId)
      } else {
        setError('create_client_failed')
      }
    } finally {
      setRowBusy(null)
    }
  }, [applyMapping])

  const unresolvedCount = collections.filter(
    c => c.client_match_status === 'ambiguous' || c.client_match_status === 'unmatched',
  ).length
  const canContinue = collections.length > 0 && unresolvedCount === 0

  return (
    <Panel>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{t('import.step2.title')}</h2>
      <p style={{ color: palette.textDim, fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>{t('import.step2.intro')}</p>

      <div style={{ marginBottom: 16 }}>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={e => onFile(e.target.files?.[0])}
        />
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>{t('import.step2.choose')}</Button>
      </div>

      {parsing && <div style={{ marginBottom: 16 }}><Spinner label={t('import.step2.parsing')} /></div>}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="danger">{error === 'csv_too_large' ? t('import.step2.tooBig')
            : error === 'no_collections_found' || error === 'missing_collection_name_column' ? t('import.step2.empty')
            : t('import.common.error')}</Notice>
        </div>
      )}

      {dry?.kind === 'contacts' && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">{t('import.step2.contactsParsed', { count: dry.contact_count ?? 0 })}</Notice>
        </div>
      )}

      {dry && (dry.dropped_password_columns?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn">{t('import.step2.droppedPassword')}</Notice>
        </div>
      )}
      {dry && (dry.ignored_headers?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13, color: palette.textDim }}>
          {t('import.step2.ignoredHeaders')} {dry.ignored_headers!.join(', ')}
        </div>
      )}

      {collections.length === 0 && !parsing && (
        <div style={{ color: palette.textDim, fontSize: 14, padding: '12px 0' }}>{t('import.common.empty')}</div>
      )}

      {collections.length > 0 && (
        <>
          {clients.length > 0 && (
            <input
              value={clientQuery} onChange={e => setClientQuery(e.target.value)}
              placeholder={t('import.step2.searchClient')}
              style={{
                width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '8px 12px',
                background: palette.panelAlt, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 8, fontSize: 14,
              }}
            />
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'start', color: palette.textDim }}>
                  <th style={thStyle}>{t('import.step2.table.collection')}</th>
                  <th style={thStyle}>{t('import.step2.table.client')}</th>
                  <th style={thStyle}>{t('import.step2.table.match')}</th>
                  <th style={thStyle}>{t('import.step2.table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {collections.map(col => {
                  const chip = chipFor(col.client_match_status)
                  const clientName = (col.stats?.client_name as string) || ''
                  return (
                    <tr key={col.id} style={{ borderTop: `1px solid ${palette.border}` }}>
                      <td style={tdStyle}>{col.source_name}</td>
                      <td style={tdStyle}>{clientName || '—'}</td>
                      <td style={tdStyle}>
                        <Chip kind={chip.kind}>{t(chip.key as never)}</Chip>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            disabled={rowBusy === col.id}
                            value={col.client_match_status === 'matched' ? 'map'
                              : col.client_match_status === 'create_new' ? 'create_new'
                              : col.client_match_status === 'skip' ? 'skip' : 'review'}
                            onChange={e => {
                              const v = e.target.value as RowAction
                              if (v === 'create_new') void createAndMap(col)
                              else if (v === 'skip') void applyMapping(col, 'skip')
                              else if (v === 'review') { /* leave for manual client pick */ }
                            }}
                            style={selectStyle}
                          >
                            <option value="review">{t('import.action.pickClient')}</option>
                            <option value="map">{t('import.action.map')}</option>
                            <option value="create_new">{t('import.action.create_new')}</option>
                            <option value="skip">{t('import.action.skip')}</option>
                          </select>
                          <select
                            disabled={rowBusy === col.id}
                            value={col.matched_client_id ?? ''}
                            onChange={e => e.target.value && applyMapping(col, 'map', e.target.value)}
                            style={selectStyle}
                          >
                            <option value="">{t('import.action.pickClient')}</option>
                            {filteredClients.map(c => (
                              <option key={c.client_id} value={c.client_id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {collections.length > 0 && unresolvedCount > 0 && (
        <div style={{ marginTop: 16 }}>
          <Notice tone="warn">{t('import.step2.unresolved')}</Notice>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <Button variant="ghost" onClick={onBack}>{t('import.common.back')}</Button>
        <Button onClick={onNext} disabled={!canContinue}>{t('import.step2.cta')}</Button>
      </div>
    </Panel>
  )
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, fontSize: 12 }
const tdStyle: React.CSSProperties = { padding: '10px', verticalAlign: 'top' }
const selectStyle: React.CSSProperties = {
  background: palette.panelAlt, color: palette.text, border: `1px solid ${palette.border}`,
  borderRadius: 6, padding: '6px 8px', fontSize: 13, maxWidth: 220,
}
