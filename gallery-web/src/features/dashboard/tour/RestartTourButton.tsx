// Help-menu entry that resets tour progress and reopens the mounted
// <FirstRunTour /> for the same surface. Pass className to restyle it.

import { useCallback } from 'react'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { saveProgress } from './onboarding'
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
      className={className ?? 'cursor-pointer rounded-[8px] border-none bg-transparent px-2.5 py-1.5 text-start text-sm text-ink-soft'}
      style={style}
    >
      {t('tour.restart')}
    </button>
  )
}

export default RestartTourButton
