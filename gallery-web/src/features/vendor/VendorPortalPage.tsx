import { useState } from 'react'
import { signedStorageUrl } from '@/shared/lib/signedStorage'
import { Spinner } from '@/shared/ui'
import { downloadImage } from './downloadImage'
import { useReveal } from './useReveal'
import { useVendorPortal, type TaggedImage } from './useVendorPortal'
import { VendorGallerySection } from './VendorGallerySection'
import { VendorHeader } from './VendorHeader'
import { VendorStats } from './VendorStats'

/** Vendors (florists, venues…) browse and download the photos they're tagged in. */
export function VendorPortal() {
  const { vendor, images, galleries, error, loading, selectedIds, setSelectedIds } = useVendorPortal()
  const [downloading, setDownloading] = useState(false)
  const [selectAll, setSelectAll] = useState(true)
  const reveal = useReveal()

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="size-7 animate-[spin_0.7s_cubic-bezier(.4,0,.2,1)_infinite] border-[2.5px] border-white/8 border-t-gallery-accent/70 shadow-[0_0_16px] shadow-gallery-accent/12" />
    </div>
  )
  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-night font-[-apple-system,sans-serif] text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-[14px] bg-danger-strong/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-danger-strong">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-[15px] text-white/70">{error}</p>
      </div>
    </div>
  )
  if (!vendor) return null

  const byGallery = new Map<string, TaggedImage[]>()
  images.forEach(img => {
    const arr = byGallery.get(img.gallery_id) || []
    arr.push(img)
    byGallery.set(img.gallery_id, arr)
  })

  const handleDownloadSelected = async () => {
    setDownloading(true)
    const selected = images.filter(i => selectedIds.has(i.id))
    for (const img of selected) {
      const url = await signedStorageUrl('gallery-images', img.storage_path)
      await downloadImage(url, img.filename)
      // Browsers drop rapid-fire programmatic downloads.
      await new Promise(r => setTimeout(r, 200))
    }
    setDownloading(false)
  }

  const toggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set())
      setSelectAll(false)
    } else {
      setSelectedIds(new Set(images.map(i => i.id)))
      setSelectAll(true)
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-night font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] text-white">
      <VendorHeader
        vendor={vendor}
        allSelected={selectAll}
        selectedCount={selectedIds.size}
        downloading={downloading}
        onToggleAll={toggleAll}
        onDownload={handleDownloadSelected}
      />

      <div className="mx-auto max-w-[1000px] px-6 pt-8 pb-24">
        <VendorStats ref={reveal} tagged={images.length} events={byGallery.size} selected={selectedIds.size} />

        {Array.from(byGallery.entries()).map(([galleryId, imgs]) => (
          <VendorGallerySection
            key={galleryId}
            ref={reveal}
            gallery={galleries.get(galleryId)}
            images={imgs}
            selectedIds={selectedIds}
            onToggle={toggleOne}
          />
        ))}

        <div className="mt-12 border-t border-white/5 pt-6 text-center">
          <p className="text-[11px] text-white/15">Powered by Pixflow</p>
        </div>
      </div>
    </div>
  )
}
