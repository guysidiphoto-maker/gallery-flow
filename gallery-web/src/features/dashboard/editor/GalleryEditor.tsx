import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { useEditor } from './EditorContext'
import { EditorHeader } from './EditorHeader'
import { EditorSidebar } from './EditorSidebar'
import { PhotosTab } from './photos/PhotosTab'
import { AddSetModal } from './photos/AddSetModal'
import { StoriesTab } from './stories/StoriesTab'
import { ActivityTab } from './activity/ActivityTab'
import { SettingsTab } from './settings/SettingsTab'
import { DesignTab } from './design/DesignTab'
import './editor.css'

// Full-screen editor dialog for the open gallery: header, sidebar (cover
// preview, tab strip, sets) and the active tab's pane.
export function GalleryEditor() {
  const { session, sections } = useEditor()
  const { editTab, setEditingGallery } = session
  const close = () => setEditingGallery(null)
  const dialogRef = useFocusTrap<HTMLDivElement>(true, close)

  return (
    <div
      className="fixed inset-0 z-[1000] flex animate-[fade-in_.2s_ease_both] items-stretch justify-center bg-ink/55 backdrop-blur-[6px]"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-editor-heading"
        className="dash-editor-modal m-4 flex h-[calc(100vh-32px)] max-h-[920px] w-[calc(100vw-32px)] max-w-[1440px] animate-[editor-modal-in_.3s_ease_both] flex-col overflow-hidden rounded-[4px] border border-line bg-canvas"
        onClick={e => e.stopPropagation()}
      >
        <EditorHeader />

        {/* Below 900px `.dash-editor-body` stacks the sidebar above the pane. */}
        <div className="dash-editor-body flex min-h-0 flex-1">
          <EditorSidebar />
          <div className="flex min-w-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
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
