import React from 'react'
import type { DeliverySettings } from '../App'

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
  uploadProgress: { uploaded: number; total: number }
  storyProgress: { completed: number; total: number; currentStyle: string }
  error?: string
  galleryDir?: string
  onOpenGallery?: () => void
  onRetry?: () => void
}

export function PublishPanel({ projectName, clientName, imageCount, topPickCount, settings, onSettingsChange, onPublish, onClose, phase, uploadProgress, storyProgress, error, onOpenGallery, onRetry }: PublishPanelProps) {
  const update = (partial: Partial<DeliverySettings>) => {
    onSettingsChange({ ...settings, ...partial })
  }

  return (
    <div className="pub-overlay" onClick={phase === 'settings' || phase === 'done' || phase === 'error' ? onClose : undefined}>
      <div className="pub" onClick={e => e.stopPropagation()}>
        <div className="pub__header">
          <h2 className="pub__title">
            {phase === 'settings' && 'Publish Gallery'}
            {phase === 'publishing' && 'Publishing...'}
            {phase === 'done' && 'Published!'}
            {phase === 'error' && 'Error'}
          </h2>
          {(phase === 'settings' || phase === 'done' || phase === 'error') && (
            <button className="pub__close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="pub__body">
          {/* Settings phase */}
          {phase === 'settings' && (
            <>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,.3)', margin: '0 0 20px' }}>
                {projectName}{clientName ? ` — ${clientName}` : ''} · {imageCount} images{topPickCount > 0 ? ` · ${topPickCount} top picks` : ''}
              </p>

              <div className="pub__section">
                <label className="pub__label">Branding</label>
                <input
                  className="pub__input"
                  type="text"
                  placeholder="Studio name (optional)"
                  value={settings.studioName}
                  onChange={e => update({ studioName: e.target.value })}
                />
              </div>

              <div className="pub__section">
                <label className="pub__label">Delivery</label>
                <div className="pub__toggle-row">
                  <div>
                    <div className="pub__toggle-label">Allow downloads</div>
                    <div className="pub__toggle-sub">Clients can download images</div>
                  </div>
                  <button
                    className={`pub__toggle ${settings.allowDownloads ? 'pub__toggle--on' : ''}`}
                    onClick={() => update({ allowDownloads: !settings.allowDownloads })}
                  />
                </div>
                <div className="pub__toggle-row">
                  <div>
                    <div className="pub__toggle-label">Auto-generate stories</div>
                    <div className="pub__toggle-sub">{topPickCount >= 2 ? `4 stories from ${topPickCount} top picks` : 'Need at least 2 top picks'}</div>
                  </div>
                  <button
                    className={`pub__toggle ${settings.autoGenerateStories && topPickCount >= 2 ? 'pub__toggle--on' : ''}`}
                    onClick={() => update({ autoGenerateStories: !settings.autoGenerateStories })}
                    disabled={topPickCount < 2}
                  />
                </div>
              </div>

              <button className="pub__publish" onClick={onPublish}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Publish Gallery
              </button>
            </>
          )}

          {/* Publishing phase */}
          {phase === 'publishing' && (
            <div className="pub__steps">
              <div className="pub__step">
                <div className={`pub__step-icon ${uploadProgress.uploaded >= uploadProgress.total && uploadProgress.total > 0 ? 'pub__step-icon--done' : 'pub__step-icon--active'}`}>
                  {uploadProgress.uploaded >= uploadProgress.total && uploadProgress.total > 0 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <div className="pub__spinner" />
                  )}
                </div>
                <div className="pub__step-info">
                  <p className="pub__step-title">Preparing gallery</p>
                  <p className="pub__step-detail">{uploadProgress.uploaded} / {uploadProgress.total} images</p>
                  {uploadProgress.total > 0 && (
                    <div className="pub__step-bar">
                      <div className="pub__step-bar-fill" style={{ width: `${Math.round((uploadProgress.uploaded / uploadProgress.total) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>

              <div className="pub__step">
                <div className={`pub__step-icon ${
                  storyProgress.completed >= storyProgress.total ? 'pub__step-icon--done' :
                  storyProgress.currentStyle ? 'pub__step-icon--active' : 'pub__step-icon--waiting'
                }`}>
                  {storyProgress.completed >= storyProgress.total ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : storyProgress.currentStyle ? (
                    <div className="pub__spinner" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                  )}
                </div>
                <div className="pub__step-info">
                  <p className="pub__step-title">Generating stories</p>
                  <p className="pub__step-detail">
                    {storyProgress.completed >= storyProgress.total
                      ? '4 stories ready'
                      : storyProgress.currentStyle
                        ? `${storyProgress.completed}/4 — ${storyProgress.currentStyle}`
                        : 'Waiting...'}
                  </p>
                  <div className="pub__step-bar">
                    <div className="pub__step-bar-fill" style={{ width: `${Math.round((storyProgress.completed / storyProgress.total) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Done phase */}
          {phase === 'done' && (
            <div className="pub__done">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="16 8 10 16 7 13"/>
              </svg>
              <h3 className="pub__done-title">Gallery published!</h3>
              <p className="pub__done-sub">{projectName} is ready for your client</p>
              <div className="pub__done-actions">
                {onOpenGallery && (
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

          {/* Error phase */}
          {phase === 'error' && (
            <div className="pub__error">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <p className="pub__error-msg">{error || 'Something went wrong'}</p>
              {onRetry && <button className="pub__retry" onClick={onRetry}>Retry</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
