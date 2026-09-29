import { supabase } from '@/shared/lib/supabase'
import { Icon } from '@/shared/ui/Icon'
import { StoryStudioLauncher } from '@/features/story-studio/StoryStudioLauncher'
import { textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'
import { STORY_GENERATE_MIN_PHOTOS } from './useStoryGeneration'

// CTA cluster: auto-generate (headline feature) sits left of the manual upload.
export function StoryActions() {
  const { session, stories, storyGen } = useEditor()
  const { editingGallery, galleryImages } = session
  const { storyUploading, storyFileInputRef, handleStoryUpload } = stories
  const { storyGenerating, studioData, setStudioData } = storyGen

  return (
    <>
      <input
        ref={storyFileInputRef}
        type="file"
        accept="video/mp4"
        style={{ display: 'none' }}
        onChange={(e) => handleStoryUpload(e.target.files)}
      />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        {/* Gated: a story from a handful of photos looks like a slideshow. */}
        {galleryImages.length >= STORY_GENERATE_MIN_PHOTOS && (
          <button
            onClick={storyGen.openGenerateModal}
            disabled={storyGenerating || storyUploading}
            style={{
              padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
              background: 'transparent', border: `1px solid ${textPrimary}`,
              color: textPrimary,
              cursor: storyGenerating ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: storyGenerating ? 0.6 : 1,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Icon name="stories" size={13} strokeWidth={2} />
            צור סטורי אוטומטית
          </button>
        )}
        {editingGallery && galleryImages.length >= STORY_GENERATE_MIN_PHOTOS && (
          <button
            onClick={() => { void storyGen.openStudio() }}
            style={{
              padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
              background: textPrimary, border: `1px solid ${textPrimary}`, color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.18em',
              textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Icon name="stories" size={13} strokeWidth={2} />
            Story Studio
          </button>
        )}
        {studioData && editingGallery && (
          <StoryStudioLauncher
            galleryId={editingGallery.id}
            images={studioData.images}
            brand={studioData.brand}
            event={studioData.event}
            getToken={async () => (await supabase.auth.getSession()).data.session?.access_token ?? null}
            onClose={() => setStudioData(null)}
          />
        )}
        <button
          onClick={() => storyFileInputRef.current?.click()}
          disabled={storyUploading}
          style={{
            padding: '10px 20px', borderRadius: 2, fontSize: 11, fontWeight: 500,
            background: textPrimary, border: `1px solid ${textPrimary}`,
            color: '#fff', cursor: storyUploading ? 'wait' : 'pointer',
            fontFamily: 'inherit', opacity: storyUploading ? 0.6 : 1,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="plus" size={13} strokeWidth={2} />
          העלאת סטורי
        </button>
      </div>
    </>
  )
}
