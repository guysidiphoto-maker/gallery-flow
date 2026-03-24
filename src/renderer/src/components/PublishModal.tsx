import React from 'react'
import { useSections } from '../store/sections'
import { SECTION_COLORS } from './SectionsPanel'
import { useGallery } from '../store/gallery'
import type { SectionNamingMode } from '../types'


const NAMING_LABELS: Record<SectionNamingMode, string> = {
  sequential: 'Sequential (01, 02…)',
  original: 'Original filename',
  'custom-prefix': 'Custom prefix'
}

function NamingSelect({
  mode,
  prefix,
  onChange
}: {
  mode: SectionNamingMode
  prefix: string
  onChange: (mode: SectionNamingMode, prefix: string) => void
}) {
  return (
    <div className="publish-naming">
      <select
        className="publish-naming__select"
        value={mode}
        onChange={e => onChange(e.target.value as SectionNamingMode, prefix)}
      >
        {(Object.keys(NAMING_LABELS) as SectionNamingMode[]).map(k => (
          <option key={k} value={k}>{NAMING_LABELS[k]}</option>
        ))}
      </select>
      {mode === 'custom-prefix' && (
        <input
          className="publish-naming__prefix"
          placeholder="e.g. BW_"
          value={prefix}
          onChange={e => onChange(mode, e.target.value)}
        />
      )}
    </div>
  )
}

export function PublishModal() {
  const {
    sections,
    isPublishModalOpen,
    isPublishing,
    publishDone,
    publishError,
    publishOutputDir,
    closePublishModal,
    setSectionNamingMode,
    publishSections,
  } = useSections()
  const { images } = useGallery()

  if (!isPublishModalOpen && !isPublishing && !publishDone && !publishError) return null

  const galleryIds = new Set(images.map(i => i.id))

  const handlePublish = () => publishSections(images)

  const handleReveal = () => {
    if (publishOutputDir) window.api.revealInFinder(publishOutputDir)
  }

  if (isPublishing) {
    return (
      <div className="publish-modal-overlay">
        <div className="publish-modal">
          <div className="publish-modal__busy">
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p>Publishing…</p>
          </div>
        </div>
      </div>
    )
  }

  if (publishDone) {
    return (
      <div className="publish-modal-overlay" onClick={closePublishModal}>
        <div className="publish-modal" onClick={e => e.stopPropagation()}>
          <div className="publish-modal__done">
            <div className="publish-modal__done-icon">✓</div>
            <p className="publish-modal__done-title">Published!</p>
            <p className="publish-modal__done-dir">{publishOutputDir}</p>
            <div className="publish-modal__actions">
              <button className="btn btn--accent" onClick={handleReveal}>Reveal in Finder</button>
              <button className="btn btn--ghost" onClick={closePublishModal}>Close</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (publishError) {
    return (
      <div className="publish-modal-overlay" onClick={closePublishModal}>
        <div className="publish-modal" onClick={e => e.stopPropagation()}>
          <div className="publish-modal__error">
            <p className="publish-modal__error-title">Publish failed</p>
            <p className="publish-modal__error-msg">{publishError}</p>
            <button className="btn btn--ghost" onClick={closePublishModal}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="publish-modal-overlay" onClick={closePublishModal}>
      <div className="publish-modal" onClick={e => e.stopPropagation()}>
        <div className="publish-modal__header">
          <h2 className="publish-modal__title">Publish Gallery</h2>
          <button className="publish-modal__close" onClick={closePublishModal}>✕</button>
        </div>

        <p className="publish-modal__desc">
          Each section becomes a subfolder in the chosen destination folder.
        </p>

        <div className="publish-modal__sections">
          {sections.map((sec, idx) => {
            const count = sec.imageIds.filter(id => galleryIds.has(id)).length
            const color = SECTION_COLORS[idx % SECTION_COLORS.length]
            return (
              <div key={sec.id} className="publish-modal__section">
                <div className="publish-modal__section-header">
                  <span className="publish-modal__section-dot" style={{ background: color }} />
                  <span className="publish-modal__section-name">{sec.name}</span>
                  <span className="publish-modal__section-count">
                    {count > 0 ? `${count} images → ${sec.name}/` : 'empty — will be skipped'}
                  </span>
                </div>
                {count > 0 && (
                  <NamingSelect
                    mode={sec.namingMode}
                    prefix={sec.customPrefix}
                    onChange={(mode, prefix) => setSectionNamingMode(sec.id, mode, prefix)}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="publish-modal__footer">
          <button className="btn btn--ghost" onClick={closePublishModal}>Cancel</button>
          <button
            className="btn btn--accent"
            onClick={handlePublish}
            disabled={sections.every(s => s.imageIds.length === 0)}
          >
            Choose Folder & Publish →
          </button>
        </div>
      </div>
    </div>
  )
}
