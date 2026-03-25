import React, { useEffect, useRef, useState } from 'react'
import { useGallery } from '../store/gallery'
import { generateSequentialNames } from '../utils/naming'
import type { ImageFile } from '../types'

type RandomizeMode = 'all' | 'picks-only'

function fisherYates(arr: ImageFile[]): ImageFile[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildShuffled(images: ImageFile[], topPickIds: Set<string>, mode: RandomizeMode): ImageFile[] {
  if (mode === 'all') {
    return fisherYates(images)
  }
  const picks = images.filter(img => topPickIds.has(img.id))
  const nonPicks = images.filter(img => !topPickIds.has(img.id))
  return [...picks, ...fisherYates(nonPicks)]
}

export function RandomizeModal() {
  const {
    showRandomizeModal,
    images,
    topPickIds,
    filenamePrefix,
    closeRandomizeModal,
    executeRandomize
  } = useGallery()

  const [mode, setMode] = useState<RandomizeMode>('all')
  const [shuffled, setShuffled] = useState<ImageFile[]>([])
  const [isExecuting, setIsExecuting] = useState(false)

  // Snapshot images/topPickIds at open time so mode-switch doesn't re-read changing store
  const snapshotRef = useRef<{ images: ImageFile[]; topPickIds: Set<string> } | null>(null)

  useEffect(() => {
    if (showRandomizeModal) {
      snapshotRef.current = { images: [...images], topPickIds: new Set(topPickIds) }
      setMode('all')
      setIsExecuting(false)
    } else {
      snapshotRef.current = null
    }
  }, [showRandomizeModal])

  // Recompute shuffle when mode changes (using snapshot)
  useEffect(() => {
    const snap = snapshotRef.current
    if (!snap || !showRandomizeModal) return
    setShuffled(buildShuffled(snap.images, snap.topPickIds, mode))
  }, [mode, showRandomizeModal])

  if (!showRandomizeModal) return null

  const snap = snapshotRef.current
  const hasTopPicks = snap ? snap.topPickIds.size > 0 : topPickIds.size > 0

  const ops = generateSequentialNames(shuffled, filenamePrefix)
  const opsMap = new Map(ops.map(op => [op.oldPath, op.newFilename]))

  const changes = shuffled.filter(img => opsMap.get(img.path) !== img.filename)

  const handleConfirm = async () => {
    setIsExecuting(true)
    await executeRandomize(shuffled, mode)
    setIsExecuting(false)
  }

  const confirmLabel = mode === 'all'
    ? `Shuffle All and Rename (${changes.length})`
    : `Shuffle Non Top Picks and Rename (${changes.length})`

  return (
    <div className="modal-backdrop">
      <div className="modal modal--large">
        <div className="modal__header">
          <h2>Randomize Order</h2>
          <p className="modal__subtitle">
            {changes.length} file{changes.length !== 1 ? 's' : ''} will be renamed. This operation can be undone.
          </p>
        </div>

        <div className="modal__body">
          {/* Mode selector */}
          <div className="randomize-modes">
            <label className={`randomize-mode${mode === 'all' ? ' randomize-mode--active' : ''}`}>
              <input
                type="radio"
                name="randomize-mode"
                value="all"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <div className="randomize-mode__content">
                <span className="randomize-mode__title">Shuffle All Images</span>
                <span className="randomize-mode__desc">Randomize the entire gallery and rename everything.</span>
              </div>
            </label>

            <label className={`randomize-mode${mode === 'picks-only' ? ' randomize-mode--active' : ''}${!hasTopPicks ? ' randomize-mode--disabled' : ''}`}>
              <input
                type="radio"
                name="randomize-mode"
                value="picks-only"
                checked={mode === 'picks-only'}
                onChange={() => setMode('picks-only')}
                disabled={!hasTopPicks}
              />
              <div className="randomize-mode__content">
                <span className="randomize-mode__title">Shuffle Only Non Top Picks</span>
                <span className="randomize-mode__desc">
                  {hasTopPicks
                    ? 'Keep Top Picks fixed at the top. Randomize only the rest.'
                    : 'No Top Picks selected — mark some images with T first.'}
                </span>
              </div>
            </label>
          </div>

          {/* Preview table */}
          <div className="rename-preview-list">
            <div className="rename-preview-list__header">
              <span>Current filename</span>
              <span>New filename</span>
            </div>
            {shuffled.map((img) => {
              const newFilename = opsMap.get(img.path) ?? img.filename
              const changed = newFilename !== img.filename
              const isFixed = mode === 'picks-only' && snap && snap.topPickIds.has(img.id)
              return (
                <div
                  key={img.id}
                  className={`rename-preview-list__row${mode === 'picks-only' ? ' rename-preview-list__row--with-badge' : ''}${isFixed ? ' rename-preview-list__row--fixed' : ''}`}
                >
                  <span className="rename-preview-list__old" title={img.path}>
                    {img.filename}
                  </span>
                  <span className="rename-preview-list__arrow">→</span>
                  <span className="rename-preview-list__new">
                    {changed ? newFilename : <span className="rename-preview-list__unchanged">{newFilename}</span>}
                  </span>
                  {mode === 'picks-only' && (
                    <span className={`randomize-badge${isFixed ? ' randomize-badge--fixed' : ' randomize-badge--shuffled'}`}>
                      {isFixed ? 'Fixed' : 'Shuffled'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={closeRandomizeModal} disabled={isExecuting}>
            Cancel
          </button>
          <button
            className="btn btn--accent"
            onClick={handleConfirm}
            disabled={changes.length === 0 || isExecuting}
          >
            {isExecuting ? 'Shuffling…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
