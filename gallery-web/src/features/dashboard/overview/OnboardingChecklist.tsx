import { cn } from '@/shared/ui'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import type { ChecklistItem } from './useOwnerOverview'
import { SkeletonRows } from './SkeletonRows'

export function OnboardingChecklist({ loading, checklist, doneCount, onDismiss }: {
  loading: boolean
  checklist: ChecklistItem[]
  doneCount: number
  onDismiss: () => void
}) {
  const { t } = useOwnerLocale()
  return (
    <section className="mb-8 rounded-[8px] border border-line-soft bg-raised px-[26px] pt-[26px] pb-5">
      <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {t('overview.checklist.title')}
          </h2>
          <p className="mt-1.5 text-[13px] text-muted">
            {loading
              ? t('overview.loading')
              : t('overview.checklist.progress', { done: doneCount, total: checklist.length })}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="cursor-pointer border-none bg-transparent px-1.5 py-1 text-xs text-muted"
        >
          {t('overview.checklist.dismiss')}
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={3} />
      ) : (
        <ol className="flex flex-col gap-0.5">
          {checklist.map(item => (
            <li key={item.key} className="flex items-center gap-3.5 border-t border-line-soft py-[13px]">
              <span
                aria-hidden
                className={cn(
                  'flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-bold text-white',
                  item.done ? 'border-success bg-success' : 'border-line-soft bg-transparent',
                )}
              >
                {item.done ? '✓' : ''}
              </span>
              <span className={cn('flex-1 text-sm', item.done ? 'text-muted line-through' : 'text-ink')}>
                {item.label}
              </span>
              {!item.done && (
                <button
                  onClick={item.action}
                  className="cursor-pointer rounded-[4px] border border-line-soft bg-transparent px-3.5 py-[7px] text-xs font-semibold whitespace-nowrap text-ink"
                >
                  {item.actionLabel}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
