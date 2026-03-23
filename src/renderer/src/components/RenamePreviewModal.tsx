import React from 'react'
import { useGallery } from '../store/gallery'

export function RenamePreviewModal() {
  const {
    showRenamePreview,
    renamePreviewMode,
    pendingBatchRename,
    images,
    confirmApplyOrder,
    cancelApplyOrder
  } = useGallery()

  if (!showRenamePreview || !pendingBatchRename) return null

  const imgById = new Map(images.map(img => [img.path, img]))
  const changes = pendingBatchRename.filter(op => {
    const img = imgById.get(op.oldPath)
    return img && img.filename !== op.newFilename
  })

  const isRandomize = renamePreviewMode === 'randomize'

  return (
    <div className="modal-backdrop">
      <div className="modal modal--large">
        <div className="modal__header">
          <h2>{isRandomize ? 'Randomize Order' : 'Preview Rename'}</h2>
          <p className="modal__subtitle">
            {isRandomize
              ? `${changes.length} file${changes.length !== 1 ? 's' : ''} will be shuffled and renamed. This operation can be undone.`
              : `${changes.length} file${changes.length !== 1 ? 's' : ''} will be renamed. This operation can be undone.`
            }
          </p>
        </div>

        <div className="modal__body">
          <div className="rename-preview-list">
            <div className="rename-preview-list__header">
              <span>Current filename</span>
              <span>New filename</span>
            </div>
            {changes.map((op, i) => {
              const img = imgById.get(op.oldPath)
              return (
                <div key={i} className="rename-preview-list__row">
                  <span className="rename-preview-list__old" title={op.oldPath}>
                    {img?.filename ?? op.oldPath.split('/').pop()}
                  </span>
                  <span className="rename-preview-list__arrow">→</span>
                  <span className="rename-preview-list__new">
                    {op.newFilename}
                  </span>
                </div>
              )
            })}
          </div>

          {changes.length === 0 && (
            <div className="rename-preview-list__empty">
              No changes needed — filenames already match the current order.
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={cancelApplyOrder}>
            Cancel
          </button>
          <button
            className="btn btn--accent"
            onClick={confirmApplyOrder}
            disabled={changes.length === 0}
          >
            {isRandomize
              ? `Shuffle & Rename ${changes.length} File${changes.length !== 1 ? 's' : ''}`
              : `Apply ${changes.length} Rename${changes.length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  )
}
