import { useCallback, useEffect, useState } from 'react'
import { getGalleryActivitySummary } from '@/shared/data/activity'
import type { ActivitySummary, EditorTab } from '../types'

// Per-gallery downloads / favourites / recent email recipients. Shared by the
// Activity tab (lazy-loaded when opened) and the Share Center.
export function useActivitySummary(editTab: EditorTab, editingGalleryId: string | undefined) {
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)

  const loadActivitySummary = useCallback((galleryId: string) => {
    setActivityLoading(true)
    return getGalleryActivitySummary(galleryId).then(({ data, error }) => {
        if (error) {
          console.warn('[activities] fetch failed', error)
          setActivitySummary(null)
        } else if (data) {
          setActivitySummary(data as ActivitySummary)
        }
        setActivityLoading(false)
      })
  }, [])

  useEffect(() => {
    if (editTab !== 'activities' || !editingGalleryId) return
    void loadActivitySummary(editingGalleryId)
  }, [editTab, editingGalleryId, loadActivitySummary])

  return { activitySummary, activityLoading, loadActivitySummary }
}
