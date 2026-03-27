import React, { useState } from 'react'

interface Props {
  onClose: () => void
}

interface Slide {
  icon: React.ReactNode
  title: string
  subtitle: string
  tips: { keys?: string; text: string }[]
}

const slides: Slide[] = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    title: 'Welcome to GalleryFlow',
    subtitle: 'A fast, keyboard-driven photo editor for photographers. Here\'s everything you need to know in 4 steps.',
    tips: [
      { keys: '⌘O', text: 'Open a folder of images to get started' },
      { keys: '⌘A', text: 'Select all images — press again to deselect' },
      { keys: 'Esc', text: 'Clear selection at any time' },
    ]
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
    title: 'Navigate & Select',
    subtitle: 'Move through your gallery quickly with the keyboard. No need to touch the mouse.',
    tips: [
      { keys: '← → ↑ ↓', text: 'Move between images one by one or row by row' },
      { keys: 'Shift + Arrow', text: 'Extend selection to a range of images' },
      { keys: 'Shift + Click', text: 'Select a range from last selected to here' },
      { keys: '⌘ + Click', text: 'Toggle individual images in/out of selection' },
      { keys: 'Double-click', text: 'Open full-screen image viewer' },
    ]
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    title: 'Mark Your Top Picks',
    subtitle: 'Star your best shots with T. These become your selection for Story and Social export.',
    tips: [
      { keys: 'T', text: 'Mark image as Top Pick — selection auto-advances to next image' },
      { keys: 'Shift + T', text: 'Remove image from Top Picks' },
      { keys: '★ badge', text: 'Click the star on any image to toggle its pick status' },
      { text: 'Top Picks are shown with a gold border in the gallery' },
    ]
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: 'Export & Organise',
    subtitle: 'Rename files to match your curation order, create a story video, or export for Instagram.',
    tips: [
      { keys: '⌘ + Enter', text: 'Apply current order — renames files to 0001, 0002…' },
      { keys: '⌘S', text: 'Open Story Creator — make a 9:16 video from Top Picks' },
      { text: 'Social button — export Top Picks as 1080×1350 images for Instagram' },
      { text: 'Sections — group images into named collections and publish them to folders' },
    ]
  }
]

export function WelcomeModal({ onClose }: Props) {
  const [idx, setIdx] = useState(0)
  const slide = slides[idx]
  const isLast = idx === slides.length - 1

  return (
    <div className="modal-backdrop welcome-backdrop">
      <div className="modal welcome-modal">

        {/* Progress dots */}
        <div className="welcome-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`welcome-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}`}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>

        {/* Slide content */}
        <div className="welcome-body">
          <div className="welcome-icon">{slide.icon}</div>
          <h2 className="welcome-title">{slide.title}</h2>
          <p className="welcome-subtitle">{slide.subtitle}</p>

          <div className="welcome-tips">
            {slide.tips.map((tip, i) => (
              <div key={i} className="welcome-tip">
                {tip.keys && <kbd className="welcome-kbd">{tip.keys}</kbd>}
                <span className={tip.keys ? '' : 'welcome-tip--nokey'}>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="welcome-footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Skip
          </button>
          <div className="welcome-footer__right">
            {idx > 0 && (
              <button className="btn btn--ghost" onClick={() => setIdx(i => i - 1)}>
                ← Back
              </button>
            )}
            <button
              className="btn btn--accent welcome-next"
              onClick={() => isLast ? onClose() : setIdx(i => i + 1)}
            >
              {isLast ? "Let's go →" : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
