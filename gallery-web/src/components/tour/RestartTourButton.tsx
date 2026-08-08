// RestartTourButton: a small help-menu entry that resets tour progress and
// reopens the mounted <FirstRunTour /> for the same surface. Safe to place in
// any owner-side menu; it renders a plain button (style it via className or
// let the default subtle style stand).

import { useCallback } from 'react'
import { useOwnerLocale } from '../../lib/ownerLocale'
import { saveProgress } from '../../lib/onboarding'
import { TOUR_RESTART_EVENT } from './FirstRunTour'

export interface RestartTourButtonProps {
  surface?: string
  className?: string
  style?: React.CSSProperties
}

export function RestartTourButton({ surface = 'owner_tour', className, style }: RestartTourButtonProps) {
  const { t } = useOwnerLocale()

  const onClick = useCallback(() => {
    // Reset first so a page refresh mid-restart still shows the tour, then
    // ping the mounted FirstRunTour (same surface) to reopen immediately.
    void saveProgress(surface, { status: 'pending', step: 0 }).then(() => {
      window.dispatchEvent(new CustomEvent(TOUR_RESTART_EVENT, { detail: { surface } }))
    })
  }, [surface])

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={className ? style : {
        font: 'inherit', fontSize: 14, color: '#334155',
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '6px 10px', borderRadius: 8, textAlign: 'start',
        ...style,
      }}
    >
      {t('tour.restart')}
    </button>
  )
}

export default RestartTourButton
