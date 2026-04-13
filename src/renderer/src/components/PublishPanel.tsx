import React, { useState, useEffect, useRef } from 'react'
import type { DeliverySettings } from '../App'
import { usePublish } from '../store/publish'
import type { PublishStatus } from '../lib/uploadTypes'
import { pauseOriginals, resumeOriginals, retryFailedOriginals } from '../lib/cloudUpload'
import { computeByteProgress, computeEtaSeconds, formatEta, formatBytes } from '../lib/eta'
import { fetchPlanLimits, type PlanLimits } from '../lib/planGuard'
import { toLocalURL } from '../utils/imageUtils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PublishPanelProps {
  projectName: string
  clientName: string | null
  imageCount: number
  topPickCount: number
  settings: DeliverySettings
  onSettingsChange: (settings: DeliverySettings) => void
  onPublish: () => void
  onClose: () => void
  phase: 'settings' | 'publishing' | 'done' | 'error' | 'editing'
  error?: string
  publicUrl?: string
  onRetry?: () => void
  onHide?: () => void
  onCancel?: () => void
  projectImages?: Array<{ id: string; path: string }>
  /** True when the gallery is already live in the cloud — the primary CTA
   *  becomes "Update Changes" instead of "Publish Gallery". */
  isAlreadyLive?: boolean
}

// ─── Done Screen (celebration + actions) ────────────────────────────────────

