// Step4Run.tsx — the actual migration run.
//
// For each mapped collection: start_job (once), then runCollection() streams the
// accepted ZIP entries through the EXISTING uploadPipeline.uploadMany via the
// importApi run engine, with per-collection progress + checkpointing. Pause /
// resume / cancel are wired to the API AND to local run controls so the loop
// stops promptly between chunks. Duplicate policy: skip implemented; replace and
// create-copy are shown DISABLED with honest labels.

import React, { useCallback, useRef, useState } from 'react'
import { Panel, Button, Notice, ProgressBar, palette } from '../ui'
import type { WizardCommon, ImportCollection, ZipSlot, CollectionOutcome, DuplicatePolicy } from '../wizardTypes'
import {
  startJob, pauseJob, resumeJob, cancelJob, runCollection,
  type OwnerBusiness, type CollectionProgress,
} from '../importApi'

type RunState = 'idle' | 'running' | 'paused' | 'cancelled' | 'done'

export function Step4Run({
  t, jobId, business, collections, zips, onBack, onFinished,
}: WizardCommon & {
  jobId: string
  business: OwnerBusiness
  collections: ImportCollection[]
  zips: ZipSlot[]
  onBack: () => void
  onFinished: (outcomes: CollectionOutcome[]) => void
}) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [dupPolicy, setDupPolicy] = useState<DuplicatePolicy>('skip')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, CollectionProgress>>({})
  const pausedRef = useRef(false)
  const cancelledRef = useRef(false)

  // Collections that actually have a mapped ZIP with accepted files.
  const runnable = collections
    .filter(c => c.client_match_status !== 'skip')
    .map(c => ({ col: c, slot: zips.find(z => z.collectionId === c.id && z.listing && z.listing.summary.accepted.length > 0) }))
    .filter((x): x is { col: ImportCollection; slot: ZipSlot } => !!x.slot)

  const run = useCallback(async () => {
    setError(null)
    pausedRef.current = false
    cancelledRef.current = false
    setRunState('running')

    const totalFiles = runnable.reduce((n, r) => n + (r.slot.listing?.summary.accepted.length ?? 0), 0)
    const totalBytes = runnable.reduce((n, r) => n + (r.slot.listing?.summary.totalUncompressedBytes ?? 0), 0)
    const started = await startJob(jobId, { files: totalFiles, bytes: totalBytes })
    if (!started.ok) { setError(started.error ?? 'start_failed'); setRunState('idle'); return }

    const outcomes: CollectionOutcome[] = []
    const knownHashes = new Set<string>() // cross-collection dedupe within this run

    for (const { col, slot } of runnable) {
      if (cancelledRef.current) break
      const res = await runCollection({
        jobId,
        collection: col,
        listing: slot.listing!,
        business,
        clientId: col.matched_client_id,
        alreadyUploadedNames: new Set<string>(),
        knownHashes,
        controls: { isPaused: () => pausedRef.current, isCancelled: () => cancelledRef.current },
        onProgress: p => setProgress(prev => ({ ...prev, [col.id]: p })),
      })
      outcomes.push({
        collectionId: col.id, sourceName: col.source_name,
        galleryId: res.galleryId, gallerySlug: null,
        uploaded: res.uploaded, skippedDuplicate: res.skippedDuplicate,
        failed: res.failed, failures: res.failures,
      })
      if (res.stopped === 'cancelled') { cancelledRef.current = true; break }
      if (res.stopped === 'paused') {
        // Persist pause, keep partial outcomes, stop the loop.
        setRunState('paused')
        onFinished(outcomes)
        return
      }
    }

    if (cancelledRef.current) {
      setRunState('cancelled')
    } else {
      setRunState('done')
    }
    onFinished(outcomes)
  }, [runnable, jobId, business, onFinished])

  const doPause = useCallback(async () => {
    pausedRef.current = true
    setRunState('paused')
    await pauseJob(jobId)
  }, [jobId])

  const doResume = useCallback(async () => {
    await resumeJob(jobId)
    void run()
  }, [jobId, run])

  const doCancel = useCallback(async () => {
    cancelledRef.current = true
    setRunState('cancelled')
    await cancelJob(jobId)
  }, [jobId])

  const running = runState === 'running'

  return (
    <Panel>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{t('import.step4.title')}</h2>
      <p style={{ color: palette.textDim, fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>{t('import.step4.intro')}</p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, color: palette.textDim, marginBottom: 6 }}>{t('import.step4.dupPolicy')}</label>
        <select
          value={dupPolicy} disabled={runState !== 'idle'}
          onChange={e => setDupPolicy(e.target.value as DuplicatePolicy)}
          style={{ background: palette.panelAlt, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
        >
          <option value="skip">{t('import.step4.dup.skip')}</option>
          <option value="replace" disabled>{t('import.step4.dup.replace')}</option>
          <option value="create_copy" disabled>{t('import.step4.dup.copy')}</option>
        </select>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Notice tone="danger">{t('import.common.error')}</Notice></div>}
      {runState === 'paused' && <div style={{ marginBottom: 16 }}><Notice tone="warn">{t('import.step4.paused')}</Notice></div>}
      {runState === 'cancelled' && <div style={{ marginBottom: 16 }}><Notice tone="warn">{t('import.step4.cancelled')}</Notice></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
        {runnable.map(({ col, slot }) => {
          const p = progress[col.id]
          const total = slot.listing?.summary.accepted.length ?? 0
          const done = p ? p.uploaded + p.skippedDuplicate + p.failed : 0
          return (
            <div key={col.id} style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                <strong>{col.source_name}</strong>
                <span style={{ color: palette.textDim }}>{done}/{total}</span>
              </div>
              <ProgressBar value={done} total={total} />
              {p && (
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: palette.textDim }}>
                  <span>{t('import.step4.done')}: {p.uploaded}</span>
                  <span>{t('import.step4.dupSkipped')}: {p.skippedDuplicate}</span>
                  <span>{t('import.step4.failed')}: {p.failed}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginBottom: 16 }}>
        <Notice tone="info">{t('import.step4.cancelNote')}</Notice>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onBack} disabled={running}>{t('import.common.back')}</Button>
        <div style={{ display: 'flex', gap: 10 }}>
          {runState === 'idle' && <Button onClick={run} disabled={runnable.length === 0}>{t('import.step4.start')}</Button>}
          {running && <Button variant="ghost" onClick={doPause}>{t('import.step4.pause')}</Button>}
          {runState === 'paused' && <Button onClick={doResume}>{t('import.step4.resume')}</Button>}
          {(running || runState === 'paused') && <Button variant="danger" onClick={doCancel}>{t('import.step4.cancel')}</Button>}
        </div>
      </div>
    </Panel>
  )
}
