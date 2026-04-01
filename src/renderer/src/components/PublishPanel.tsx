import React from 'react'
import type { DeliverySettings } from '../App'

interface UploadResult {
  totalImages: number
  originalsUploaded: number
  webCopiesUploaded: number
  thumbsUploaded: number
  failedFiles: Array<{ filename: string; reason: string }>
}

interface PublishPanelProps {
  projectName: string
  clientName: string | null
  imageCount: number
  topPickCount: number
  settings: DeliverySettings
  onSettingsChange: (settings: DeliverySettings) => void
  onPublish: () => void
  onClose: () => void
  phase: 'settings' | 'publishing' | 'done' | 'error'
  uploadProgress: { uploaded: number; total: number; currentFile?: string; phase?: string; result?: UploadResult }
  storyProgress: { completed: number; total: number; currentStyle: string }
  error?: string
  galleryDir?: string
  publicUrl?: string
  onOpenGallery?: () => void
  onRetry?: () => void
  projectImages?: Array<{ id: string; path: string }>
}

const PHASE_LABELS: Record<string, string> = {
  originals: 'Uploading originals',
  web: 'Uploading display copies',
  thumbnails: 'Uploading thumbnails',
  finalizing: 'Finalizing',
}

/* ── Style constants ────────────────────────────────────────────── */

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

/* ── Reusable sub-components ────────────────────────────────────── */

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        background: value ? S.accent : 'rgba(255,255,255,.1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .15s',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .15s',
        }}
      />
    </button>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'rgba(255,255,255,.04)',
        borderRadius: 8,
        padding: 2,
        gap: 1,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              color: active ? '#fff' : 'rgba(255,255,255,.4)',
              background: active ? S.accent : 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all .15s',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function InputField({
  value,
  onChange,
  placeholder,
  type = 'text',
  style: extraStyle,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  style?: React.CSSProperties
}) {
  const [focused, setFocused] = React.useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...S.input,
        borderColor: focused ? S.inputFocusColor : 'rgba(255,255,255,.08)',
        ...extraStyle,
      }}
    />
  )
}

/* ── Main component ─────────────────────────────────────────────── */