function DoneScreen({ projectName, publicUrl, error, onClose }: {
  projectName: string; publicUrl?: string; error?: string; onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [showConfetti, setShowConfetti] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(false), 3000)
    return () => clearTimeout(t)
  }, [])

  const handleCopy = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }).catch(() => {})
  }

  const handleEmail = () => {
    if (!publicUrl) return
    const subject = encodeURIComponent(`Your gallery: ${projectName}`)
    const body = encodeURIComponent(`Hi,\n\nYour gallery "${projectName}" is ready!\n\n${publicUrl}\n\nEnjoy!`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  return (
    <div className="pub__done" style={{ textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      {/* Confetti */}
      {showConfetti && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, pointerEvents: 'none', overflow: 'hidden' }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: -10,
              width: Math.random() * 6 + 4,
              height: Math.random() * 6 + 4,
              borderRadius: Math.random() > 0.5 ? '50%' : 1,
              background: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'][Math.floor(Math.random() * 6)],
              opacity: 0.9,
              animation: `confettiFall ${1.5 + Math.random() * 2}s ease-out ${Math.random() * 0.5}s forwards`,
            }} />
          ))}
        </div>
      )}

      {/* Success icon */}
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Gallery Published!</h3>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', margin: '0 0 20px' }}>{projectName} is live and ready for your client</p>

      {/* URL display */}
      {publicUrl && (
        <div style={{
          background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: '10px 14px', margin: '0 0 20px',
          fontSize: 11, color: 'rgba(255,255,255,.5)', wordBreak: 'break-all', fontFamily: 'monospace', textAlign: 'left',
        }}>
          {publicUrl}
        </div>
      )}

      {error && <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 12px' }}>{error}</p>}

      {/* Primary actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {publicUrl && (
          <button
            onClick={handleCopy}
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              background: copied ? '#10b981' : '#6366f1', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background .2s',
            }}
          >
            {copied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                Link Copied!
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Gallery Link
              </>
            )}
          </button>
        )}

        {publicUrl && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleEmail}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)',
                background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Send via Email
            </button>
            <button
              onClick={() => window.open(publicUrl, '_blank')}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)',
                background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open in Browser
            </button>
          </div>
        )}

        <button onClick={onClose} style={{
          width: '100%', padding: '8px 12px', borderRadius: 10, border: 'none',
          background: 'transparent', color: 'rgba(255,255,255,.3)', cursor: 'pointer',
          fontSize: 12, fontFamily: 'inherit', marginTop: 4,
        }}>
          Close
        </button>
      </div>
    </div>
  )
}

// ─── Status Labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: 'Draft',
  preparing_assets: 'Preparing gallery assets',
  uploading_previews: 'Uploading client-ready previews',
  preview_live: 'Gallery is now live',
  uploading_originals: 'Uploading full-quality originals',
  fully_live: 'All assets uploaded',
  partially_failed: 'Some originals need attention',
  failed: 'Publishing failed',
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'rgba(255,255,255,.3)',
    margin: '0 0 12px',
    padding: '0 2px',
  },
  section: {
    background: 'rgba(255,255,255,.025)',
    border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 12,
    padding: '16px',
    marginBottom: 12,
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: 'rgba(255,255,255,.9)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    transition: 'border-color .2s, background .2s',
  },
  inputFocusColor: 'rgba(99,102,241,.5)',
  row: {
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
    gap: 12,
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,.75)',
    fontWeight: 500 as const,
  },
  sublabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,.25)',
    marginTop: 2,
    lineHeight: 1.4,
  },
  accent: '#6366f1',
}

// ─── Cover Image Picker with Preview ───────────────────────────────────────

function CoverImagePicker({ settings, projectImages, onUpdate }: {
  settings: DeliverySettings
  projectImages?: Array<{ id: string; path: string }>
  onUpdate: (partial: Partial<DeliverySettings>) => void
}) {
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  const hasCover = !!(settings.coverImageId || settings.coverImageUrl)
  const crop = settings.coverCrop || { zoom: 1, x: 50, y: 50 }

  const coverSrc = settings.coverImageUrl
    ? (settings.coverImageUrl.startsWith('http') ? settings.coverImageUrl : toLocalURL(settings.coverImageUrl))
    : projectImages?.find(i => i.id === settings.coverImageId)?.path || ''

  const setCrop = (partial: Partial<typeof crop>) => {
    const next = { ...crop, ...partial }
    next.x = Math.max(0, Math.min(100, next.x))
    next.y = Math.max(0, Math.min(100, next.y))
    next.zoom = Math.max(1, Math.min(3, next.zoom))
    onUpdate({ coverCrop: next })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!hasCover) return
    e.preventDefault()
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, startX: crop.x, startY: crop.y }
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      if (!dragStart.current) return
      const dx = (e.clientX - dragStart.current.x) * 0.15
      const dy = (e.clientY - dragStart.current.y) * 0.15
      setCrop({
        x: dragStart.current.startX - dx,
        y: dragStart.current.startY - dy,
      })
    }
    const handleUp = () => {
      setDragging(false)
      dragStart.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  const previewAspect = previewMode === 'desktop' ? '16 / 9' : '9 / 16'
  const previewHeight = previewMode === 'desktop' ? 160 : 280

  return (
    <div style={S.section}>
      <p style={S.sectionTitle}>Welcome Screen</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', margin: '0 0 10px' }}>
        Choose a cover image for the gallery welcome screen
      </p>

      {/* Preview with device toggle */}
      {hasCover && (
        <div style={{ marginBottom: 10 }}>
          {/* Device toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['desktop', 'mobile'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setPreviewMode(mode)}
                style={{
                  flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600,
                  fontFamily: 'inherit', border: 'none', borderRadius: 5, cursor: 'pointer',
                  background: previewMode === mode ? 'rgba(99,102,241,.8)' : 'rgba(255,255,255,.06)',
                  color: previewMode === mode ? '#fff' : 'rgba(255,255,255,.5)',
                  transition: 'all .15s',
                }}
              >
                {mode === 'desktop' ? 'Desktop' : 'Mobile'}
              </button>
            ))}
          </div>

          {/* Preview frame */}
          <div
            onMouseDown={handleMouseDown}
            style={{
              position: 'relative', borderRadius: 8, overflow: 'hidden',
              aspectRatio: previewAspect, maxHeight: previewHeight,
              cursor: dragging ? 'grabbing' : 'grab',
              border: '1px solid rgba(255,255,255,.1)',
              background: '#0a0a0c',
            }}
          >
            <img
              src={coverSrc}
              alt="Cover preview"
              draggable={false}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%', objectFit: 'cover',
                objectPosition: `${crop.x}% ${crop.y}%`,
                transform: `scale(${crop.zoom})`,
                transition: dragging ? 'none' : 'transform .2s',
                opacity: 0.35,
              }}
            />
            {/* Simulated overlay text */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at center, rgba(10,10,12,.3) 0%, rgba(10,10,12,.8) 100%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
                {settings.studioName || 'Studio Name'}
              </span>
              <span style={{ fontSize: previewMode === 'desktop' ? 18 : 14, fontWeight: 700, color: '#fff' }}>
                {settings.galleryTitle || 'Gallery Title'}
              </span>
            </div>
            {/* Drag hint */}
            <div style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              fontSize: 9, color: 'rgba(255,255,255,.3)', pointerEvents: 'none',
            }}>
              Drag to reposition
            </div>
            {/* Clear button */}
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ coverImageId: null, coverImageUrl: null, coverCrop: null }) }}
              style={{
                position: 'absolute', top: 6, right: 6,
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(0,0,0,.6)', border: 'none',
                color: '#fff', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>

          {/* Zoom slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>Zoom</span>
            <input
              type="range" min="100" max="300" value={Math.round(crop.zoom * 100)}
              onChange={e => setCrop({ zoom: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: '#6366f1', height: 3 }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', minWidth: 28, textAlign: 'right' }}>
              {Math.round(crop.zoom * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Pick from gallery */}
      {projectImages && projectImages.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ ...S.label, marginBottom: 6, fontSize: 11 }}>From gallery</div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
            maxHeight: 160, overflowY: 'auto', borderRadius: 6,
          }}>
            {projectImages.map(img => (
              <div
                key={img.id}
                onClick={() => onUpdate({ coverImageId: img.id, coverImageUrl: null, coverCrop: { zoom: 1, x: 50, y: 50 } })}
                style={{
                  aspectRatio: '1', borderRadius: 4, overflow: 'hidden', cursor: 'pointer',
                  border: settings.coverImageId === img.id ? '2px solid #6366f1' : '2px solid transparent',
                  opacity: settings.coverImageId === img.id ? 1 : 0.7,
                  transition: 'opacity .15s, border-color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { if (settings.coverImageId !== img.id) e.currentTarget.style.opacity = '0.7' }}
              >
                <img src={img.path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload custom image */}
      <button
        onClick={async () => {
          const result = await window.api?.selectFile?.({ filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
          if (result) onUpdate({ coverImageId: null, coverImageUrl: result, coverCrop: { zoom: 1, x: 50, y: 50 } })
        }}
        style={{
          width: '100%', padding: '8px 12px',
          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 6, color: 'rgba(255,255,255,.6)', fontSize: 11,
          fontFamily: 'inherit', cursor: 'pointer', transition: 'background .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
      >
        Upload custom image…
      </button>
    </div>
  )
}

// ─── Reusable Components ────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none',
        background: value
          ? 'linear-gradient(135deg, #6366f1, #818cf8)'
          : 'rgba(255,255,255,.08)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .2s, box-shadow .2s',
        flexShrink: 0, opacity: disabled ? 0.35 : 1, padding: 0,
        boxShadow: value ? '0 2px 8px rgba(99,102,241,.3)' : 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 20 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        transition: 'left .2s cubic-bezier(.4,0,.2,1)',
      }} />
    </button>
  )
}

function SegmentedControl<T extends string>({
  options, value, onChange, disabled,
}: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(255,255,255,.06)',
      borderRadius: 10, padding: 3, gap: 2, opacity: disabled ? 0.35 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: active ? 600 : 400,
            color: active ? '#fff' : 'rgba(255,255,255,.4)',
            background: active ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'transparent',
            border: 'none', borderRadius: 7, cursor: 'pointer',
            transition: 'all .2s', fontFamily: 'inherit', whiteSpace: 'nowrap',
            boxShadow: active ? '0 2px 8px rgba(99,102,241,.25)' : 'none',
            letterSpacing: active ? '0.01em' : '0',
          }}>{opt.label}</button>
        )
      })}
    </div>
  )
}

