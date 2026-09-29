// Runs each mapped collection through runCollection (existing upload pipeline).
// Pause/cancel hit the API and local refs so the loop stops between chunks.
// Only the 'skip' duplicate policy exists; the others are shown disabled.
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/shared/ui'
import type { WizardCommon, ImportCollection, ZipSlot, CollectionOutcome, DuplicatePolicy } from '../wizardTypes'
import {
  startJob, pauseJob, resumeJob, cancelJob,
  type OwnerBusiness,
} from '../importApi'
import { runCollection, type CollectionProgress } from '../runCollection'
import { ImportPanel } from '../components/ImportPanel'
import { ImportButton } from '../components/ImportButton'
import { Notice } from '../components/Notice'
import { ProgressBar } from '../components/ProgressBar'
import { card, heading, intro, select, textDim } from '../components/theme'

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
  // True while the collection loop runs; a pause only takes effect at the next chunk.
  const loopActiveRef = useRef(false)

  // Collections that have a mapped ZIP with accepted files.
  const runnable = collections
    .filter(c => c.client_match_status !== 'skip')
    .map(c => ({ col: c, slot: zips.find(z => z.collectionId === c.id && z.listing && z.listing.summary.accepted.length > 0) }))
    .filter((x): x is { col: ImportCollection; slot: ZipSlot } => !!x.slot)

  const run = useCallback(async () => {
    if (loopActiveRef.current) return
    loopActiveRef.current = true
    setError(null)
    pausedRef.current = false
    cancelledRef.current = false
    setRunState('running')

    try {
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
          setRunState('paused')
          onFinished(outcomes)
          return
        }
      }

      setRunState(cancelledRef.current ? 'cancelled' : 'done')
      onFinished(outcomes)
    } catch (err) {
      console.warn('[import] run failed', err)
      setError('run_failed')
      setRunState('idle')
    } finally {
      loopActiveRef.current = false
    }
  }, [runnable, jobId, business, onFinished])

  const doPause = useCallback(async () => {
    pausedRef.current = true
    setRunState('paused')
    await pauseJob(jobId).catch(() => setError('pause_failed'))
  }, [jobId])

  // Resuming before the loop reached its pause point just un-pauses it; starting
  // a second loop would import the same collections twice.
  const doResume = useCallback(async () => {
    try { await resumeJob(jobId) } catch { setError('resume_failed'); return }
    if (loopActiveRef.current) {
      pausedRef.current = false
      setRunState('running')
    } else {
      void run()
    }
  }, [jobId, run])

  const doCancel = useCallback(async () => {
    cancelledRef.current = true
    setRunState('cancelled')
    await cancelJob(jobId).catch(() => setError('cancel_failed'))
  }, [jobId])

  const running = runState === 'running'

  return (
    <ImportPanel>
      <h2 className={heading}>{t('import.step4.title')}</h2>
      <p className={intro}>{t('import.step4.intro')}</p>

      <div className="mb-4">
        <label className={`${textDim} mb-1.5 block text-[13px]`}>{t('import.step4.dupPolicy')}</label>
        <select
          value={dupPolicy} disabled={runState !== 'idle'}
          onChange={e => setDupPolicy(e.target.value as DuplicatePolicy)}
          className={cn(select, 'px-2.5 py-2')}
        >
          <option value="skip">{t('import.step4.dup.skip')}</option>
          <option value="replace" disabled>{t('import.step4.dup.replace')}</option>
          <option value="create_copy" disabled>{t('import.step4.dup.copy')}</option>
        </select>
      </div>

      {error && <div className="mb-4"><Notice tone="danger">{t('import.common.error')}</Notice></div>}
      {runState === 'paused' && <div className="mb-4"><Notice tone="warn">{t('import.step4.paused')}</Notice></div>}
      {runState === 'cancelled' && <div className="mb-4"><Notice tone="warn">{t('import.step4.cancelled')}</Notice></div>}

      <div className="mb-[18px] flex flex-col gap-3">
        {runnable.map(({ col, slot }) => {
          const p = progress[col.id]
          const total = slot.listing?.summary.accepted.length ?? 0
          const done = p ? p.uploaded + p.skippedDuplicate + p.failed : 0
          return (
            <div key={col.id} className={card}>
              <div className="mb-2 flex justify-between text-sm">
                <strong>{col.source_name}</strong>
                <span className={textDim}>{done}/{total}</span>
              </div>
              <ProgressBar value={done} total={total} />
              {p && (
                <div className={`${textDim} mt-2 flex gap-4 text-xs`}>
                  <span>{t('import.step4.done')}: {p.uploaded}</span>
                  <span>{t('import.step4.dupSkipped')}: {p.skippedDuplicate}</span>
                  <span>{t('import.step4.failed')}: {p.failed}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mb-4">
        <Notice tone="info">{t('import.step4.cancelNote')}</Notice>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <ImportButton variant="ghost" onClick={onBack} disabled={running}>{t('import.common.back')}</ImportButton>
        <div className="flex gap-2.5">
          {runState === 'idle' && <ImportButton onClick={run} disabled={runnable.length === 0}>{t('import.step4.start')}</ImportButton>}
          {running && <ImportButton variant="ghost" onClick={doPause}>{t('import.step4.pause')}</ImportButton>}
          {runState === 'paused' && <ImportButton onClick={doResume}>{t('import.step4.resume')}</ImportButton>}
          {(running || runState === 'paused') && <ImportButton variant="danger" onClick={doCancel}>{t('import.step4.cancel')}</ImportButton>}
        </div>
      </div>
    </ImportPanel>
  )
}
