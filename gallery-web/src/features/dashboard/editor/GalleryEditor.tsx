import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { bg, border } from '../styles'
import { useEditor } from './EditorContext'
import { EditorHeader } from './EditorHeader'
import { EditorSidebar } from './EditorSidebar'
import { PhotosTab } from './photos/PhotosTab'
import { AddSetModal } from './photos/AddSetModal'
import { StoriesTab } from './stories/StoriesTab'
import { ActivityTab } from './activity/ActivityTab'
import { SettingsTab } from './settings/SettingsTab'
import { DesignTab } from './design/DesignTab'

// Full-screen editor dialog for the open gallery: header, sidebar (cover
// preview, tab strip, sets) and the active tab's pane.
export function GalleryEditor() {
  const { session, sections } = useEditor()
  const { editTab, setEditingGallery } = session
  const close = () => setEditingGallery(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(true, close)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      animation: 'overlayIn .2s ease both',
    }} onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-editor-heading"
        className="dash-editor-modal"
        style={{
          background: bg,
          width: 'calc(100vw - 32px)', maxWidth: 1440,
          height: 'calc(100vh - 32px)', maxHeight: 920,
          margin: '16px',
          borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          border: `1px solid ${border}`, animation: 'modalIn .3s ease both',
        }} onClick={e => e.stopPropagation()}>
        <EditorHeader />

        {/* Below 900px `.dash-editor-body` stacks the sidebar above the pane. */}
        <div className="dash-editor-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <EditorSidebar />
          <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '24px 32px', minWidth: 0,
            }}>
              {editTab === 'photos' && <PhotosTab />}
              {editTab === 'stories' && <StoriesTab />}
              {editTab === 'activities' && <ActivityTab />}
              {editTab === 'settings' && <SettingsTab />}
              {editTab === 'welcome' && <DesignTab />}
            </div>
          </div>
        </div>
      </div>

      {/* Nested in the overlay on purpose: its backdrop click also reaches the
          editor overlay, as before. */}
      {sections.showAddSetModal && <AddSetModal />}
    </div>
  )
}