export function PublishPanel({
  projectName,
  clientName,
  imageCount,
  topPickCount,
  settings,
  onSettingsChange,
  onPublish,
  onClose,
  phase,
  uploadProgress,
  storyProgress,
  error,
  publicUrl,
  onOpenGallery,
  onRetry,
}: PublishPanelProps) {
  const update = (partial: Partial<DeliverySettings>) => {
    onSettingsChange({ ...settings, ...partial })
  }

  const uploadPhaseLabel = PHASE_LABELS[uploadProgress.phase || ''] || 'Uploading images'
  const uploadDone =
    uploadProgress.uploaded >= uploadProgress.total &&
    uploadProgress.total > 0 &&
    uploadProgress.phase === 'finalizing'

  /* ── Build summary lines ───────────────────────────── */
  const summaryLines: string[] = []

  if (settings.accessType === 'public') {
    summaryLines.push('Public gallery')
  } else {
    summaryLines.push('Password-protected gallery')
  }

  if (settings.downloadsEnabled) {
    const qualityLabel = { web: 'web', high: 'high', original: 'original' }[settings.downloadQuality]
    summaryLines.push(`Downloads in ${qualityLabel} quality`)
  } else {
    summaryLines.push('Downloads disabled')
  }

  const layoutLabel = { '1-col': '1-column', '2-col': '2-column', '3-col': '3-column' }[settings.layoutMode]
  summaryLines.push(`${layoutLabel} layout`)

  if (settings.generateStories && topPickCount >= 2) {
    summaryLines.push('Stories included')
  }

  return (
    <div className="pub-overlay" onClick={phase === 'settings' || phase === 'done' || phase === 'error' ? onClose : undefined}>
      <div className="pub" onClick={e => e.stopPropagation()} style={phase === 'settings' ? { maxHeight: '90vh', display: 'flex', flexDirection: 'column' } : undefined}>
        {/* Header */}
        <div className="pub__header">
          <h2 className="pub__title">
            {phase === 'settings' && 'Delivery Settings'}
            {phase === 'publishing' && 'Publishing...'}
            {phase === 'done' && 'Published!'}
            {phase === 'error' && 'Error'}
          </h2>
          {(phase === 'settings' || phase === 'done' || phase === 'error') && (
            <button className="pub__close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div
          className="pub__body"
          style={phase === 'settings' ? { overflowY: 'auto', flex: 1, minHeight: 0 } : undefined}
        >
          {/* ═══════ Settings phase ═══════ */}
          {phase === 'settings' && (
            <>
              {/* Project info line */}
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', margin: '0 0 20px' }}>
                {projectName}
                {clientName ? ` -- ${clientName}` : ''} · {imageCount} images
                {topPickCount > 0 ? ` · ${topPickCount} top picks` : ''}
              </p>

              {/* A. Gallery Info */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Gallery Info</p>
                <InputField
                  value={settings.galleryTitle}
                  onChange={v => update({ galleryTitle: v })}
                  placeholder={projectName || 'Gallery title'}
                  style={{ marginBottom: 8 }}
                />
                <InputField
                  value={settings.clientName}
                  onChange={v => update({ clientName: v })}
                  placeholder={clientName || 'Client name'}
                />
              </div>

              {/* B. Access */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Access</p>
                <div style={{ marginBottom: settings.accessType === 'password' ? 10 : 0 }}>
                  <SegmentedControl
                    options={[
                      { label: 'Public', value: 'public' as const },
                      { label: 'Password', value: 'password' as const },
                    ]}
                    value={settings.accessType}
                    onChange={v => update({ accessType: v, password: v === 'public' ? null : settings.password || '' })}
                  />
                </div>
                {settings.accessType === 'password' && (
                  <InputField
                    value={settings.password || ''}
                    onChange={v => update({ password: v })}
                    placeholder="Enter gallery password"
                    type="text"
                    style={{ marginTop: 2 }}
                  />
                )}
              </div>

              {/* C. Downloads */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Downloads</p>
                <div style={S.row}>
                  <div>
                    <div style={S.label}>Allow downloads</div>
                    <div style={S.sublabel}>Clients can download images</div>
                  </div>
                  <Toggle value={settings.downloadsEnabled} onChange={v => update({ downloadsEnabled: v })} />
                </div>
                {settings.downloadsEnabled && (
                  <div style={S.row}>
                    <div>
                      <div style={S.label}>Download quality</div>
                    </div>
                    <SegmentedControl
                      options={[
                        { label: 'Web', value: 'web' as const },
                        { label: 'High', value: 'high' as const },
                        { label: 'Original', value: 'original' as const },
                      ]}
                      value={settings.downloadQuality}
                      onChange={v => update({ downloadQuality: v })}
                    />
                  </div>
                )}
                {settings.downloadsEnabled && (
                  <div style={{ ...S.row, marginBottom: 0 }}>
                    <div>
                      <div style={S.label}>Bulk download</div>
                      <div style={S.sublabel}>Allow downloading all images at once</div>
                    </div>
                    <Toggle value={settings.bulkDownloadEnabled} onChange={v => update({ bulkDownloadEnabled: v })} />
                  </div>
                )}
              </div>

              {/* D. Branding */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Branding</p>
                <InputField
                  value={settings.studioName}
                  onChange={v => update({ studioName: v })}
                  placeholder="Studio name"
                  style={{ marginBottom: 10 }}
                />
                <div style={{ ...S.row, marginBottom: 0 }}>
                  <div>
                    <div style={S.label}>Show Pixflow credit</div>
                    <div style={S.sublabel}>Display footer branding</div>
                  </div>
                  <Toggle value={settings.showFooterCredit} onChange={v => update({ showFooterCredit: v })} />
                </div>
              </div>

              {/* E. Gallery Layout */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Gallery Layout</p>
                <div style={S.row}>
                  <div style={S.label}>Columns</div>
                  <SegmentedControl
                    options={[
                      { label: '1 Column', value: '1-col' as const },
                      { label: '2 Columns', value: '2-col' as const },
                      { label: '3 Columns', value: '3-col' as const },
                    ]}
                    value={settings.layoutMode}
                    onChange={v => update({ layoutMode: v })}
                  />
                </div>
                <div style={S.row}>
                  <div style={S.label}>Spacing</div>
                  <SegmentedControl
                    options={[
                      { label: 'None', value: 'none' as const },
                      { label: 'Small', value: 'small' as const },
                      { label: 'Medium', value: 'medium' as const },
                    ]}
                    value={settings.imageSpacing}
                    onChange={v => update({ imageSpacing: v })}
                  />
                </div>
                <div style={{ ...S.row, marginBottom: 0 }}>
                  <div style={S.label}>Corners</div>
                  <SegmentedControl
                    options={[
                      { label: 'Sharp', value: 'sharp' as const },
                      { label: 'Rounded', value: 'rounded' as const },
                    ]}
                    value={settings.cornerStyle}
                    onChange={v => update({ cornerStyle: v })}
                  />
                </div>
              </div>

              {/* F. Stories */}
              <div style={S.section}>
                <p style={S.sectionTitle}>Stories</p>
                <div style={S.row}>
                  <div>
                    <div style={S.label}>Generate stories</div>
                    <div style={S.sublabel}>
                      {topPickCount >= 2
                        ? `4 stories from ${topPickCount} top picks`
                        : 'Need at least 2 top picks'}
                    </div>
                  </div>
                  <Toggle
                    value={settings.generateStories}
                    onChange={v => update({ generateStories: v })}
                    disabled={topPickCount < 2}
                  />
                </div>
                <div style={{ ...S.row, marginBottom: 0 }}>
                  <div>
                    <div style={S.label}>Show stories on gallery</div>
                    <div style={S.sublabel}>Display stories carousel at the top</div>
                  </div>
                  <Toggle value={settings.showStories} onChange={v => update({ showStories: v })} />
                </div>
              </div>

              {/* G. Publish Summary */}
              <div style={{ marginBottom: 18 }}>
                <p style={S.sectionTitle}>Summary</p>
                <div
                  style={{
                    background: 'rgba(255,255,255,.03)',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}
                >
                  {summaryLines.map((line, i) => (
                    <p
                      key={i}
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.5)',
                        margin: i === 0 ? 0 : '3px 0 0',
                        lineHeight: 1.5,
                      }}
                    >
                      {line}
                      {i < summaryLines.length - 1 && (
                        <span style={{ color: 'rgba(255,255,255,.15)', margin: '0 6px' }}>·</span>
                      )}
                    </p>
                  ))}
                </div>
              </div>

              {/* H. Publish Button */}
              <button className="pub__publish" onClick={onPublish}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Publish Gallery
              </button>
            </>
          )}

          {/* ═══════ Publishing phase ═══════ */}
          {phase === 'publishing' && (
            <div className="pub__steps">
              {/* Upload step */}
              <div className="pub__step">
                <div className={`pub__step-icon ${uploadDone ? 'pub__step-icon--done' : 'pub__step-icon--active'}`}>
                  {uploadDone ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="pub__spinner" />
                  )}
                </div>
                <div className="pub__step-info">
                  <p className="pub__step-title">{uploadPhaseLabel}</p>
                  <p className="pub__step-detail">
                    {uploadProgress.uploaded} / {uploadProgress.total}
                    {uploadProgress.currentFile && (
                      <span style={{ color: 'rgba(255,255,255,.3)', marginLeft: 6 }}>
                        {uploadProgress.currentFile}
                      </span>
                    )}
                  </p>
                  {uploadProgress.total > 0 && (
                    <div className="pub__step-bar">
                      <div
                        className="pub__step-bar-fill"
                        style={{
                          width: `${Math.round((uploadProgress.uploaded / uploadProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  {uploadProgress.result && (
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', marginTop: 4 }}>
                      {uploadProgress.result.originalsUploaded} originals ·{' '}
                      {uploadProgress.result.webCopiesUploaded} web ·{' '}
                      {uploadProgress.result.thumbsUploaded} thumbs
                    </p>
                  )}
                </div>
              </div>

              {/* Stories step */}
              <div className="pub__step">
                <div
                  className={`pub__step-icon ${
                    storyProgress.completed >= storyProgress.total
                      ? 'pub__step-icon--done'
                      : storyProgress.currentStyle
                        ? 'pub__step-icon--active'
                        : 'pub__step-icon--waiting'
                  }`}
                >
                  {storyProgress.completed >= storyProgress.total ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : storyProgress.currentStyle ? (
                    <div className="pub__spinner" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  )}
                </div>
                <div className="pub__step-info">
                  <p className="pub__step-title">Generating stories</p>
                  <p className="pub__step-detail">
                    {storyProgress.completed >= storyProgress.total
                      ? '4 stories ready'
                      : storyProgress.currentStyle
                        ? `${storyProgress.completed}/4 -- ${storyProgress.currentStyle}`
                        : 'Waiting...'}
                  </p>
                  <div className="pub__step-bar">
                    <div
                      className="pub__step-bar-fill"
                      style={{
                        width: `${Math.round((storyProgress.completed / storyProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ Done phase ═══════ */}
          {phase === 'done' && (
            <div className="pub__done">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="16 8 10 16 7 13" />
              </svg>
              <h3 className="pub__done-title">Gallery published!</h3>
              <p className="pub__done-sub">{projectName} is ready for your client</p>
              {uploadProgress.result && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', margin: '8px 0 4px' }}>
                  {uploadProgress.result.totalImages} images --{' '}
                  {uploadProgress.result.originalsUploaded} originals,{' '}
                  {uploadProgress.result.webCopiesUploaded} web copies
                </p>
              )}
              {publicUrl && (
                <p
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,.4)',
                    wordBreak: 'break-all',
                    margin: '8px 0 16px',
                    fontFamily: 'monospace',
                  }}
                >
                  {publicUrl}
                </p>
              )}
              {error && (
                <p style={{ fontSize: 11, color: '#f59e0b', margin: '0 0 12px' }}>{error}</p>
              )}
              <div className="pub__done-actions">
                {publicUrl && (
                  <button
                    className="pub__done-btn pub__done-btn--primary"
                    onClick={() => navigator.clipboard.writeText(publicUrl)}
                  >
                    Copy Link
                  </button>
                )}
                {publicUrl && (
                  <button
                    className="pub__done-btn pub__done-btn--primary"
                    onClick={() => window.open(publicUrl, '_blank')}
                  >
                    Open in Browser
                  </button>
                )}
                {!publicUrl && onOpenGallery && (
                  <button className="pub__done-btn pub__done-btn--primary" onClick={onOpenGallery}>
                    Open Gallery
                  </button>
                )}
                <button className="pub__done-btn pub__done-btn--ghost" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* ═══════ Error phase ═══════ */}
          {phase === 'error' && (
            <div className="pub__error">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="pub__error-msg">{error || 'Something went wrong'}</p>
              {uploadProgress.result && uploadProgress.result.failedFiles.length > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,.4)',
                    margin: '12px 0',
                    textAlign: 'left',
                    maxHeight: 120,
                    overflow: 'auto',
                  }}
                >
                  {uploadProgress.result.failedFiles.map((f, i) => (
                    <p key={i} style={{ margin: '2px 0' }}>
                      {f.filename}: {f.reason}
                    </p>
                  ))}
                </div>
              )}
              {onRetry && (
                <button className="pub__retry" onClick={onRetry}>
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
