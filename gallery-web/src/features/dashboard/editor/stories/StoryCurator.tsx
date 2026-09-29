import { useState } from 'react'
import { cn } from '@/shared/ui'
import { SignedImg } from '@/shared/ui/SignedImg'
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
    <div className={cn('mt-0 mb-[18px] border bg-surface', tooFew || tooMany ? 'border-pending' : 'border-line')}>
      <div className="flex items-baseline justify-between gap-2.5 px-3.5 pt-3 pb-2">
        <div className="text-[9px] font-medium tracking-wide-label text-muted uppercase">תמונות בסטורי · {candidates.length} / {STORY_GENERATE_MAX_PHOTOS}</div>
        <button
          type="button"
          onClick={() => setStoryShowAddPicker(v => !v)}
          className="cursor-pointer bg-transparent text-[11px] font-medium tracking-[0.06em] text-ink"
        >
          {storyShowAddPicker ? '✕ סגור' : '+ הוסף עוד תמונות'}
        </button>
      </div>
      <div className="flex max-h-[168px] flex-wrap gap-1.5 overflow-y-auto px-3.5 pb-3">
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
              className={cn(
                'relative size-[52px] cursor-grab -outline-offset-2 transition-opacity duration-150',
                isDragSrc ? 'opacity-40' : 'opacity-100',
                isDropTgt ? 'outline-2 outline-ink' : 'outline-none',
              )}
              title="גרור לסידור · לחץ ✕ להסרה"
            >
              <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                alt="" loading="lazy"
                className="block size-full bg-line object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeCandidate(img.id) }}
                aria-label="הסר תמונה מהסטורי"
                className="absolute -end-1 -top-1 flex size-4 cursor-pointer items-center justify-center rounded-full border border-line bg-raised p-0 text-[10px] leading-none text-ink"
              >✕</button>
            </div>
          )
        })}
        {ordered.length === 0 && (
          <div className="py-2 text-[12px] text-muted">
            אין תמונות שנבחרו. לחץ "הוסף עוד תמונות" כדי לבחור.
          </div>
        )}
      </div>

      {storyShowAddPicker && (
        <div className="max-h-[280px] overflow-y-auto border-t border-line px-3.5 pt-2.5 pb-3.5">
          <div className="mb-2 text-[11px] leading-normal text-muted">
            לחץ על תמונה כדי להוסיף אותה לסוף הסטורי. תמונות שכבר נכללות מודגשות.
          </div>
          {additionalPool.length === 0 ? (
            <div className="text-[12px] text-muted">אין תמונות נוספות בגלריה.</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1">
              {additionalPool.map(img => {
                const reachedMax = candidates.length >= STORY_GENERATE_MAX_PHOTOS
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => addCandidate(img.id)}
                    disabled={reachedMax}
                    title={reachedMax ? `מקסימום ${STORY_GENERATE_MAX_PHOTOS} תמונות` : 'הוסף לסטורי'}
                    className={cn(
                      'relative aspect-square bg-transparent p-0',
                      reachedMax ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                    )}
                  >
                    <SignedImg bucket="gallery-images" path={img.thumbnail_path || img.storage_path}
                      alt="" loading="lazy"
                      className="block size-full bg-line object-cover" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(tooFew || tooMany) && (
        <div className="px-3.5 pb-3 text-[11px] leading-normal text-pending-ink">
          {tooFew && <>צריך לפחות <strong>{STORY_GENERATE_MIN_PHOTOS}</strong> תמונות כדי לייצר סטורי קולח.</>}
          {tooMany && <>מקסימום <strong>{STORY_GENERATE_MAX_PHOTOS}</strong> תמונות לסטורי אחד.</>}
        </div>
      )}
    </div>
  )
}
