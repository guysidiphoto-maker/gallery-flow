import React from 'react'
import { useGallery } from '../store/gallery'
import { toLocalURL } from '../utils/imageUtils'

export function DuplicatesPanel() {
  const {
    showDuplicatesPanel,
    duplicateGroups,
    isDuplicateScanning,
    duplicateScanProgress,
    images,
    deleteImage,
    toggleDuplicatesPanel
  } = useGallery()

  if (!showDuplicatesPanel) return null

  const imgById = new Map(images.map(img => [img.id, img]))

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <h3>Duplicates</h3>
        <button className="btn btn--ghost btn--icon" onClick={toggleDuplicatesPanel}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="sidebar__body">
        {isDuplicateScanning ? (
          <div className="sidebar__progress">
            <div className="progress-bar">
              <div className="progress-bar__fill" style={{ width: `${duplicateScanProgress}%` }} />
            </div>
            <span>Scanning… {duplicateScanProgress}%</span>
          </div>
        ) : duplicateGroups.length === 0 ? (
          <div className="sidebar__empty">
            <p>No duplicates found.</p>
            <p className="sidebar__hint">Run scan from the toolbar to detect visually similar images.</p>
          </div>
        ) : (
          duplicateGroups.map((group, gi) => (
            <div key={gi} className="duplicate-group">
              <div className="duplicate-group__label">
                Group {gi + 1} · {group.ids.length} images
              </div>
              <div className="duplicate-group__items">
                {group.ids.map(id => {
                  const img = imgById.get(id)
                  if (!img) return null
                  return (
                    <div key={id} className="duplicate-item">
                      <img
                        src={toLocalURL(img.path)}
                        alt={img.filename}
                        className="duplicate-item__thumb"
                        loading="lazy"
                      />
                      <div className="duplicate-item__info">
                        <span className="duplicate-item__name" title={img.filename}>
                          {img.filename}
                        </span>
                        <span className="duplicate-item__size">
                          {(img.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => deleteImage(id)}
                        title="Move to Trash"
                      >
                        Delete
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