function InputField({ value, onChange, placeholder, type = 'text', style: extraStyle }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties
}) {
  const [focused, setFocused] = React.useState(false)
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ ...S.input, borderColor: focused ? S.inputFocusColor : 'rgba(255,255,255,.08)', ...extraStyle }}
    />
  )
}

// ─── Progress Step ──────────────────────────────────────────────────────────

function PublishStep({ title, detail, state, percent }: {
  title: string; detail: string; state: 'waiting' | 'active' | 'done'; percent?: number
}) {
  return (
    <div className="pub__step">
      <div className={`pub__step-icon ${state === 'done' ? 'pub__step-icon--done' : state === 'active' ? 'pub__step-icon--active' : 'pub__step-icon--waiting'}`}>
        {state === 'done' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        ) : state === 'active' ? (
          <div className="pub__spinner" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
        )}
      </div>
      <div className="pub__step-info">
        <p className="pub__step-title">{title}</p>
        <p className="pub__step-detail">{detail}</p>
        {state === 'active' && percent != null && (
          <div className="pub__step-bar">
            <div className="pub__step-bar-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PublishPanel({
  projectName, clientName, imageCount, topPickCount,
  settings, onSettingsChange, onPublish, onClose, phase,
  error, publicUrl, onRetry, onHide, onCancel, projectImages, isAlreadyLive,
}: PublishPanelProps) {
  const pub = usePublish()
  const { progress, publishStatus, isPaused, queueItems, startedAt } = pub

  // Plan usage (fetched once when settings phase opens)
  const [planLimits, setPlanLimits] = useState<PlanLimits | null>(null)
  useEffect(() => {
    if (phase === 'settings') {
      fetchPlanLimits().then(l => setPlanLimits(l))
    }
  }, [phase])

  // Live ticker so the ETA label updates every second during active uploads
  const [, setTick] = useState(0)
  const isActivePublishPhase = (['preparing_assets', 'uploading_previews', 'uploading_originals'] as PublishStatus[]).includes(publishStatus)
  useEffect(() => {
    if (!isActivePublishPhase) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [isActivePublishPhase])

  const byteStats = computeByteProgress(queueItems)
  const etaSec = isActivePublishPhase ? computeEtaSeconds(startedAt, byteStats.done, byteStats.total) : null
  const etaLabel = etaSec != null ? formatEta(etaSec) : null
  const bytesLabel = byteStats.total > 0 && isActivePublishPhase
    ? `${formatBytes(byteStats.done)} of ${formatBytes(byteStats.total)}`
    : null

  const update = (partial: Partial<DeliverySettings>) => {
    onSettingsChange({ ...settings, ...partial })
  }

  // Build summary lines for settings phase
  const summaryLines: string[] = []
  if (settings.accessType === 'public') summaryLines.push('Public gallery')
  else summaryLines.push('Password-protected gallery')
  if (settings.downloadsEnabled) {
    summaryLines.push(`Downloads in ${settings.downloadQuality} quality`)
  } else {
    summaryLines.push('Downloads disabled')
  }
  const layoutLabel = { '1-col': '1-column', '2-col': '2-column', '3-col': '3-column' }[settings.layoutMode]
  summaryLines.push(`${layoutLabel} layout`)
  if (settings.generateStories && topPickCount >= 2) summaryLines.push('Stories included')

  // Compute step states for publishing phase
  const isPublishing = phase === 'publishing'
  const assetState: 'waiting' | 'active' | 'done' =
    publishStatus === 'preparing_assets' ? 'active' :
    publishStatus === 'draft' ? 'waiting' : 'done'

  const previewState: 'waiting' | 'active' | 'done' =
    publishStatus === 'uploading_previews' ? 'active' :
    (['preview_live', 'uploading_originals', 'fully_live', 'partially_failed'] as PublishStatus[]).includes(publishStatus) ? 'done' : 'waiting'

  const liveState: 'waiting' | 'active' | 'done' =
    (['preview_live', 'uploading_originals', 'fully_live', 'partially_failed'] as PublishStatus[]).includes(publishStatus) ? 'done' : 'waiting'

  const originalsState: 'waiting' | 'active' | 'done' =
    publishStatus === 'uploading_originals' ? 'active' :
    publishStatus === 'fully_live' ? 'done' :
    publishStatus === 'partially_failed' ? 'done' : 'waiting'

  const previewPercent = progress.totalImages > 0
    ? Math.round(((progress.thumbsUploaded + progress.previewsUploaded) / (progress.totalImages * 2)) * 100)
    : 0

  const originalsPercent = progress.totalImages > 0
    ? Math.round((progress.originalsUploaded / progress.totalImages) * 100)
    : 0

  return (
    <div className="pub-overlay" onClick={phase === 'settings' || phase === 'editing' || phase === 'done' || phase === 'error' ? onClose : undefined}>
      <div className="pub" onClick={e => e.stopPropagation()} style={phase === 'settings' || phase === 'editing' ? { maxHeight: '90vh', display: 'flex', flexDirection: 'column' } : undefined}>
        {/* Header */}
        <div className="pub__header">
          <h2 className="pub__title">
            {phase === 'settings' && 'Delivery Settings'}
            {phase === 'editing' && 'Gallery Settings'}
            {phase === 'publishing' && (STATUS_LABELS[publishStatus] || 'Publishing...')}
            {phase === 'done' && 'Published!'}
            {phase === 'error' && 'Error'}
          </h2>
          {(phase === 'settings' || phase === 'editing' || phase === 'done' || phase === 'error') && (
            <button className="pub__close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="pub__body" style={phase === 'settings' || phase === 'editing' ? { overflowY: 'auto', flex: 1, minHeight: 0 } : undefined}>

          {/* ═══ Settings phase ═══ */}
          {(phase === 'settings' || phase === 'editing') && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', marginBottom: 16,
                background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)',
                borderRadius: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(99,102,241,.2), rgba(139,92,246,.2))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.85)' }}>
                    {projectName}{clientName ? ` \u00B7 ${clientName}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>
                    {imageCount} images{topPickCount > 0 ? ` \u00B7 ${topPickCount} top picks` : ''}
                  </div>
                </div>
              </div>

              {/* Gallery Info */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Gallery Info</p>
                <InputField value={settings.galleryTitle} onChange={v => update({ galleryTitle: v })} placeholder={projectName || 'Gallery title'} style={{ marginBottom: 8 }} />
                <InputField value={settings.clientName} onChange={v => update({ clientName: v })} placeholder={clientName || 'Client name'} style={{ marginBottom: 8 }} />

                {/* Event date + location row */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2"
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <input
                      type="text"
                      value={settings.eventDate}
                      onChange={e => update({ eventDate: e.target.value })}
                      placeholder="Event date"
                      style={{ ...S.input, paddingLeft: 30, fontSize: 12 }}
                      onFocus={e => { e.currentTarget.style.borderColor = S.inputFocusColor }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
                    />
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2"
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    <input
                      type="text"
                      value={settings.eventLocation}
                      onChange={e => update({ eventLocation: e.target.value })}
                      placeholder="Location"
                      style={{ ...S.input, paddingLeft: 30, fontSize: 12 }}
                      onFocus={e => { e.currentTarget.style.borderColor = S.inputFocusColor }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
                    />
                  </div>
                </div>

                {/* Auto-fill from EXIF */}
                <button
                  onClick={async () => {
                    if (!projectImages || projectImages.length === 0) return
                    try {
                      const exifr = await import('exifr')
                      const firstPath = projectImages[0].id
                      const exif = await exifr.parse(firstPath, { tiff: true, exif: true, gps: true })
                      const updates: Partial<DeliverySettings> = {}
                      const dt = exif?.DateTimeOriginal ?? exif?.DateTime ?? exif?.CreateDate
                      if (dt instanceof Date && !settings.eventDate) {
                        updates.eventDate = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      }
                      if (exif?.latitude && exif?.longitude && !settings.eventLocation) {
                        try {
                          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${exif.latitude}&lon=${exif.longitude}&format=json&zoom=10`)
                          const geo = await res.json()
                          const city = geo?.address?.city || geo?.address?.town || geo?.address?.village || ''
                          const country = geo?.address?.country || ''
                          if (city) updates.eventLocation = city + (country ? `, ${country}` : '')
                          else if (country) updates.eventLocation = country
                        } catch { /* skip geocoding */ }
                      }
                      // Build description from parts
                      const descParts = [updates.eventDate || settings.eventDate, updates.eventLocation || settings.eventLocation].filter(Boolean)
                      if (descParts.length > 0) updates.galleryDescription = descParts.join(' · ')
                      if (Object.keys(updates).length > 0) update(updates)
                    } catch { /* exif read failed */ }
                  }}
                  style={{
                    width: '100%', padding: '7px 12px',
                    background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.15)',
                    borderRadius: 8, color: '#818cf8', fontSize: 11, fontWeight: 500,
                    fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,.08)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  Auto-fill from photos
                </button>
              </div>

              {/* Event Type */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Event Type</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { value: 'conference', label: 'Conference' },
                    { value: 'corporate-event', label: 'Corporate Event' },
                    { value: 'government', label: 'Government' },
                    { value: 'retreat-abroad', label: 'Retreat Abroad' },
                    { value: 'retreat-local', label: 'Local Retreat' },
                    { value: 'pre-event', label: 'Pre-Event' },
                    { value: 'other', label: 'Other' },
                  ].map(opt => {
                    const active = settings.eventType === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => update({ eventType: active ? '' : opt.value })}
                        style={{
                          padding: '7px 14px', borderRadius: 50,
                          background: active ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.03)',
                          border: active ? '1px solid rgba(99,102,241,.3)' : '1px solid rgba(255,255,255,.06)',
                          color: active ? '#818cf8' : 'rgba(255,255,255,.45)',
                          fontSize: 12, fontWeight: active ? 600 : 400,
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all .15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Access */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Access</p>
                <div style={{ marginBottom: settings.accessType === 'password' ? 10 : 0 }}>
                  <SegmentedControl options={[{ label: 'Public', value: 'public' as const }, { label: 'Password', value: 'password' as const }]}
                    value={settings.accessType} onChange={v => update({ accessType: v, password: v === 'public' ? null : settings.password || '' })} />
                </div>
                {settings.accessType === 'password' && (
                  <InputField value={settings.password || ''} onChange={v => update({ password: v })} placeholder="Enter gallery password" style={{ marginTop: 2 }} />
                )}
              </div>

              {/* Downloads */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Downloads</p>
                <div style={S.row}>
                  <div><div style={S.label}>Allow downloads</div><div style={S.sublabel}>Clients can download images</div></div>
                  <Toggle value={settings.downloadsEnabled} onChange={v => update({ downloadsEnabled: v })} />
                </div>
                {settings.downloadsEnabled && (
                  <div style={S.row}>
                    <div><div style={S.label}>Download quality</div></div>
                    <SegmentedControl options={[
                      { label: 'Web', value: 'web' as const }, { label: 'High', value: 'high' as const }, { label: 'Original', value: 'original' as const },
                    ]} value={settings.downloadQuality} onChange={v => update({ downloadQuality: v })} />
                  </div>
                )}
                {settings.downloadsEnabled && (
                  <div style={{ ...S.row, marginBottom: 0 }}>
                    <div><div style={S.label}>Bulk download</div><div style={S.sublabel}>Allow downloading all images at once</div></div>
                    <Toggle value={settings.bulkDownloadEnabled} onChange={v => update({ bulkDownloadEnabled: v })} />
                  </div>
                )}
              </div>

              {/* Branding */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Branding</p>
                <InputField value={settings.studioName} onChange={v => update({ studioName: v })} placeholder="Studio / business name" style={{ marginBottom: 8 }} />
                <InputField value={settings.studioWebsite || ''} onChange={v => update({ studioWebsite: v })} placeholder="Website URL (e.g. https://eclipsemedia.com)" style={{ marginBottom: 10 }} />
                <div style={{ ...S.row, marginBottom: 0 }}>
                  <div><div style={S.label}>Show Pixflow credit</div><div style={S.sublabel}>Display footer branding</div></div>
                  <Toggle value={settings.showFooterCredit} onChange={v => update({ showFooterCredit: v })} />
                </div>
              </div>

              {/* Gallery Layout */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Gallery Layout</p>
                <div style={S.row}>
                  <div style={S.label}>Columns</div>
                  <SegmentedControl options={[
                    { label: '1 Column', value: '1-col' as const }, { label: '2 Columns', value: '2-col' as const }, { label: '3 Columns', value: '3-col' as const },
                  ]} value={settings.layoutMode} onChange={v => update({ layoutMode: v })} />
                </div>
                <div style={S.row}>
                  <div style={S.label}>Spacing</div>
                  <SegmentedControl options={[
                    { label: 'None', value: 'none' as const }, { label: 'Small', value: 'small' as const }, { label: 'Medium', value: 'medium' as const },
                  ]} value={settings.imageSpacing} onChange={v => update({ imageSpacing: v })} />
                </div>
                <div style={{ ...S.row, marginBottom: 0 }}>
                  <div style={S.label}>Corners</div>
                  <SegmentedControl options={[
                    { label: 'Sharp', value: 'sharp' as const }, { label: 'Rounded', value: 'rounded' as const },
                  ]} value={settings.cornerStyle} onChange={v => update({ cornerStyle: v })} />
                </div>
              </div>

              {/* Welcome Screen Cover Image */}
              <CoverImagePicker
                settings={settings}
                projectImages={projectImages}
                onUpdate={update}
              />

              {/* Client Selection */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Client Selection</p>
                <div style={S.row}>
                  <div>
                    <div style={S.label}>Enable client proofing</div>
                    <div style={S.sublabel}>Client can hide photos from the gallery</div>
                  </div>
                  <Toggle value={settings.clientSelectionEnabled} onChange={v => update({ clientSelectionEnabled: v })} />
                </div>
                {settings.clientSelectionEnabled && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...S.label, marginBottom: 6, fontSize: 11 }}>Client code</div>
                    <input
                      type="text"
                      value={settings.clientCode}
                      onChange={e => update({ clientCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. SARAH2026"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
                        color: '#fff', background: 'rgba(255,255,255,.06)',
                        border: '1px solid rgba(255,255,255,.1)', borderRadius: 6,
                        outline: 'none', letterSpacing: '0.05em',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
                    />
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>
                      Share this code with your client so they can curate the gallery
                    </p>
                  </div>
                )}
              </div>

              {/* Stories */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Stories</p>
                <div style={S.row}>
                  <div>
                    <div style={S.label}>Generate stories</div>
                    <div style={S.sublabel}>{topPickCount >= 2 ? `3 stories from ${topPickCount} top picks` : 'Need at least 2 top picks'}</div>
                  </div>
                  <Toggle value={settings.generateStories} onChange={v => update({ generateStories: v })} disabled={topPickCount < 2} />
                </div>
                <div style={S.row}>
                  <div><div style={S.label}>Show stories on gallery</div><div style={S.sublabel}>Display stories carousel at the top</div></div>
                  <Toggle value={settings.showStories} onChange={v => update({ showStories: v })} />
                </div>
                {settings.generateStories && (
                  <div style={{ ...S.row, marginBottom: 0 }}>
                    <div>
                      <div style={S.label}>Logo on stories</div>
                      <div style={S.sublabel}>{settings.logoUrl ? settings.logoUrl.split('/').pop() : 'No logo selected'}</div>
                    </div>
                    <button
                      onClick={async () => {
                        const path = await window.api.chooseLogoFile()
                        if (path) update({ logoUrl: path })
                      }}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)',
                        background: settings.logoUrl ? 'rgba(99,102,241,.15)' : 'transparent',
                        color: settings.logoUrl ? '#a5b4fc' : 'rgba(255,255,255,.5)',
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {settings.logoUrl ? 'Change' : 'Choose Logo'}
                    </button>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div style={{ marginBottom: 18 }}>
                <p style={S.sectionTitle}>Summary</p>
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '10px 14px' }}>
                  {summaryLines.map((line, i) => (
                    <p key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: i === 0 ? 0 : '3px 0 0', lineHeight: 1.5 }}>
                      {line}
                      {i < summaryLines.length - 1 && <span style={{ color: 'rgba(255,255,255,.15)', margin: '0 6px' }}>·</span>}
                    </p>
                  ))}
                </div>
              </div>

              {/* Plan quota */}
              {planLimits && phase === 'settings' && !isAlreadyLive && (
                <div style={{ marginBottom: 18 }}>
                  <p style={S.sectionTitle}>Plan Usage</p>
                  <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {planLimits.maxPhotosPerMonth != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,.5)' }}>Photos this month</span>
                        <span style={{
                          color: planLimits.photosThisMonth + imageCount > planLimits.maxPhotosPerMonth ? '#ef4444' :
                            planLimits.photosThisMonth + imageCount > planLimits.maxPhotosPerMonth * 0.8 ? '#f59e0b' : 'rgba(255,255,255,.75)',
                          fontWeight: 600,
                        }}>
                          {planLimits.photosThisMonth} / {planLimits.maxPhotosPerMonth}
                          <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 400, marginLeft: 6 }}>
                            (+{imageCount} new)
                          </span>
                        </span>
                      </div>
                    )}
                    {planLimits.maxGalleries != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,.5)' }}>Galleries</span>
                        <span style={{
                          color: planLimits.galleriesCount >= planLimits.maxGalleries ? '#ef4444' : 'rgba(255,255,255,.75)',
                          fontWeight: 600,
                        }}>
                          {planLimits.galleriesCount} / {planLimits.maxGalleries}
                        </span>
                      </div>
                    )}
                    {planLimits.storageLimitBytes != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,.5)' }}>Storage</span>
                        <span style={{
                          color: planLimits.storageUsedBytes / planLimits.storageLimitBytes > 0.9 ? '#f59e0b' : 'rgba(255,255,255,.75)',
                          fontWeight: 600,
                        }}>
                          {formatBytes(planLimits.storageUsedBytes)} / {formatBytes(planLimits.storageLimitBytes)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Publish Button */}
              <button className="pub__publish" onClick={onPublish}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {phase === 'editing' ? <polyline points="20 6 9 17 4 12" /> : <polyline points="9 18 15 12 9 6" />}
                </svg>
                {phase === 'editing'
                  ? 'Save Settings'
                  : isAlreadyLive
                    ? 'Update Changes'
                    : 'Publish Gallery'}
              </button>
            </>
          )}

          {/* ═══ Publishing phase (premium multi-step) ═══ */}
          {isPublishing && (
            <div className="pub__steps">
              {/* Top summary */}
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: 0 }}>
                    {progress.totalImages} images · {progress.thumbsUploaded + progress.previewsUploaded} previews · {progress.originalsUploaded} originals
                  </p>
                  {etaLabel && (
                    <span style={{ fontSize: 11, color: 'rgba(99,102,241,.85)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      ~{etaLabel} left
                    </span>
                  )}
                </div>
                {progress.currentFile && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', margin: '4px 0 0' }}>{progress.currentFile}</p>
                )}
                {bytesLabel && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,.28)', margin: '4px 0 0' }}>{bytesLabel}</p>
                )}
              </div>

              {/* Step A: Preparing assets */}
              <PublishStep
                title="Preparing assets"
                detail={assetState === 'active' ? 'Generating thumbnails and previews...' : assetState === 'done' ? 'All assets ready' : 'Waiting'}
                state={assetState}
              />

              {/* Step B: Uploading previews */}
              <PublishStep
                title="Uploading previews"
                detail={previewState === 'active'
                  ? `${progress.thumbsUploaded + progress.previewsUploaded} / ${progress.totalImages * 2} files`
                  : previewState === 'done' ? 'All previews uploaded' : 'Waiting'}
                state={previewState}
                percent={previewState === 'active' ? previewPercent : undefined}
              />

              {/* Step C: Gallery live */}
              <PublishStep
                title="Gallery live"
                detail={liveState === 'done' ? 'Gallery is ready for your client' : 'Waiting for previews'}
                state={liveState}
              />

              {/* Step D: Originals in background */}
              <PublishStep
                title="Full-quality originals"
                detail={originalsState === 'active'
                  ? `${progress.originalsUploaded} / ${progress.totalImages} uploaded${isPaused ? ' (paused)' : ''}`
                  : originalsState === 'done'
                    ? progress.originalsFailed > 0
                      ? `${progress.originalsUploaded} uploaded, ${progress.originalsFailed} need retry`
                      : 'All originals uploaded'
                    : 'Queued for background upload'}
                state={originalsState}
                percent={originalsState === 'active' ? originalsPercent : undefined}
              />

              {/* Originals controls (pause/resume) */}
              {(publishStatus === 'uploading_originals' || publishStatus === 'partially_failed') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
                  {publishStatus === 'uploading_originals' && !isPaused && (
                    <button className="pub__done-btn pub__done-btn--ghost" onClick={pauseOriginals} style={{ fontSize: 12 }}>
                      Pause originals
                    </button>
                  )}
                  {publishStatus === 'uploading_originals' && isPaused && (
                    <button className="pub__done-btn pub__done-btn--primary" onClick={resumeOriginals} style={{ fontSize: 12 }}>
                      Resume originals
                    </button>
                  )}
                  {publishStatus === 'partially_failed' && progress.originalsFailed > 0 && (
                    <button className="pub__done-btn pub__done-btn--primary" onClick={() => retryFailedOriginals()} style={{ fontSize: 12 }}>
                      Retry {progress.originalsFailed} failed original{progress.originalsFailed > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}

              {/* Failures list */}
              {progress.failedImages.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,.4)', maxHeight: 100, overflow: 'auto' }}>
                  {progress.failedImages.map((f, i) => (
                    <p key={i} style={{ margin: '2px 0' }}>{f.filename}: {f.reason}</p>
                  ))}
                </div>
              )}

              {/* Actions */}
              {(onHide || onCancel) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {onHide && (
                    <button
                      className="pub__done-btn pub__done-btn--ghost"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={onHide}
                    >
                      Hide & Continue
                    </button>
                  )}
                  {onCancel && (
                    <button
                      className="pub__done-btn pub__done-btn--ghost"
                      style={{ flex: 1, fontSize: 12, color: '#ef4444', borderColor: 'rgba(239,68,68,.2)' }}
                      onClick={onCancel}
                    >
                      Cancel Upload
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ Done phase ═══ */}
          {phase === 'done' && (
            <DoneScreen
              projectName={projectName}
              publicUrl={publicUrl}
              error={error}
              onClose={onClose!}
            />
          )}

          {/* ═══ Error phase ═══ */}
          {phase === 'error' && (
            <div className="pub__error">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="pub__error-msg">{error || 'Something went wrong'}</p>

              {progress.failedImages.length > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', margin: '12px 0', textAlign: 'left', maxHeight: 120, overflow: 'auto' }}>
                  {progress.failedImages.map((f, i) => (
                    <p key={i} style={{ margin: '2px 0' }}>{f.filename}: {f.reason}</p>
                  ))}
                </div>
              )}

              {onRetry && <button className="pub__retry" onClick={onRetry}>Retry</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
