import type { DeliverySettings, Gallery } from '@/shared/types'
import type { Lang } from '@/shared/i18n/viewerStrings'
import type { BrandDefaults } from '@/shared/gallery/galleryBranding'
import { resolveGridLayout } from '@/shared/gallery/galleryLayout'
import { coverIsEnabled } from '@/shared/gallery/coverImage'

export type WelcomeStyle = 'mosaic' | 'cinematic' | 'minimal'
export type TextAnimation = 'blur' | 'typewriter' | 'slide'
export type AnimationSpeed = 'slow' | 'normal' | 'fast'
export type FacePrivacyMode = 'open' | 'private'
export type ViewerRole = 'none' | 'client' | 'guest'

export const isMobileUA = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
export const isIOSUA = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)

/** Read a delivery_settings field, treating null/undefined as unset. */
function s<K extends keyof DeliverySettings>(settings: Partial<DeliverySettings>, key: K, fallback: DeliverySettings[K]): DeliverySettings[K] {
  const v = settings[key]
  return v === undefined || v === null ? fallback : v as DeliverySettings[K]
}

/** Demo galleries keep their files in a separate bucket. */
function imageBucketFor(gallery: Pick<Gallery, 'demo_expires_at'> | null | undefined): string {
  return gallery?.demo_expires_at ? 'demo-uploads' : 'gallery-images'
}

/**
 * Every setting the viewer renders from, with backward-compatible defaults.
 * Tolerates `gallery = null` so it can run before the page's early returns.
 */
export function resolveViewerSettings(gallery: Gallery | null) {
  const raw = (gallery?.delivery_settings || {}) as Partial<DeliverySettings>
  const rec = raw as Record<string, unknown>
  const brandDefaults = (gallery as unknown as { brand?: BrandDefaults } | null)?.brand

  const isFeedMode = rec.feedLayout as string === 'feed' && isMobileUA()
  const { layoutMode, imageSpacing } = resolveGridLayout(rec, isFeedMode)

  // Face search shows whenever the photographer enabled it; only a hard
  // 'failed' index hides it. Status clauses cover pre-flag galleries.
  const faceEnabled = gallery?.face_index_enabled === true || rec.faceIndexEnabled === true
  const faceSearchAvailable =
    !!gallery &&
    gallery.face_index_status !== 'failed' &&
    (faceEnabled ||
      gallery.face_index_status === 'done' ||
      (gallery.face_index_status === 'indexing' && (gallery.face_indexed_count ?? 0) > 0))
  const facePrivacyMode = (rec.facePrivacyMode as FacePrivacyMode) || 'open'
  const studioName = s(raw, 'studioName', '')

  return {
    raw,
    rec,
    lang: (rec.language as Lang) || 'he',
    imgBucket: imageBucketFor(gallery),
    accessType: (gallery?.access_type ?? s(raw, 'accessType', 'public')) as string,
    signedGateOn: (gallery as { signed_gate_enabled?: boolean } | null)?.signed_gate_enabled === true,
    galleryTitle: s(raw, 'galleryTitle', '') || (gallery?.name ?? ''),
    clientName: s(raw, 'clientName', '') || gallery?.client_name,
    clientSelectionEnabled: raw.clientSelectionEnabled ?? false,
    isFeedMode,
    layoutMode,
    imageSpacing,
    cornerStyle: isFeedMode ? 'sharp' : s(raw, 'cornerStyle', 'sharp'),
    headingFont: (((rec.headingFont as string) || brandDefaults?.headingFont || '') as string).trim(),
    bodyFont: (((rec.bodyFont as string) || brandDefaults?.bodyFont || '') as string).trim(),
    studioName,
    studioWebsite: rec.studioWebsite as string || '',
    showFooterCredit: s(raw, 'showFooterCredit', true),
    showStories: s(raw, 'showStories', true),
    // 'high' is the ~2048px web derivative; only an explicit 'original' serves originals.
    downloadQuality: s(raw, 'downloadQuality', 'high'),
    downloadsEnabled: raw.downloadsEnabled !== undefined ? raw.downloadsEnabled : rec.allowDownloads !== false,
    trackDownloads: rec.trackDownloads === true,
    faceSearchAvailable,
    facePrivacyMode,
    watermarkEnabled: rec.watermarkEnabled === true,
    watermarkText: ((rec.watermarkText as string) || studioName || '').trim(),
    watermarkPosition: (rec.watermarkPosition as string) || 'bottom-right',
    coverEnabled: coverIsEnabled(rec),
    welcomeStyle: raw.welcomeStyle || 'mosaic',
    galleryDescription: raw.galleryDescription || '',
    welcomeMessage: rec.welcomeMessage as string | undefined,
    textAnimation: (rec.welcomeTextAnimation as TextAnimation) || 'blur',
    animationSpeed: (rec.welcomeAnimationSpeed as AnimationSpeed) || 'normal',
    eventDate: (gallery?.event_date ?? raw.eventDate) || '',
    eventLocation: (gallery?.event_location ?? raw.eventLocation) || '',
    coverCrop: raw.coverCrop,
  }
}

export type ViewerSettings = ReturnType<typeof resolveViewerSettings>
