// Per-collection counts, failure details, and retry of failed files (retry_failed).
import { useState } from 'react'
import type { WizardCommon, CollectionOutcome } from '../wizardTypes'
import { retryFailed } from '../importApi'
import { ImportPanel } from '../components/ImportPanel'
import { ImportButton } from '../components/ImportButton'
import { Chip } from '../components/Chip'
import { Notice } from '../components/Notice'
import { card, detailsList, detailsSummary, emptyText, heading, intro } from '../components/theme'

export function Step5Report({
  t, jobId, outcomes, onOpenGallery, onDone,
}: WizardCommon & {
  jobId: string
  outcomes: CollectionOutcome[]
  onOpenGallery?: (galleryId: string) => void
  onDone: () => void
}) {
  const [retrying, setRetrying] = useState(false)
  const [retried, setRetried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalFailed = outcomes.reduce((n, o) => n + o.failed, 0)

  const doRetry = async () => {
    setRetrying(true); setError(null)
    try {
      const res = await retryFailed(jobId)
      if (res.ok) setRetried(true)
      else setError(res.error ?? 'retry_failed')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <ImportPanel>
      <h2 className={heading}>{t('import.step5.title')}</h2>
      <p className={intro}>{t('import.step5.intro')}</p>

      {outcomes.length === 0 && <div className={emptyText}>{t('import.common.empty')}</div>}

      <div className="flex flex-col gap-3">
        {outcomes.map(o => (
          <div key={o.collectionId} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong className="text-sm">{o.sourceName}</strong>
              <div className="flex flex-wrap gap-2">
                <Chip kind="ok">{t('import.step5.imported')}: {o.uploaded}</Chip>
                <Chip kind="neutral">{t('import.step5.skipped')}: {o.skippedDuplicate}</Chip>
                <Chip kind={o.failed ? 'danger' : 'neutral'}>{t('import.step5.failed')}: {o.failed}</Chip>
              </div>
            </div>

            {o.galleryId && onOpenGallery && (
              <div className="mt-2.5">
                <ImportButton variant="ghost" onClick={() => onOpenGallery(o.galleryId!)}>{t('import.step5.openGallery')}</ImportButton>
              </div>
            )}

            {o.failures.length > 0 && (
              <details className="mt-2.5">
                <summary className={detailsSummary}>{t('import.step5.failures')}</summary>
                <ul className={detailsList}>
                  {o.failures.slice(0, 100).map((f, i) => (
                    <li key={i}>{f.filename}: {f.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      {error && <div className="mt-4"><Notice tone="danger">{t('import.common.error')}</Notice></div>}
      {retried && <div className="mt-4"><Notice tone="ok">{t('import.common.retry')}</Notice></div>}

      <div className="mt-5 flex flex-wrap justify-between gap-3">
        <div>
          {totalFailed > 0 && !retried && (
            <ImportButton variant="ghost" onClick={doRetry} disabled={retrying}>
              {retrying ? t('import.common.loading') : t('import.step5.retry')}
            </ImportButton>
          )}
        </div>
        <ImportButton onClick={onDone}>{t('import.step5.done')}</ImportButton>
      </div>
    </ImportPanel>
  )
}
