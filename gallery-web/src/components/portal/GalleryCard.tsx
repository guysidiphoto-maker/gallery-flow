// GalleryCard — one responsive gallery card for the client portal.
//
// Cover rule (CRITICAL): a broken <img> must NEVER render. When there is no
// cover URL we draw a designed CoverFallback (monogram + gradient). When a URL
// exists we render it, but still keep a fallback painted underneath so a failed
// load degrades to the designed cover instead of a broken-image glyph.

import { useState, type CSSProperties } from 'react'
import { Icon } from '../Icon'
import { CoverFallback } from './CoverFallback'
import { tokens, serifDisplay } from './tokens'

export interface GalleryCardData {
  id: string
  name: string
  coverUrl: string | null
  imageCount: number
  publishedIso: string | null
}

interface Props {
  data: GalleryCardData
  href: string
  statusLabel: string
  dateLabel: string
  countLabel: string
  openLabel: string
}

export function GalleryCard({ data, href, statusLabel, dateLabel, countLabel, openLabel }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const [hover, setHover] = useState(false)
  const showRealCover = !!data.coverUrl && !imgFailed

  const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    border: `1px solid ${hover ? tokens.textPrimary : tokens.border}`,
    borderRadius: 4,
    overflow: 'hidden',
    textDecoration: 'none',
    color: tokens.textPrimary,
    transition: 'border-color .15s, transform .15s, box-shadow .15s',
    transform: hover ? 'translateY(-2px)' : 'none',
    boxShadow: hover ? '0 10px 30px rgba(20,20,19,.08)' : 'none',
    height: '100%',
  }

  return (
    <a
      className="pf-focus pf-anim"
      href={href}
      aria-label={`${openLabel} — ${data.name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={cardStyle}
    >
      {/* Cover */}
      <div style={{ position: 'relative', containerType: 'size' } as CSSProperties}>
        {showRealCover ? (
          <div style={{ aspectRatio: '3 / 2', overflow: 'hidden', background: tokens.bgSubtle }}>
            <img
              src={data.coverUrl!}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ) : (
          <CoverFallback name={data.name} aspectRatio="3 / 2" />
        )}
        {/* Status chip */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            insetInlineStart: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'rgba(255,255,255,.92)',
            border: `1px solid ${tokens.border}`,
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: tokens.textSecondary,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: tokens.statusLive }} />
          {statusLabel}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <h3
          style={{
            ...serifDisplay,
            fontSize: 18,
            margin: 0,
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {data.name}
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: tokens.textMuted,
            flexWrap: 'wrap',
          }}
        >
          {dateLabel && <span>{dateLabel}</span>}
          {dateLabel && <span aria-hidden style={{ opacity: 0.5 }}>·</span>}
          <span>{countLabel}</span>
        </div>

        {/* Primary action */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: hover ? tokens.textPrimary : tokens.textSecondary,
          }}
        >
          {openLabel}
          <Icon name="arrow-out" size={13} strokeWidth={1.85} />
        </div>
      </div>
    </a>
  )
}
