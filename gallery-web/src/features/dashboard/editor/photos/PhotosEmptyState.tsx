import { Icon } from '@/shared/ui/Icon'

export function PhotosEmptyState() {
  return (
    <div className="border border-dashed border-line bg-surface px-6 py-20 text-center">
      <Icon name="photo" size={36} strokeWidth={1.2} className="opacity-40" />
      <p className="mt-4 text-[14px] font-medium text-ink-soft">
        אין עדיין תמונות בגלריה הזו
      </p>
      <p className="mt-1.5 text-[11px] font-medium tracking-label text-muted uppercase">
        Drag photos anywhere · or click Add Media
      </p>
    </div>
  )
}
