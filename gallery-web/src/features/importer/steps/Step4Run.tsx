// Runs each mapped collection through runCollection (existing upload pipeline).
// Pause/cancel set local refs so the loop stops between chunks; a pause stays on
// this step so it can be resumed.
// Only the 'skip' duplicate policy exists; the others are shown disabled.
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/shared/ui'
import type { WizardCommon, ImportCollection, ZipSlot, CollectionOutcome, DuplicatePolicy } from '../wizardTypes'
import {
  startJob, pauseJob, resumeJob, cancelJob, getJobStatus,
  type OwnerBusiness,
} from '../importApi'
import { runCollection, type CollectionProgress } from '../runCollection'
import { planResume, type RunMemory } from '../resumePlan'
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
  // What this session already did, kept across pause/resume: created galleries,
  // handled files, finished collections, outcomes and seen hashes.
  const memoryRef = useRef<RunMemory>({ galleryIds: new Map(), priorFiles: new Map(), finished: new Set() })
  const outcomesRef = useRef<Map<string, CollectionOutcome>>(new Map())
  const knownHashesRef = useRef<Set<string>>(new Set())

  // Collections that have a mapped ZIP with accepted files.
  const runnable = collections
    .filter(c => c.client_match_status !== 'skip')
    .map(c => ({ col: c, slot: zips.find(z => z.collectionId === c.id && z.listing && z.listing.summary.accepted.length > 0) }))
    .filter((x): x is { col: ImportCollection; slot: ZipSlot } => !!x.slot)

  // A resume continues from the job's checkpoint merged with this session's
  // memory: finished collections are skipped and existing galleries reused.
  const run = useCallback(async (resuming = false) => {
    if (loopActiveRef.current) return
    loopActiveRef.current = true
    setError(null)
    pausedRef.current = false
    cancelledRef.current = false
    setRunState('running')

    try {
      if (!resuming) {
        const totalFiles = runnable.reduce((n, r) => n + (r.slot.listing?.summary.accepted.length ?? 0), 0)
        const totalBytes = runnable.reduce((n, r) => n + (r.slot.listing?.summary.totalUncompressedBytes ?? 0), 0)
        const started = await startJob(jobId, { files: totalFiles, bytes: totalBytes })
        if (!started.ok) { setError(started.error ?? 'start_failed'); setRunState('idle'); return }
      }

      // The checkpoint read is best effort: this session's memory alone already
      // prevents duplicate galleries and re-uploads.
      let persisted = null
      if (resuming) {
        const status = await getJobStatus(jobId).catch(() => null)
        if (status?.ok) persisted = { collections: status.collections ?? [], files: status.files ?? [] }
      }
      const plan = planResume(runnable.map(r => r.col.id), persisted, memoryRef.current)
      plan.knownHashes.forEach(h => knownHashesRef.current.add(h))

      for (const { col, slot } of runnable) {
        if (cancelledRef.current) break
        const target = plan.targets.get(col.id)!
        if (target.skip) continue
        const res = await runCollection({
          jobId,
          collection: { ...col, target_gallery_id: target.targetGalleryId },
          listing: slot.listing!,
          business,
          clientId: col.matched_client_id,
          priorFiles: target.priorFiles,
          knownHashes: knownHashesRef.current,
          controls: { isPaused: () => pausedRef.current, isCancelled: () => cancelledRef.current },
          onProgress: p => setProgress(prev => ({ ...prev, [col.id]: p })),
          onGalleryReady: id => { memoryRef.current.galleryIds.set(col.id, id) },
        })
        outcomesRef.current.set(col.id, {
          collectionId: col.id, sourceName: col.source_name,
          galleryId: res.galleryId, gallerySlug: null,
          uploaded: res.uploaded, skippedDuplicate: res.skippedDuplicate,
          failed: res.failed, failures: res.failures,
        })
        if (res.stopped === 'cancelled') { cancelledRef.current = true; break }
        if (res.stopped === 'paused') {
          // Paused server-side only now, so the last chunk's checkpoint was accepted.
          await pauseJob(jobId).catch(() => setError('pause_failed'))
          setRunState('paused')
          return
        }
        memoryRef.current.finished.add(col.id)
      }

      setRunState(cancelledRef.current ? 'cancelled' : 'done')
      onFinished([...outcomesRef.current.values()])
    } catch (err) {
      console.warn('[import] run failed', err)
      setError('run_failed')
      setRunState(resuming ? 'paused' : 'idle')
    } finally {
      loopActiveRef.current = false
    }
  }, [runnable, jobId, business, onFinished])

  // The loop stops at the next chunk boundary and pauses the job then.
  const doPause = useCallback(() => {
    pausedRef.current = true
    setRunState('paused')
  }, [])

  // Resuming before the loop reached its pause point just un-pauses it; starting
  // a second loop would import the same collections twice.
  const doResume = useCallback(async () => {
    if (loopActiveRef.current) {
      pausedRef.current = false
      setRunState('running')
      return
    }
    const resumed = await resumeJob(jobId).catch(() => null)
    if (!resumed?.ok) { setError('resume_failed'); return }
    void run(true)
  }, [jobId, run])

  const doCancel = useCallback(async () => {
    cancelledRef.current = true
    setRunState('cancelled')
    const loopStopped = !loopActiveRef.current
    await cancelJob(jobId).catch(() => setError('cancel_failed'))
    // Cancelled while paused: no loop is left to hand the outcomes over.
    if (loopStopped) onFinished([...outcomesRef.current.values()])
  }, [jobId, onFinished])

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
        <ImportButton variant="ghost" onClick={onBack} disabled={running || runState === 'paused'}>{t('import.common.back')}</ImportButton>
        <div className="flex gap-2.5">
          {runState === 'idle' && <ImportButton onClick={() => void run()} disabled={runnable.length === 0}>{t('import.step4.start')}</ImportButton>}
          {running && <ImportButton variant="ghost" onClick={doPause}>{t('import.step4.pause')}</ImportButton>}
          {runState === 'paused' && <ImportButton onClick={doResume}>{t('import.step4.resume')}</ImportButton>}
          {(running || runState === 'paused') && <ImportButton variant="danger" onClick={doCancel}>{t('import.step4.cancel')}</ImportButton>}
        </div>
      </div>
    </ImportPanel>
  )
}
