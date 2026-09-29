import { cn } from '@/shared/ui'
import type { VendorInfo } from './useVendorPortal'

export function VendorHeader({ vendor, allSelected, selectedCount, downloading, onToggleAll, onDownload }: {
  vendor: VendorInfo
  allSelected: boolean
  selectedCount: number
  downloading: boolean
  onToggleAll: () => void
  onDownload: () => void
}) {
  const active = selectedCount > 0
  return (
    <header className="sticky top-0 z-[100] border-b border-white/6 bg-night/95 px-6 py-4 backdrop-blur-lg">
      <div className="mx-auto flex max-w-[1000px] items-center justify-between">
        <div className="flex items-center gap-3">
          {vendor.logo_url ? (
            <img src={vendor.logo_url} alt="" className="size-9 rounded-[8px] object-cover" />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-[8px] bg-linear-135/srgb from-brand to-brand-soft text-[14px] font-bold">
              {vendor.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="m-0 text-[16px] font-semibold">{vendor.name}</h1>
            {vendor.category && (
              <span className="text-[11px] text-white/35 capitalize">{vendor.category}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleAll}
            className="rounded-[8px] border border-white/10 bg-white/4 px-3.5 py-2 text-[12px] text-white/60 transition-all duration-150"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={onDownload}
            disabled={!active || downloading}
            className={cn(
              'flex items-center gap-1.5 rounded-[8px] border-none px-5 py-2 text-[12px] font-semibold',
              active
                ? 'cursor-pointer bg-linear-135/srgb from-brand to-brand-soft text-white shadow-[0_4px_16px] shadow-brand/30'
                : 'cursor-default bg-white/6 text-white/30',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloading ? 'Downloading...' : `Download ${selectedCount} photos`}
          </button>
        </div>
      </div>
    </header>
  )
}
