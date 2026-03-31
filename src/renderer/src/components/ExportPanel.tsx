import React, { useState } from 'react'
import { useGallery } from '../store/gallery'
import { useSocial } from '../store/social'

type Resolution = 'original' | '2048' | '1080'
type Format = 'jpg' | 'png'

interface SectionState {
  enabled: boolean
  resolution: Resolution
  format: Format
}

const defaultSection = (enabled: boolean): SectionState => ({ enabled, resolution: 'original', format: 'jpg' })

export function ExportPanel() {
  const { closeExportPanel, images, topPickIds, openStoryModal, folderPath } = useGallery()
  const { openSocial, initFromPicks } = useSocial()

  const hasPicks = topPickIds.size > 0

  const [picks,    setPicks]    = useState<SectionState>(defaultSection(hasPicks))
  const [insta,    setInsta]    = useState<SectionState>({ enabled: hasPicks, resolution: '1080', format: 'jpg' })
  const [story,    setStory]    = useState<SectionState>(defaultSection(hasPicks))
  const [delivery, setDelivery] = useState<SectionState>(defaultSection(true))

  const handleStory = () => { closeExportPanel(); openStoryModal() }
  const handleInsta = () => { closeExportPanel(); initFromPicks(images, topPickIds); openSocial() }
  const handleReveal = () => {
    if (!folderPath) return
    // Reveal the folder itself for client delivery
    const firstPick = images.find(img => topPickIds.has(img.id))
    if (firstPick) window.api.revealInFinder(firstPick.id)
  }

  return (
    <div className="export-panel__backdrop" onClick={closeExportPanel}>
      <div className="export-panel" onClick={e => e.stopPropagation()}>

        <div className="export-panel__header">
          <div className="export-panel__title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Export Event
          </div>
          <div className="export-panel__meta">
            {images.length} images · {hasPicks ? `${topPickIds.size} picks` : 'no picks yet'}
          </div>
          <button className="export-panel__close" onClick={closeExportPanel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="export-panel__body">

          {/* ── Top Picks ── */}
          <ExportSection
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            }
            title="Top Picks"
            description={hasPicks ? `${topPickIds.size} highlighted images ready to export` : 'Mark images with T to create your picks'}
            state={picks}
            onChange={setPicks}
            disabled={!hasPicks}
            showResolution
          >
            <button
              className="export-section__action"
              disabled={!hasPicks}
              onClick={handleReveal}
            >
              Reveal in Finder
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </ExportSection>

          {/* ── Instagram ── */}
          <ExportSection
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            }
            title="Instagram"
            description="Square-optimized exports for social media"
            state={insta}
            onChange={setInsta}
            disabled={!hasPicks}
            resolutionFixed="1080px"
          >
            <button
              className="export-section__action"
              disabled={!hasPicks}
              onClick={handleInsta}
            >
              Export for Instagram
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </ExportSection>

          {/* ── Stories ── */}
          <ExportSection
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            }
            title="Stories"
            description="Video slideshow from your top picks"
            state={story}
            onChange={setStory}
            disabled={!hasPicks}
            resolutionFixed="1080p video"
          >
            <button
              className="export-section__action"
              disabled={!hasPicks}
              onClick={handleStory}
            >
              Create Story
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </ExportSection>

          {/* ── Client Delivery ── */}
          <ExportSection
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            }
            title="Client Delivery"
            description={`Full resolution gallery · ${images.length} images · original quality`}
            state={delivery}
            onChange={setDelivery}
            resolutionFixed="Original"
          >
            <button className="export-section__action export-section__action--soon" disabled>
              Coming soon
            </button>
          </ExportSection>

        </div>
      </div>
    </div>
  )
}

/* ── Section component ── */

function ResolutionSelect({ value, onChange }: { value: Resolution; onChange: (v: Resolution) => void }) {
  return (
    <select className="export-section__select" value={value} onChange={e => onChange(e.target.value as Resolution)}>
      <option value="original">Original</option>
      <option value="2048">2048px</option>
      <option value="1080">1080px</option>
    </select>
  )
}

function FormatSelect({ value, onChange }: { value: Format; onChange: (v: Format) => void }) {
  return (
    <select className="export-section__select" value={value} onChange={e => onChange(e.target.value as Format)}>
      <option value="jpg">JPG</option>
      <option value="png">PNG</option>
    </select>
  )
}

interface ExportSectionProps {
  icon: React.ReactNode
  title: string
  description: string
  state: SectionState
  onChange: (s: SectionState) => void
  disabled?: boolean
  showResolution?: boolean
  resolutionFixed?: string
  children: React.ReactNode
}

function ExportSection({ icon, title, description, state, onChange, disabled, showResolution, resolutionFixed, children }: ExportSectionProps) {
  const inactive = disabled || !state.enabled

  return (
    <div className={`export-section ${inactive ? 'export-section--off' : ''}`}>
      <div className="export-section__top">
        <div className="export-section__icon">{icon}</div>
        <div className="export-section__info">
          <div className="export-section__title">{title}</div>
          <div className="export-section__desc">{description}</div>
        </div>
        <label className="export-section__toggle">
          <input
            type="checkbox"
            checked={state.enabled && !disabled}
            disabled={disabled}
            onChange={e => onChange({ ...state, enabled: e.target.checked })}
          />
          <span className="export-section__toggle-track"/>
        </label>
      </div>

      {state.enabled && !disabled && (
        <div className="export-section__options">
          <div className="export-section__selects">
            {resolutionFixed ? (
              <span className="export-section__fixed">{resolutionFixed}</span>
            ) : (
              <ResolutionSelect value={state.resolution} onChange={v => onChange({ ...state, resolution: v })}/>
            )}
            {!resolutionFixed && (
              <FormatSelect value={state.format} onChange={v => onChange({ ...state, format: v })}/>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
