// CSV is read as text in the browser and dry-run parsed by the server (parse_csv);
// per-collection mapping choices persist via set_collection_mapping.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchClientsOverview, type ClientOverviewRow } from '@/features/clients/api'
import type { WizardCommon, ImportCollection } from '../wizardTypes'
import { parseCsvDryRun, setCollectionMapping, createClientInline, type DryRunResult } from '../importApi'
import { ImportPanel } from '../components/ImportPanel'
import { ImportButton } from '../components/ImportButton'
import { Notice } from '../components/Notice'
import { LoadingLine } from '../components/LoadingLine'
import { CollectionMappingRow } from '../components/CollectionMappingRow'
import { emptyText, heading, intro, surfaceAlt, textDim, textMain } from '../components/theme'

type MappingAction = 'map' | 'create_new' | 'skip'

const th = 'px-2.5 py-2 text-xs font-semibold'

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

  const applyMapping = useCallback(async (col: ImportCollection, action: MappingAction, clientId?: string) => {
    setRowBusy(col.id)
    try {
      const server = await setCollectionMapping(col.id, action, clientId)
      if (server.ok) {
        setCollections(collections.map(c => c.id === col.id
          ? { ...c, client_match_status: action === 'map' ? 'matched' : action, matched_client_id: clientId ?? null }
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
    <ImportPanel>
      <h2 className={heading}>{t('import.step2.title')}</h2>
      <p className={intro}>{t('import.step2.intro')}</p>

      <div className="mb-4">
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => onFile(e.target.files?.[0])}
        />
        <ImportButton variant="ghost" onClick={() => fileRef.current?.click()}>{t('import.step2.choose')}</ImportButton>
      </div>

      {parsing && <div className="mb-4"><LoadingLine label={t('import.step2.parsing')} /></div>}
      {error && (
        <div className="mb-4">
          <Notice tone="danger">{error === 'csv_too_large' ? t('import.step2.tooBig')
            : error === 'no_collections_found' || error === 'missing_collection_name_column' ? t('import.step2.empty')
            : t('import.common.error')}</Notice>
        </div>
      )}

      {dry?.kind === 'contacts' && (
        <div className="mb-4">
          <Notice tone="info">{t('import.step2.contactsParsed', { count: dry.contact_count ?? 0 })}</Notice>
        </div>
      )}

      {dry && (dry.dropped_password_columns?.length ?? 0) > 0 && (
        <div className="mb-4">
          <Notice tone="warn">{t('import.step2.droppedPassword')}</Notice>
        </div>
      )}
      {dry && (dry.ignored_headers?.length ?? 0) > 0 && (
        <div className={`${textDim} mb-4 text-[13px]`}>
          {t('import.step2.ignoredHeaders')} {dry.ignored_headers!.join(', ')}
        </div>
      )}

      {collections.length === 0 && !parsing && <div className={emptyText}>{t('import.common.empty')}</div>}

      {collections.length > 0 && (
        <>
          {clients.length > 0 && (
            <input
              value={clientQuery} onChange={e => setClientQuery(e.target.value)}
              placeholder={t('import.step2.searchClient')}
              className={`${surfaceAlt} ${textMain} mb-3 w-full rounded-[8px] border border-night-line px-3 py-2 text-sm`}
            />
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className={`${textDim} text-start`}>
                  <th className={th}>{t('import.step2.table.collection')}</th>
                  <th className={th}>{t('import.step2.table.client')}</th>
                  <th className={th}>{t('import.step2.table.match')}</th>
                  <th className={th}>{t('import.step2.table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {collections.map(col => (
                  <CollectionMappingRow
                    key={col.id}
                    t={t}
                    col={col}
                    busy={rowBusy === col.id}
                    clients={filteredClients}
                    onCreateNew={() => void createAndMap(col)}
                    onMap={(action, clientId) => void applyMapping(col, action, clientId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {collections.length > 0 && unresolvedCount > 0 && (
        <div className="mt-4">
          <Notice tone="warn">{t('import.step2.unresolved')}</Notice>
        </div>
      )}

      <div className="mt-5 flex justify-between">
        <ImportButton variant="ghost" onClick={onBack}>{t('import.common.back')}</ImportButton>
        <ImportButton onClick={onNext} disabled={!canContinue}>{t('import.step2.cta')}</ImportButton>
      </div>
    </ImportPanel>
  )
}
