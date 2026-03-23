import React, { useEffect } from 'react'
import { useGallery } from './store/gallery'
import { Toolbar } from './components/Toolbar'
import { GalleryGrid } from './components/GalleryGrid'
import { PreviewMode } from './components/PreviewMode'
import { RenamePreviewModal } from './components/RenamePreviewModal'
import { DuplicatesPanel } from './components/DuplicatesPanel'
import { ToastStack } from './components/ToastStack'
import { StoryModal } from './components/StoryModal'
import { ImageViewer } from './components/ImageViewer'
import { SocialMode } from './components/SocialMode'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App() {
  const { showPreviewMode, showDuplicatesPanel, showStoryModal, isLoading, folderPath, reloadFolder } = useGallery()

  // Register keyboard shortcuts
  useKeyboardShortcuts()

  // Restore last folder on launch
  useEffect(() => {
    window.api.getPref('lastFolder').then(lastFolder => {
      if (typeof lastFolder === 'string' && lastFolder) {
        useGallery.setState({ folderPath: lastFolder })
        reloadFolder()
      }
    })
    window.api.getPref('thumbnailSize').then(size => {
      if (typeof size === 'number') {
        useGallery.setState({ thumbnailSize: size })
      }
    })
  }, [])

  return (
    <div className="app">
      <Toolbar />

      <div className="app__content">
        {/* Main gallery or empty state */}
        <div className={`app__main ${showDuplicatesPanel ? 'app__main--sidebar-open' : ''}`}>
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <span>Loading images…</span>
            </div>
          ) : (
            <div className="gallery-scroll">
              <GalleryGrid />
            </div>
          )}
        </div>

        {/* Duplicates sidebar */}
        {showDuplicatesPanel && <DuplicatesPanel />}
      </div>

      {/* Overlays */}
      {showPreviewMode && <PreviewMode />}
      {showStoryModal && <StoryModal />}
      <ImageViewer />
      <SocialMode />
      <RenamePreviewModal />
      <ToastStack />
    </div>
  )
}
