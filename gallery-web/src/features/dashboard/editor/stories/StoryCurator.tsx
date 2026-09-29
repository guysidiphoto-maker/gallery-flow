import { useState } from 'react'
import { SignedImg } from '@/shared/ui/SignedImg'
import { bgSubtle, border, textMuted, textPrimary } from '../../styles'
import type { GalleryImage } from '../../types'
import { bySortOrder } from '../../lib/photoOrder'
import { useEditor } from '../EditorContext'
import { STORY_GENERATE_MAX_PHOTOS, STORY_GENERATE_MIN_PHOTOS } from './useStoryGeneration'

// Edit-before-generate shot list: drag to reorder, ✕ to remove, add from the rest.
export function StoryCurator() {
  const { session, storyGen } = useEditor()
  const { galleryImages } = session
  const { storyCandidateIds, storyShowAddPicker, setStoryShowAddPicker, removeCandidate, addCandidate, reorderCandidate } = storyGen
  const [storyDraggedId, setStoryDraggedId] = useState<string | null>(null)
  const [storyDragOverId, setStoryDragOverId] = useState<string | null>(null)

  const candidates = storyCandidateIds ?? []
  const candidateSet = new Set(candidates)
  const imgById = new Map(galleryImages.map(i => [i.id, i]))
  const ordered = candidates
    .map(id => imgById.get(id))
    .filter((i): i is GalleryImage => !!i)
  const additionalPool = galleryImages
    .filter(i => !candidateSet.has(i.id))
    .sort(bySortOrder)
  const tooFew = candidates.length < STORY_GENERATE_MIN_PHOTOS
  const tooMany = candidates.length > STORY_GENERATE_MAX_PHOTOS

  return (
    <div style={{
      margin: '0 0 18px',
      border: `1px solid ${tooFew || tooMany ? '#d97706' : border}`,
      background: bgSubtle,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', gap: 10,
        padding: '12px 14px 8px',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase',
        }}>תמונות בסטורי · {candidates.length} / {STORY_GENERATE_MAX_PHOTOS}</div>
        <button
          type="button"
          onClick={() => setStoryShowAddPicker(v => !v)}
          style={{
            background: 'transparent', border: 'none',
            color: textPrimary, cursor: 'pointer',
            fontSize: 11, fontWeight: 500,
            letterSpacing: '0.06em', fontFamily: 'inherit',
          }}
        >
          {storyShowAddPicker ? '✕ סגור' : '+ הוסף עוד תמונות'}
        </button>
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: '0 14px 12px', maxHeight: 168, overflowY: 'auto',
      }}>
        {ordered.map(img => {
          const isDragSrc = storyDraggedId === img.id
          const isDropTgt = storyDragOverId === img.id && storyDraggedId && storyDraggedId !== img.id
          return (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => {
                setStoryDraggedId(img.id)
                e.dataTransfer.effectAllowed = 'move'
                try { e.dataTransfer.setData('text/plain', img.id) } catch { /* ignore */ }
              }}
              onDragOver={(e) => {
                if (!storyDraggedId || storyDraggedId === img.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (storyDragOverId !== img.id) setStoryDragOverId(img.id)
              }}
              onDragLeave={() => { if (storyDragOverId === img.id) setStoryDragOverId(null) }}
              onDrop={(e) => {
                if (!storyDraggedId) return
                e.preventDefault()
                const src = storyDraggedId
                setStoryDraggedId(null); setStoryDragOverId(null)
                if (src && src !== img.id) reorderCandidate(src, img.id)
              }}
              onDragEnd={() => { setStoryDraggedId(null); setStoryDragOverId(null) }}
              style={{
                position: 'relative', width: 52, height: 52,
                cursor: 'grab',
                opacity: isDragSrc ? 0.4 : 1,
                outline: isDropTgt ? `2px solid ${textPrimary}` : 'none',
                outlineOffset: -2,
                transition: 'opacity .15s',
              }}
              title="גרור לסידור · לחץ ✕ להסרה"
            >
              <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                alt="" loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: border }} />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeCandidate(img.id) }}
                aria-label="הסר תמונה מהסטורי"
                style={{
                  position: 'absolute', top: -4, insetInlineEnd: -4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#fff', border: `1px solid ${border}`,
                  color: textPrimary, cursor: 'pointer', fontSize: 10, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                }}
              >✕</button>
            </div>
          )
        })}
        {ordered.length === 0 && (
          <div style={{ fontSize: 12, color: textMuted, padding: '8px 0' }}>
            אין תמונות שנבחרו. לחץ "הוסף עוד תמונות" כדי לבחור.
          </div>
        )}
      </div>

      {storyShowAddPicker && (
        <div style={{
          borderTop: `1px solid ${border}`, padding: '10px 14px 14px',
          maxHeight: 280, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 11, color: textMuted, marginBottom: 8, lineHeight: 1.5 }}>
            לחץ על תמונה כדי להוסיף אותה לסוף הסטורי. תמונות שכבר נכללות מודגשות.
          </div>
          {additionalPool.length === 0 ? (
            <div style={{ fontSize: 12, color: textMuted }}>אין תמונות נוספות בגלריה.</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
              gap: 4,
            }}>
              {additionalPool.map(img => {
                const reachedMax = candidates.length >= STORY_GENERATE_MAX_PHOTOS
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => addCandidate(img.id)}
                    disabled={reachedMax}
                    title={reachedMax ? `מקסימום ${STORY_GENERATE_MAX_PHOTOS} תמונות` : 'הוסף לסטורי'}
                    style={{
                      padding: 0, border: 'none', background: 'transparent',
                      aspectRatio: '1', cursor: reachedMax ? 'not-allowed' : 'pointer',
                      opacity: reachedMax ? 0.4 : 1,
                      position: 'relative',
                    }}
                  >
                    <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                      alt="" loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: border }} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(tooFew || tooMany) && (
        <div style={{
          fontSize: 11, color: '#b45309', padding: '0 14px 12px', lineHeight: 1.5,
        }}>
          {tooFew && <>צריך לפחות <strong>{STORY_GENERATE_MIN_PHOTOS}</strong> תמונות כדי לייצר סטורי קולח.</>}
          {tooMany && <>מקסימום <strong>{STORY_GENERATE_MAX_PHOTOS}</strong> תמונות לסטורי אחד.</>}
        </div>
      )}
    </div>
  )
}
