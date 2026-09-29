import { cn } from '@/shared/ui'
import { useEditor, useOpenGallery } from './EditorContext'
import { headerAction } from './headerAction'

// Publish (draft) / Update (live). Idle live galleries are dashed + muted,
// pending work is filled black with an amber "dirty" pill, in-flight is
// disabled, and a just-published state flashes a sage confirmation.
export function PublishButton() {
  const { session } = useEditor()
  const gallery = useOpenGallery()
  const { unpublishedChanges, publishing, justPublished, publishGallery } = session
  const isDraft = gallery.status !== 'live'
  const hasWork = isDraft || unpublishedChanges
  const disabled = !hasWork || publishing
  const baseLabel = publishing
    ? 'מפרסם…'
    : justPublished
      ? (isDraft ? '✓ פורסם' : '✓ עודכן')
      : (isDraft ? 'פרסום' : (hasWork ? 'עדכון' : 'מעודכן'))
  const filled = hasWork && !justPublished && !publishing
  const successTint = justPublished

  return (
    <>
      {hasWork && !justPublished && !publishing && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.06em] text-pending-ink">
          <span className="size-2 rounded-full bg-pending shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-pending)_18%,transparent)]" />
          {isDraft ? 'טיוטה' : 'שינויים שטרם פורסמו'}
        </span>
      )}
      <button
        onClick={publishGallery}
        disabled={disabled}
        aria-live="polite"
        className={cn(
          headerAction,
          'min-w-[110px] justify-center px-[22px]',
          'transition-[background-color,border-color,color,opacity,box-shadow] duration-150',
          successTint
            ? 'border-go/50 bg-go/12 text-go-ink'
            : filled
              ? 'border-ink bg-ink text-white'
              : 'border-dashed border-line bg-transparent text-muted',
          disabled ? 'cursor-default' : 'cursor-pointer',
          disabled && !successTint && !publishing ? 'opacity-45' : 'opacity-100',
          filled && !publishing ? 'shadow-[0_1px_0_color-mix(in_srgb,var(--color-ink)_18%,transparent),0_4px_14px_color-mix(in_srgb,var(--color-ink)_12%,transparent)]' : 'shadow-none',
        )}
      >{baseLabel}</button>
    </>
  )
}
