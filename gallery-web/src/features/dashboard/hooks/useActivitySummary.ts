import { useCallback, useEffect, useRef, useState } from 'react'
import { getGalleryActivitySummary } from '@/shared/data/activity'
import type { ActivitySummary, EditorTab } from '../types'

// Per-gallery downloads / favourites / recent email recipients. Shared by the
// Activity tab (lazy-loaded when opened) and the Share Center.
export function useActivitySummary(editTab: EditorTab, editingGalleryId: string | undefined) {
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  // Only the latest request may land: an older gallery's summary must not show for the new one.
  const requestSeqRef = useRef(0)
  const summaryGalleryIdRef = useRef<string | null>(null)

  const loadActivitySummary = useCallback((galleryId: string) => {
    const seq = ++requestSeqRef.current
    if (summaryGalleryIdRef.current !== galleryId) setActivitySummary(null)
    summaryGalleryIdRef.current = galleryId
    setActivityLoading(true)
    return getGalleryActivitySummary(galleryId).then(({ data, error }) => {
        if (seq !== requestSeqRef.current) return
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
