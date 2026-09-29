import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { cardCoverUrl } from '../lib/cardCoverUrl'
import type { GalleryActions } from '../hooks/useGalleryActions'
import { bgSubtle, border, card, statusLive, textMuted, textPrimary, textSecondary } from '../styles'
import type { Gallery } from '../types'
import { GalleryCardActions } from './GalleryCardActions'

export function GalleryCard({ gallery: g, index: idx, fallbackCover, actions, onOpen, onOpenEmailShare }: {
  gallery: Gallery
  index: number
  fallbackCover: string | undefined
  actions: GalleryActions
  onOpen: (g: Gallery) => void
  onOpenEmailShare: (g: Gallery) => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const isLive = g.status === 'live'
  const explicitCover = ((g.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl as string | undefined) || null
  const cover = explicitCover || fallbackCover || null
  return (
    <div
      style={{
        background: card,
        borderRadius: 4,
        cursor: 'pointer',
        // Editorial reveal: 60ms cascade per tile with a gentle "settle" easing.
        animation: 'fadeInUp .55s cubic-bezier(.2,.7,.2,1) both',
        animationDelay: `${Math.min(idx, 12) * 0.06}s`,
        transition: 'transform .35s cubic-bezier(.2,.7,.2,1)',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
      onClick={() => onOpen(g)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{
        aspectRatio: '4 / 3', borderRadius: 2, overflow: 'hidden',
        background: cover ? bgSubtle : `linear-gradient(135deg, ${bgSubtle}, ${border})`,
        position: 'relative',
        boxShadow: isHovered
          ? '0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.08)'
          : '0 1px 2px rgba(0,0,0,.04), 0 6px 18px rgba(0,0,0,.04)',
        transition: 'box-shadow .25s ease',
      }}>
        {cover && (
          <img
            src={cardCoverUrl(cover)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              transform: isHovered ? 'scale(1.02)' : 'scale(1)',
              transition: 'transform .6s cubic-bezier(.2,.7,.2,1)',
            }}
          />
        )}
        {!cover && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: textMuted,
          }}>
            <Icon name="photo" size={36} strokeWidth={1.2} />
          </div>
        )}
        {isHovered && (
          <GalleryCardActions
            gallery={g}
            isLive={isLive}
            actions={actions}
            onOpenEmailShare={onOpenEmailShare}
          />
        )}
      </div>

      <div style={{ padding: '18px 2px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: textMuted, marginBottom: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isLive ? statusLive : border,
          }} />
          <span>{isLive ? 'Published' : 'Draft'}</span>
          {g.published_at && (
            <>
              <span style={{ color: border, marginInline: 2 }}>·</span>
              <span>{new Date(g.published_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </>
          )}
        </div>
        <h3 style={{
          fontSize: 19, fontWeight: 500, margin: '0 0 6px',
          letterSpacing: '-0.015em', lineHeight: 1.25, color: textPrimary,
        }}>
          {g.name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: textSecondary, lineHeight: 1.4 }}>
          <span>{(g.image_count ?? 0).toLocaleString('he-IL')} תמונות</span>
        </div>
        {isLive && ((g.download_count ?? 0) > 0 || (g.favorite_count ?? 0) > 0) && (
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: textMuted, marginTop: 8 }}>
            {(g.download_count ?? 0) > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="download" size={12} strokeWidth={1.85} />
                {(g.download_count ?? 0).toLocaleString('he-IL')}
              </span>
            )}
            {(g.favorite_count ?? 0) > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="heart" size={12} strokeWidth={1.85} />
                {(g.favorite_count ?? 0).toLocaleString('he-IL')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
