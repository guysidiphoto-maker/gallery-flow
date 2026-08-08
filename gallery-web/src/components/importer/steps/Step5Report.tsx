// Step5Report.tsx — per-collection imported/skipped/failed counts, failure
// details, and a retry-failed button (calls retry_failed). Optionally opens a
// created gallery via the onOpenGallery prop passed to ImportCenter.

import React, { useState } from 'react'
import { Panel, Button, Chip, Notice, palette } from '../ui'
import type { WizardCommon, CollectionOutcome } from '../wizardTypes'
import { retryFailed } from '../importApi'

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
    <Panel>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{t('import.step5.title')}</h2>
      <p style={{ color: palette.textDim, fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>{t('import.step5.intro')}</p>

      {outcomes.length === 0 && (
        <div style={{ color: palette.textDim, fontSize: 14, padding: '12px 0' }}>{t('import.common.empty')}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {outcomes.map(o => (
          <div key={o.collectionId} style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{o.sourceName}</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip kind="ok">{t('import.step5.imported')}: {o.uploaded}</Chip>
                <Chip kind="neutral">{t('import.step5.skipped')}: {o.skippedDuplicate}</Chip>
                <Chip kind={o.failed ? 'danger' : 'neutral'}>{t('import.step5.failed')}: {o.failed}</Chip>
              </div>
            </div>

            {o.galleryId && onOpenGallery && (
              <div style={{ marginTop: 10 }}>
                <Button variant="ghost" onClick={() => onOpenGallery(o.galleryId!)}>{t('import.step5.openGallery')}</Button>
              </div>
            )}

            {o.failures.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: palette.textDim }}>{t('import.step5.failures')}</summary>
                <ul style={{ margin: '8px 0 0', paddingInlineStart: 20, fontSize: 12, color: palette.textDim }}>
                  {o.failures.slice(0, 100).map((f, i) => (
                    <li key={i}>{f.filename}: {f.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      {error && <div style={{ marginTop: 16 }}><Notice tone="danger">{t('import.common.error')}</Notice></div>}
      {retried && <div style={{ marginTop: 16 }}><Notice tone="ok">{t('import.common.retry')}</Notice></div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          {totalFailed > 0 && !retried && (
            <Button variant="ghost" onClick={doRetry} disabled={retrying}>
              {retrying ? t('import.common.loading') : t('import.step5.retry')}
            </Button>
          )}
        </div>
        <Button onClick={onDone}>{t('import.step5.done')}</Button>
      </div>
    </Panel>
  )
}
