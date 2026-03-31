import React, { useEffect, useRef, useState } from 'react'
import { useGallery } from '../store/gallery'

export function TopPicksTray() {
  const { images, topPickIds, closeTopPicksTray, openViewer, selectImage, toggleTopPick } = useGallery()
  const [visible, setVisible] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const picks = images.filter(img => topPickIds.has(img.id))

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(closeTopPicksTray, 200)
  }

  return (
    <div className={`picks-tray ${visible ? 'picks-tray--visible' : ''}`}>
      <div className="picks-tray__header">
        <div className="picks-tray__title">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Top Picks
          <span className="picks-tray__count">{picks.length}</span>
        </div>
        <button className="picks-tray__close" onClick={handleClose} title="Close (T)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="picks-tray__scroll" ref={scrollRef}>
        {picks.length === 0 ? (
          <div className="picks-tray__empty">No top picks yet — select images and press T</div>
        ) : (
          picks.map((img, i) => (
            <PickThumb
              key={img.id}
              img={img}
              index={i}
              onOpen={() => { selectImage(img.id, false); openViewer(img.id) }}
              onRemove={() => toggleTopPick(img.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function PickThumb({
  img, index, onOpen, onRemove
}: {
  img: { id: string; path: string; filename: string }
  index: number
  onOpen: () => void
  onRemove: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.readFileBuffer(img.path).then(buf => {
      if (!buf || cancelled) return
      const blob = new Blob([buf])
      const url = URL.createObjectURL(blob)
      setSrc(url)
      return () => URL.revokeObjectURL(url)
    })
    return () => { cancelled = true }
  }, [img.path])

  return (
    <div className="picks-tray__thumb" style={{ animationDelay: `${index * 30}ms` }}>
      <div className="picks-tray__img-wrap" onClick={onOpen}>
        {src
          ? <img src={src} alt={img.filename} draggable={false} />
          : <div className="picks-tray__placeholder" />
        }
        <div className="picks-tray__num">{index + 1}</div>
      </div>
      <button
        className="picks-tray__remove"
        onClick={onRemove}
        title="Remove from picks"
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
