import { useState } from 'react'
import { storageUrl } from '@/shared/lib/supabase'
import { bgSubtle, border, cardSolid, textPrimary } from '../../styles'
import type { Story } from '../../types'
import { useEditor } from '../EditorContext'
import { STORY_BUCKET } from './useStories'

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
      style={{
        position: 'relative', aspectRatio: '9 / 16',
        background: bgSubtle, overflow: 'hidden',
        border: `1px solid ${border}`,
        borderRadius: 4,
      }}
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
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover', display: 'block',
        }}
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
          style={{
            position: 'absolute', top: 8, insetInlineEnd: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.92)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: textPrimary, padding: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      )}

      {isMenuOpen && !isConfirming && (
        <div style={{
          position: 'absolute', top: 40, insetInlineEnd: 8,
          background: cardSolid, border: `1px solid ${border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 5,
          minWidth: 140, padding: 4, borderRadius: 4,
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setStoryMenuOpenId(null)
              setConfirmDeleteStoryId(st.id)
            }}
            style={{
              width: '100%', textAlign: 'right' as const,
              padding: '8px 10px', borderRadius: 2,
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, color: '#dc2626',
            }}
          >
            מחיקה
          </button>
        </div>
      )}

      {/* Inline confirm replaces the menu so a delete can't happen by accident. */}
      {isConfirming && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(20,20,19,0.86)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: 12,
          textAlign: 'center', color: '#fff',
        }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            למחוק את הסטורי?
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void handleStoryDelete(st.id)
              }}
              style={{
                padding: '6px 14px', borderRadius: 2,
                background: '#dc2626', border: 'none',
                color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11,
                fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              מחק
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDeleteStoryId(null)
              }}
              style={{
                padding: '6px 14px', borderRadius: 2,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.4)',
                color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11,
                fontWeight: 500, letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 0, insetInline: 0,
        padding: '20px 10px 8px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
        color: '#fff', fontSize: 10,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        fontWeight: 500,
        display: 'flex', justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: '70%',
        }}>
          {st.style ?? 'manual'}
        </span>
        {st.duration ? <span>{st.duration}s</span> : null}
      </div>
    </div>
  )
}
