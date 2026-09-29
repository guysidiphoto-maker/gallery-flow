import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import type { PhotoSort } from '../../lib/photoOrder'
import { useEditor } from '../EditorContext'
import { SectionHeading } from './SectionHeading'

// Top strip: section heading, hidden file pickers, sort, grid size, select, Add Media.
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
        onChange={e => handleFileUpload(e.target.files)} />
      {/* Drives "Replace photo"; reset so re-picking the same file fires again. */}
      <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleReplaceFile(f)
        }} />
      <div className="flex items-center gap-2">
        <select
          value={photoSort}
          onChange={(e) => setPhotoSort(e.target.value as PhotoSort)}
          aria-label="מיון תמונות"
          className="cursor-pointer rounded-hair border border-line bg-raised px-3 py-2 text-[11px] tracking-[0.14em] text-ink uppercase outline-none"
        >
          <option value="order">סדר ידני</option>
          <option value="name">שם</option>
          <option value="newest">חדש קודם</option>
        </select>
        <div className="flex rounded-hair border border-line">
          {([
            { id: 'regular' as const, label: 'Regular' },
            { id: 'large'   as const, label: 'Large' },
          ]).map(s => (
            <button
              key={s.id}
              onClick={() => setGridSize(s.id)}
              aria-label={`Grid ${s.label}`}
              title={s.label}
              className={cn(
                'flex cursor-pointer items-center px-2.5 py-2',
                gridSize === s.id ? 'bg-ink text-white' : 'bg-raised text-ink',
                s.id === 'large' && 'border-s border-line',
              )}
            >
              <Icon name={s.id === 'regular' ? 'sections' : 'gallery'} size={13} strokeWidth={1.85} />
            </button>
          ))}
        </div>
        {galleryImages.length > 0 && !selectMode && (
          <button
            onClick={() => setSelectMode(true)}
            aria-label="בחירת תמונות"
            className="inline-flex cursor-pointer items-center gap-2 rounded-hair border border-line bg-transparent px-4 py-2.5 text-[11px] font-medium tracking-label text-ink uppercase"
          >
            <Icon name="check" size={13} strokeWidth={1.85} />
            בחר
          </button>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'inline-flex items-center gap-2 rounded-hair border border-ink bg-ink px-5 py-2.5 text-[11px] font-medium tracking-label text-white uppercase',
            uploading ? 'cursor-wait opacity-60' : 'cursor-pointer',
          )}
        >
          <Icon name="plus" size={13} strokeWidth={2} />
          Add Media
        </button>
      </div>
    </div>
  )
}
