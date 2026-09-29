import type { OwnerStringKey } from '@/shared/i18n/ownerLocale'

export interface TourStep {
  id: string
  /** value of the data-tour attribute to highlight; omit to center the card */
  target?: string
  titleKey: OwnerStringKey
  bodyKey: OwnerStringKey
}

// Default steps for the owner dashboard. Targets are data-tour attribute
// values on the matching nav items / actions.
export const OWNER_TOUR_STEPS: TourStep[] = [
  { id: 'overview', target: 'overview', titleKey: 'tour.overview.title', bodyKey: 'tour.overview.body' },
  { id: 'clients', target: 'clients', titleKey: 'tour.clients.title', bodyKey: 'tour.clients.body' },
  { id: 'galleries', target: 'galleries', titleKey: 'tour.galleries.title', bodyKey: 'tour.galleries.body' },
  { id: 'assign', target: 'assign-gallery', titleKey: 'tour.assign.title', bodyKey: 'tour.assign.body' },
  { id: 'search', target: 'search', titleKey: 'tour.search.title', bodyKey: 'tour.search.body' },
  { id: 'import', target: 'import', titleKey: 'tour.import.title', bodyKey: 'tour.import.body' },
  { id: 'preview', target: 'client-preview', titleKey: 'tour.preview.title', bodyKey: 'tour.preview.body' },
]

// RestartTourButton dispatches this; a mounted FirstRunTour with the same
// surface reopens at step 0.
export const TOUR_RESTART_EVENT = 'pixflow:restart-tour'
