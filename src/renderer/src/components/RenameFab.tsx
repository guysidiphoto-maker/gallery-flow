import React, { useState } from 'react'
import { useGallery } from '../store/gallery'

export function RenameFab() {
  const {
    images,
    prepareApplyOrder,
    openRandomizeModal,
    filenamePrefix,
    setFilenamePrefix,
  } = useGallery()

  const [open, setOpen] = useState(false)
  const [localPrefix, setLocalPrefix] = useState(filenamePrefix)

  if (images.length === 0) return null

  return (
    <div className="fab-wrap">
      {open && (
        <>
          <div className="fab-overlay" onClick={() => setOpen(false)} />
          <div className="fab-menu">
            <div className="fab-menu__label">Optional prefix</div>
            <input
              className="fab-menu__input"
              type="text"
              placeholder="e.g. wedding_"
              value={localPrefix}
              onChange={e => setLocalPrefix(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
            <div className="fab-menu__example">
              → {localPrefix || ''}0001.jpg, {localPrefix || ''}0002.jpg…
            </div>
            <div className="fab-menu__divider" />
            <button
              className="fab-menu__confirm"
              onClick={() => {
                setOpen(false)
                setFilenamePrefix(localPrefix)
                prepareApplyOrder(localPrefix)
              }}
            >
              Rename in current order…
            </button>
            <div className="fab-menu__divider" />
            <button
              className="fab-menu__confirm"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
              onClick={() => { setOpen(false); openRandomizeModal() }}
            >
              Shuffle order…
            </button>
          </div>
        </>
      )}

      <button
        className={`fab ${open ? 'fab--open' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        Rename Files
      </button>
    </div>
  )
}
