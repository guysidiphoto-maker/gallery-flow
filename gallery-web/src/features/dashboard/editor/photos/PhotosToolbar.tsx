import { Icon } from '@/shared/ui/Icon'
import { border, textPrimary } from '../../styles'
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
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24, gap: 16,
    }}>
      <SectionHeading />
      <input ref={fileInputRef} type="file" multiple accept="image/*"
        style={{ display: 'none' }}
        onChange={e => handleFileUpload(e.target.files)} />
      {/* Drives "Replace photo"; reset so re-picking the same file fires again. */}
      <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void handleReplaceFile(f)
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          value={photoSort}
          onChange={(e) => setPhotoSort(e.target.value as PhotoSort)}
          aria-label="מיון תמונות"
          style={{
            padding: '8px 12px', borderRadius: 2,
            border: `1px solid ${border}`,
            background: '#fff', color: textPrimary,
            fontSize: 11, fontFamily: 'inherit',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="order">סדר ידני</option>
          <option value="name">שם</option>
          <option value="newest">חדש קודם</option>
        </select>
        <div style={{
          display: 'flex', border: `1px solid ${border}`, borderRadius: 2,
        }}>
          {([
            { id: 'regular' as const, label: 'Regular' },
            { id: 'large'   as const, label: 'Large' },
          ]).map(s => (
            <button
              key={s.id}
              onClick={() => setGridSize(s.id)}
              aria-label={`Grid ${s.label}`}
              title={s.label}
              style={{
                padding: '8px 10px', cursor: 'pointer',
                background: gridSize === s.id ? textPrimary : '#fff',
                color: gridSize === s.id ? '#fff' : textPrimary,
                border: 'none', borderInlineStart: s.id === 'large' ? `1px solid ${border}` : 'none',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              }}
            >
              <Icon name={s.id === 'regular' ? 'sections' : 'gallery'} size={13} strokeWidth={1.85} />
            </button>
          ))}
        </div>
        {galleryImages.length > 0 && !selectMode && (
          <button
            onClick={() => setSelectMode(true)}
            aria-label="בחירת תמונות"
            style={{
              padding: '10px 16px', borderRadius: 2, fontSize: 11, fontWeight: 500,
              background: 'transparent', border: `1px solid ${border}`,
              color: textPrimary, cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Icon name="check" size={13} strokeWidth={1.85} />
            בחר
          </button>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
            background: textPrimary, border: `1px solid ${textPrimary}`,
            color: '#fff', cursor: uploading ? 'wait' : 'pointer',
            fontFamily: 'inherit', opacity: uploading ? 0.6 : 1,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="plus" size={13} strokeWidth={2} />
          Add Media
        </button>
      </div>
    </div>
  )
}
