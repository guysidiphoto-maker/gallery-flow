import React, { useState, useEffect } from 'react'
import type { DeliverySettings } from '../App'
import { usePublish } from '../store/publish'
import type { PublishStatus } from '../lib/uploadTypes'
import { pauseOriginals, resumeOriginals, retryFailedOriginals } from '../lib/cloudUpload'
import { computeByteProgress, computeEtaSeconds, formatEta, formatBytes } from '../lib/eta'
import { fetchPlanLimits, type PlanLimits } from '../lib/planGuard'

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
    fontSize: 11,
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,.35)',
    margin: '0 0 10px',
  },
  section: {
    paddingBottom: 18,
    marginBottom: 18,
    borderBottom: '1px solid rgba(255,255,255,.06)',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    color: 'rgba(255,255,255,.88)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  inputFocusColor: 'rgba(99,102,241,.4)',
  row: {
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,.7)',
    fontWeight: 500 as const,
  },
  sublabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,.28)',
    marginTop: 2,
  },
  accent: '#6366f1',
}

// ─── Reusable Components ────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none',
        background: value ? S.accent : 'rgba(255,255,255,.1)',
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .15s',
        flexShrink: 0, opacity: disabled ? 0.4 : 1, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s',
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
      borderRadius: 8, padding: 2, gap: 1, opacity: disabled ? 0.4 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} style={{
            padding: '5px 12px', fontSize: 12, fontWeight: active ? 600 : 400,
            color: active ? '#fff' : 'rgba(255,255,255,.4)',
            background: active ? S.accent : 'transparent',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            transition: 'all .15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
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
  error, publicUrl, onRetry, onHide, onCancel, isAlreadyLive,
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
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', margin: '0 0 20px' }}>
                {projectName}{clientName ? ` -- ${clientName}` : ''} · {imageCount} images
                {topPickCount > 0 ? ` · ${topPickCount} top picks` : ''}
              </p>

              {/* Gallery Info */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Gallery Info</p>
                <InputField value={settings.galleryTitle} onChange={v => update({ galleryTitle: v })} placeholder={projectName || 'Gallery title'} style={{ marginBottom: 8 }} />
                <InputField value={settings.clientName} onChange={v => update({ clientName: v })} placeholder={clientName || 'Client name'} />
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
