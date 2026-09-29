import type { ImportCollection, T, ZipSlot } from '../wizardTypes'
import { Chip } from './Chip'
import { Notice } from './Notice'
import { card, detailsList, detailsSummary, textDim, textMain } from './theme'

/** One picked ZIP: validation summary, target collection picker, rejection reasons. */
export function ZipSlotCard({ t, slot: z, targets, onRemap, onRemove }: {
  t: T
  slot: ZipSlot
  targets: ImportCollection[]
  onRemap: (collectionId: string | null) => void
  onRemove: () => void
}) {
  const s = z.listing?.summary
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong className="text-sm">{z.file.name}</strong>
        <button type="button" onClick={onRemove} className={`${textDim} bg-transparent text-[13px]`}>
          {t('import.common.close')}
        </button>
      </div>

      {z.error && (
        <div className="mt-2.5">
          <Notice tone="danger">{z.error === 'zip_too_large' ? t('import.step3.zipTooBig') : t('import.common.error')}</Notice>
        </div>
      )}

      {s && (
        <>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Chip kind="ok">{t('import.step3.validFiles')}: {s.accepted.length}</Chip>
            <Chip kind="neutral">{t('import.step3.skipped')}: {s.skipped.length}</Chip>
            <Chip kind={s.rejected.length ? 'danger' : 'neutral'}>{t('import.step3.rejected')}: {s.rejected.length}</Chip>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <label className={`${textDim} text-[13px]`}>{t('import.step3.assignTo')}</label>
            <select
              value={z.collectionId ?? ''}
              onChange={e => onRemap(e.target.value || null)}
              className={`${textMain} rounded-sm border border-night-line bg-night-raised px-2 py-1.5 text-[13px]`}
            >
              <option value="">{t('import.step3.unassigned')}</option>
              {targets.map(c => (
                <option key={c.id} value={c.id}>{c.source_name}</option>
              ))}
            </select>
          </div>

          {s.overJobCap && (
            <div className="mt-2.5"><Notice tone="warn">{t('import.step3.totalWarning')}</Notice></div>
          )}

          {s.rejected.length > 0 && (
            <details className="mt-2.5">
              <summary className={detailsSummary}>{t('import.step3.rejectedWhy')}</summary>
              <ul className={detailsList}>
                {s.rejected.slice(0, 50).map((r, i) => (
                  <li key={i}>{r.path}: {t(`import.reject.${r.reason}` as never)}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
