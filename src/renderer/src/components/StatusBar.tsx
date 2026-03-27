import React from 'react'
import { useGallery } from '../store/gallery'
import { useSections } from '../store/sections'

export function StatusBar() {
  const { images, selectedIds, topPickIds, isLoading } = useGallery()
  const { sections, activeSectionFilter } = useSections()

  const activeSection = activeSectionFilter
    ? sections.find(s => s.id === activeSectionFilter)
    : null
  const displayCount = activeSection ? activeSection.imageIds.length : images.length

  if (isLoading || images.length === 0) return null

  return (
    <div className="status-bar">
      {activeSection && (
        <>
          <span className="status-bar__chip status-bar__chip--section">{activeSection.name}</span>
          <span className="status-bar__sep">·</span>
        </>
      )}
      <span className="status-bar__chip">{displayCount} images</span>
      {selectedIds.size > 0 && (
        <>
          <span className="status-bar__sep">·</span>
          <span className="status-bar__chip status-bar__chip--selected">{selectedIds.size} selected</span>
        </>
      )}
      {topPickIds.size > 0 && (
        <>
          <span className="status-bar__sep">·</span>
          <span className="status-bar__chip status-bar__chip--pick">★ {topPickIds.size}</span>
        </>
      )}
    </div>
  )
}
