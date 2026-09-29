import { border, textMuted, textPrimary } from '../styles'
import { useEditor, useOpenGallery } from './EditorContext'

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
      : (isDraft ? 'Publish' : (hasWork ? 'Update' : 'מעודכן'))
  const filled = hasWork && !justPublished && !publishing
  const successTint = justPublished

  return (
    <>
      {hasWork && !justPublished && !publishing && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 500, color: '#b45309',
          letterSpacing: '0.06em',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#d97706',
            boxShadow: '0 0 0 3px rgba(217,119,6,.18)',
          }} />
          {isDraft ? 'טיוטה' : 'שינויים שטרם פורסמו'}
        </span>
      )}
      <button
        onClick={publishGallery}
        disabled={disabled}
        aria-live="polite"
        style={{
          padding: '10px 22px', borderRadius: 2, fontSize: 11, fontWeight: 500,
          background: successTint
            ? 'rgba(45,196,121,.12)'
            : filled ? textPrimary : 'transparent',
          border: successTint
            ? `1px solid rgba(45,196,121,.5)`
            : filled
              ? `1px solid ${textPrimary}`
              : `1px dashed ${border}`,
          color: successTint
            ? '#1b8a4e'
            : filled ? '#fff' : textMuted,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled && !successTint && !publishing ? 0.45 : 1,
          fontFamily: 'inherit',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          transition: 'background .15s, border-color .15s, color .15s, opacity .15s, box-shadow .15s',
          minWidth: 110,
          boxShadow: filled && !publishing ? '0 1px 0 rgba(20,20,19,.18), 0 4px 14px rgba(20,20,19,.12)' : 'none',
        }}
      >{baseLabel}</button>
    </>
  )
}
