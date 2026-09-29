import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import type { PhotoSort } from '../../lib/photoOrder'
import { useEditor } from '../EditorContext'
import { SectionHeading } from './SectionHeading'

const control = 'inline-flex h-9 items-center rounded-hair border text-xs'

const GRID_SIZES = [
  { id: 'regular' as const, label: 'תצוגת רשת צפופה', icon: 'grid-small' as const },
  { id: 'large'   as const, label: 'תצוגת רשת גדולה', icon: 'grid-large' as const },
]

// Top strip: section heading, hidden file pickers, then the photo controls.
export function PhotosToolbar() {
  const { session, upload, photos } = useEditor()
  const { galleryImages } = session
  const { fileInputRef, handleFileUpload, uploading } = upload
  const { replaceInputRef, handleReplaceFile, photoSort, setPhotoSort, gridSize, setGridSize, selectMode, setSelectMode } = photos

  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <SectionHeading />
      <input ref={fileInputRef} type="file" multiple accept="image/*"
        className="hidden"
        onChange={e => {
          // Copy, then reset so picking the same files again still fires onChange.
          const files = e.target.files ? Array.from(e.target.files) : null
          e.target.value = ''
          void handleFileUpload(files)
        }} />
      {/* Drives "Replace photo"; reset so re-picking the same file fires again. */}
      <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleReplaceFile(f)
        }} />
      {/* Reading order (RTL): primary Add Media, then Select, then the view
          controls (grid size + sort) grouped at the end. One height for all. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            control,
            'gap-2 border-ink bg-ink px-4 font-medium text-white',
            uploading ? 'cursor-wait opacity-60' : 'cursor-pointer',
          )}
        >
          <Icon name="plus" size={14} strokeWidth={2} />
          הוספת מדיה
        </button>
        {galleryImages.length > 0 && !selectMode && (
          <button
            onClick={() => setSelectMode(true)}
            aria-label="בחירת תמונות"
            className={cn(control, 'cursor-pointer gap-2 border-line bg-transparent px-4 font-medium text-ink hover:border-ink')}
          >
            <Icon name="check" size={14} strokeWidth={1.85} />
            בחירה
          </button>
        )}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <div role="group" aria-label="גודל תצוגה" className="flex rounded-hair border border-line">
          {GRID_SIZES.map(s => (
            <button
              key={s.id}
              onClick={() => setGridSize(s.id)}
              aria-label={s.label}
              aria-pressed={gridSize === s.id}
              title={s.label}
              className={cn(
                'flex size-9 cursor-pointer items-center justify-center',
                gridSize === s.id ? 'bg-ink text-white' : 'bg-raised text-ink hover:bg-sunken',
                s.id === 'large' && 'border-s border-line',
              )}
            >
              <Icon name={s.icon} size={14} strokeWidth={1.85} />
            </button>
          ))}
        </div>
        <select
          value={photoSort}
          onChange={(e) => setPhotoSort(e.target.value as PhotoSort)}
          aria-label="מיון תמונות"
          title="מיון תמונות"
          className={cn(control, 'cursor-pointer border-line bg-raised px-3 text-ink outline-none')}
        >
          <option value="order">סדר ידני</option>
          <option value="name">לפי שם</option>
          <option value="newest">חדשות קודם</option>
        </select>
      </div>
    </div>
  )
}
