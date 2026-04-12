import React, { useEffect, useState } from 'react'
import { usePublish } from '../store/publish'
import type { PublishStatus } from '../lib/uploadTypes'
import { computeByteProgress, computeEtaSeconds, formatEta } from '../lib/eta'

export function UploadFloater({ onExpand }: { onExpand: () => void }) {
  const { publishStatus, progress, queueItems, startedAt } = usePublish()
  // Tick once a second so the ETA label refreshes between queue-item events
  const [, setTick] = useState(0)

  const isActive = (['preparing_assets', 'uploading_previews', 'uploading_originals'] as PublishStatus[]).includes(publishStatus)

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [isActive])

  // Only show when publishing is in progress and panel is hidden
  if (publishStatus === 'draft') return null

  const isDone = publishStatus === 'fully_live' || publishStatus === 'preview_live'
  const isFailed = publishStatus === 'failed' || publishStatus === 'partially_failed'

  const { done, total } = computeByteProgress(queueItems)
  const etaSec = isActive ? computeEtaSeconds(startedAt, done, total) : null
  const etaLabel = etaSec != null ? `~${formatEta(etaSec)} left` : null

  const label = publishStatus === 'preparing_assets' ? 'Preparing...'
    : publishStatus === 'uploading_previews' ? `Uploading ${progress.percent}%`
    : publishStatus === 'uploading_originals' ? `Originals ${progress.originalsUploaded}/${progress.totalImages}`
    : publishStatus === 'preview_live' ? 'Published'
    : publishStatus === 'fully_live' ? 'Published'
    : publishStatus === 'partially_failed' ? 'Needs attention'
    : publishStatus === 'failed' ? 'Failed'
    : ''

  const color = isDone ? '#10b981' : isFailed ? '#ef4444' : '#6366f1'

  return (
    <button
      className="upload-floater"
      onClick={onExpand}
      style={{
        position: 'fixed',
        top: 46,
        left: 12,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px 6px 10px',
        background: 'rgba(30,30,40,.92)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${isDone ? 'rgba(16,185,129,.3)' : isFailed ? 'rgba(239,68,68,.3)' : 'rgba(99,102,241,.3)'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all .15s',
        fontFamily: 'inherit',
        fontSize: 11,
        color: 'rgba(255,255,255,.8)',
        boxShadow: '0 2px 12px rgba(0,0,0,.3)',
      }}
    >
      {/* Icon */}
      {isActive ? (
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          border: `2px solid ${color}`, borderTopColor: 'transparent',
          animation: 'cgSpin .8s linear infinite',
        }} />
      ) : isDone ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      )}

      {/* Label */}
      <span>{label}</span>

      {/* Mini progress bar for active uploads */}
      {isActive && (
        <div style={{
          width: 40, height: 3, borderRadius: 2,
          background: 'rgba(255,255,255,.1)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress.percent}%`, height: '100%',
            background: color, borderRadius: 2,
            transition: 'width .3s',
          }} />
        </div>
      )}

      {/* ETA */}
      {etaLabel && (
        <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 10 }}>
          {etaLabel}
        </span>
      )}
    </button>
  )
}
