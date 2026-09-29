import { useState } from 'react'
import { storageUrl } from '@/shared/lib/supabase'
import { cn } from '@/shared/ui'
import type { Story } from '../../types'
import { useEditor } from '../EditorContext'
import { STORY_BUCKET } from './useStories'

const confirmButton = 'cursor-pointer rounded-hair px-3.5 py-1.5 text-[11px] font-medium tracking-[0.1em] text-white uppercase'

// 9:16 preview that plays on hover, with a "…" menu and an inline delete confirm.
export function StoryTile({ story: st }: { story: Story }) {
  const { stories } = useEditor()
  const { storyMenuOpenId, setStoryMenuOpenId, confirmDeleteStoryId, setConfirmDeleteStoryId, handleStoryDelete } = stories
  const [isHovered, setIsHovered] = useState(false)
  const isMenuOpen = storyMenuOpenId === st.id
  const isConfirming = confirmDeleteStoryId === st.id
  const url = storageUrl(STORY_BUCKET, st.storage_path)

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative aspect-[9/16] overflow-hidden rounded-[4px] border border-line bg-surface"
    >
      <video
        src={url}
        muted
        playsInline
        // preload="none": "metadata" fired a range request per tile on tab open.
        preload="none"
        onMouseEnter={(e) => { void (e.target as HTMLVideoElement).play().catch(() => { /* autoplay blocked */ }) }}
        onMouseLeave={(e) => {
          const v = e.target as HTMLVideoElement
          v.pause(); v.currentTime = 0
        }}
        className="block size-full object-cover"
      />

      {(isHovered || isMenuOpen || isConfirming) && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setStoryMenuOpenId(isMenuOpen ? null : st.id)
          }}
          aria-label="עוד"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          className="absolute end-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-white/92 p-0 text-ink shadow-[0_2px_8px_color-mix(in_srgb,var(--color-black)_18%,transparent)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      )}

      {isMenuOpen && !isConfirming && (
        <div className="absolute end-2 top-10 z-[5] min-w-[140px] rounded-[4px] border border-line bg-raised p-1 shadow-card">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setStoryMenuOpenId(null)
              setConfirmDeleteStoryId(st.id)
            }}
            className="w-full cursor-pointer rounded-hair bg-transparent px-2.5 py-2 text-right text-[12px] text-danger-strong"
          >
            מחיקה
          </button>
        </div>
      )}

      {/* Inline confirm replaces the menu so a delete can't happen by accident. */}
      {isConfirming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-ink/86 p-3 text-center text-white">
          <div className="text-[12px] font-medium">
            למחוק את הסטורי?
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                void handleStoryDelete(st.id)
              }}
              className={cn(confirmButton, 'bg-danger-strong')}
            >
              מחק
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDeleteStoryId(null)
              }}
              className={cn(confirmButton, 'border border-white/40 bg-transparent')}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between bg-linear-to-t/srgb from-black/60 to-transparent px-2.5 pt-5 pb-2 text-[10px] font-medium tracking-[0.14em] text-white uppercase">
        <span className="max-w-[70%] truncate">
          {st.style ?? 'manual'}
        </span>
        {st.duration ? <span>{st.duration}s</span> : null}
      </div>
    </div>
  )
}
