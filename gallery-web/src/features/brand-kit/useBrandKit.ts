import { useEffect, useRef, useState } from 'react'
import { supabase, storageUrl } from '@/shared/lib/supabase'
import {
  BRAND_KIT_BUCKET,
  type BrandKit,
  type BrandKitLogoSlot,
  defaultBrandKit,
  getBrandKit,
  logoStoragePath,
  saveBrandKit,
} from './brandKit'

const TOAST_MS = 2200

/**
 * Loads the owner's brand kit and exposes save/upload actions with a status toast.
 * Runs inside the dashboard, which already owns auth and the business row.
 */
export function useBrandKit(businessId: string | null) {
  const [brand, setBrand] = useState<BrandKit>(defaultBrandKit())
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void getBrandKit(businessId).then(fresh => {
      if (cancelled) return
      if (fresh) setBrand(fresh)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [businessId])

  function flashToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }

  /** Optimistically apply `next`, then persist the whole document. */
  async function saveSection(next: BrandKit, sectionLabel: string) {
    if (!businessId) return
    setBrand(next)
    const res = await saveBrandKit(businessId, next)
    if (res.ok) flashToast(`${sectionLabel} נשמר`)
    else flashToast(`שגיאה: ${res.error}`)
  }

  async function saveAll() {
    if (!businessId) return
    const res = await saveBrandKit(businessId, brand)
    if (res.ok) flashToast('Brand Kit נשמר')
    else flashToast(`שגיאה: ${res.error}`)
  }

  async function uploadLogo(slot: BrandKitLogoSlot, file: File) {
    if (!businessId) return
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
    const path = logoStoragePath(businessId, slot, ext)
    const { error } = await supabase.storage
      .from(BRAND_KIT_BUCKET)
      // Short cache: the URL is stable, so a ?t= cache-bust is appended below.
      .upload(path, file, { contentType: file.type || 'image/png', upsert: true, cacheControl: '300' })
    if (error) {
      flashToast(`שגיאה בהעלאה: ${error.message}`)
      return
    }
    const publicUrl = `${storageUrl(BRAND_KIT_BUCKET, path)}?t=${Date.now()}`
    await saveSection({ ...brand, logo: { ...brand.logo, [slot]: publicUrl } }, 'לוגו')
  }

  async function clearLogo(slot: BrandKitLogoSlot) {
    if (!businessId) return
    await saveSection({ ...brand, logo: { ...brand.logo, [slot]: null } }, 'לוגו')
  }

  return {
    loading,
    brand,
    setBrand,
    toast,
    saveSection,
    saveAll,
    uploadLogo,
    clearLogo,
  }
}
