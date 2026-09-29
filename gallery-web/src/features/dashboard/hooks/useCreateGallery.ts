import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { applyBrandKitToGalleryDefaults, getBrandKit } from '@/features/brand-kit/brandKit'
import { assignGallery } from '@/features/clients/api'
import type { Toast } from '../types'

export type WelcomeStyle = 'mosaic' | 'cinematic' | 'minimal'
export type FeedLayout = 'grid' | 'masonry' | 'carousel'
export type FacePrivacyMode = 'open' | 'private'

// "New gallery" modal form state + the insert.
export function useCreateGallery(deps: {
  businessId: string | null
  showToast: Toast
  fetchGalleries: () => void
}) {
  const { businessId, showToast, fetchGalleries } = deps
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [creating, setCreating] = useState(false)
  // null = "no client yet", a first-class value that never blocks creation.
  const [newGalleryClientId, setNewGalleryClientId] = useState<string | null>(null)
  const [welcomeStyle, setWelcomeStyle] = useState<WelcomeStyle>('mosaic')
  const [requireGalleryCode, setRequireGalleryCode] = useState(false)
  const [galleryCode, setGalleryCode] = useState('')
  const [trackDownloads, setTrackDownloads] = useState(false)
  const [feedLayout, setFeedLayout] = useState<FeedLayout>('grid')
  // Turning face recognition on goes through a confirm dialog explaining it.
  const [faceRecognition, setFaceRecognition] = useState(false)
  const [facePrivacyMode, setFacePrivacyMode] = useState<FacePrivacyMode>('open')
  const [showFaceConfirm, setShowFaceConfirm] = useState(false)

  async function createGallery() {
    if (!newName.trim()) return
    if (!businessId) {
      console.warn('[createGallery] missing businessId')
      showToast({ kind: 'error', text: 'שגיאה: לא נמצא חשבון עסקי. נסו לרענן את הדף.' })
      return
    }
    setCreating(true)
    // Brand Kit defaults (studio name / logo / welcome message) spread last.
    const brand = await getBrandKit(businessId)
    const brandDefaults = applyBrandKitToGalleryDefaults(brand)
    const { data: created, error } = await supabase.from('galleries').insert({
      name: newName.trim(),
      business_id: businessId,
      status: 'draft',
      image_count: 0,
      face_index_enabled: faceRecognition,
      delivery_settings: {
        faceIndexEnabled: faceRecognition,
        facePrivacyMode,
        accessType: 'public',
        password: null,
        downloadsEnabled: true,
        bulkDownloadEnabled: false,
        downloadQuality: 'web',
        studioName: '',
        logoUrl: null,
        showFooterCredit: true,
        galleryTitle: newName.trim(),
        clientName: '',
        coverImageId: null,
        coverImageUrl: null,
        coverCrop: null,
        galleryDescription: '',
        eventDate: newDate || '',
        eventLocation: '',
        eventType: '',
        clientSelectionEnabled: false,
        clientCode: '',
        layoutMode: '2-col',
        imageSpacing: 'small',
        cornerStyle: 'rounded',
        generateStories: false,
        showStories: true,
        welcomeStyle,
        requireGalleryCode,
        galleryCode: requireGalleryCode ? galleryCode : '',
        trackDownloads,
        feedLayout,
        ...brandDefaults,
      },
    }).select('id').single()
    setCreating(false)
    if (error) {
      console.warn('[createGallery]', error)
      const limitHit = /gallery_limit_reached/i.test(error.message)
      showToast({
        kind: 'error',
        text: limitHit
          ? 'הגעת למספר הגלריות המרבי בתוכנית החינמית. מחק גלריה ישנה או שדרג כדי ליצור עוד.'
          : `שגיאה ביצירת גלריה: ${error.message}`,
      })
      return
    }
    // Client connection runs only after the insert succeeded and never blocks it.
    if (newGalleryClientId && created?.id) {
      const res = await assignGallery({ galleryId: created.id, clientId: newGalleryClientId })
      if (!res.ok) {
        showToast({ kind: 'error', text: 'הגלריה נוצרה, אך חיבור הלקוח נכשל. אפשר לחבר אותה מאוחר יותר במסך הלקוחות.' })
      }
    }
    setShowModal(false)
    setNewName('')
    setNewDate('')
    setNewGalleryClientId(null)
    setWelcomeStyle('mosaic')
    setRequireGalleryCode(false)
    setGalleryCode('')
    setTrackDownloads(false)
    setFeedLayout('grid')
    setFaceRecognition(false)
    setFacePrivacyMode('open')
    fetchGalleries()
  }

  return {
    showModal, setShowModal,
    newName, setNewName,
    newDate, setNewDate,
    creating,
    newGalleryClientId, setNewGalleryClientId,
    welcomeStyle, setWelcomeStyle,
    requireGalleryCode, setRequireGalleryCode,
    galleryCode, setGalleryCode,
    trackDownloads, setTrackDownloads,
    feedLayout, setFeedLayout,
    faceRecognition, setFaceRecognition,
    facePrivacyMode, setFacePrivacyMode,
    showFaceConfirm, setShowFaceConfirm,
    createGallery,
  }
}

export type CreateGalleryState = ReturnType<typeof useCreateGallery>
