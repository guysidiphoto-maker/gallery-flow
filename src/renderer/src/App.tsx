import React, { useEffect } from 'react'
import { useGallery } from './store/gallery'
import { useSections } from './store/sections'
import { Toolbar } from './components/Toolbar'
import { GalleryGrid } from './components/GalleryGrid'
import { PreviewMode } from './components/PreviewMode'
import { RenamePreviewModal } from './components/RenamePreviewModal'
import { DuplicatesPanel } from './components/DuplicatesPanel'
import { ToastStack } from './components/ToastStack'
import { StoryModal } from './components/StoryModal'
import { ImageViewer } from './components/ImageViewer'
import { SocialMode } from './components/SocialMode'
import { SectionsPanel } from './components/SectionsPanel'
import { PublishModal } from './components/PublishModal'
import { GalleryDndProvider } from './components/GalleryDndProvider'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

export default function App() {
  const { showPreviewMode, showDuplicatesPanel, showStoryModal, isLoading, folderPath, reloadFolder } = useGallery()
  const { isPanelOpen: isSectionsPanelOpen, isPublishModalOpen, isPublishing, publishDone, publishError, resetForFolder } = useSections()

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

  // Reset sections when folder changes
  useEffect(() => {
    resetForFolder()
  }, [folderPath])

  return (
    <div className="app">
      <Toolbar />

      <GalleryDndProvider>
        <div className="app__content">
          {/* Sections sidebar */}
          {isSectionsPanelOpen && <SectionsPanel />}

          {/* Main gallery or empty state */}
          <div className={`app__main ${isSectionsPanelOpen ? 'app__main--sections-open' : ''} ${showDuplicatesPanel ? 'app__main--sidebar-open' : ''}`}>
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
      </GalleryDndProvider>

      {/* Overlays */}
      {showPreviewMode && <PreviewMode />}
      {showStoryModal && <StoryModal />}
      <ImageViewer />
      <SocialMode />
      <RenamePreviewModal />
      {(isPublishModalOpen || isPublishing || publishDone || !!publishError) && <PublishModal />}
      <ToastStack />
    </div>
  )
}
