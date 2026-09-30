import { supabase } from '@/shared/lib/supabase'
import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { StoryStudioLauncher } from '@/features/story-studio/StoryStudioLauncher'
import { useEditor } from '../EditorContext'
import { STORY_GENERATE_MIN_PHOTOS } from './useStoryGeneration'

const ctaButton = 'inline-flex items-center gap-2 rounded-hair border border-ink px-5 py-2.5 text-[11px] font-medium tracking-label uppercase'

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
        className="hidden"
        onChange={(e) => {
          // Copy, then reset so re-picking the same file after a failure still fires.
          const files = e.target.files ? Array.from(e.target.files) : null
          e.target.value = ''
          void handleStoryUpload(files)
        }}
      />
      <div className="inline-flex items-center gap-2.5">
        {/* Gated: a story from a handful of photos looks like a slideshow. */}
        {galleryImages.length >= STORY_GENERATE_MIN_PHOTOS && (
          <button
            onClick={storyGen.openGenerateModal}
            disabled={storyGenerating || storyUploading}
            className={cn(
              ctaButton, 'bg-transparent text-ink',
              storyGenerating ? 'cursor-wait opacity-60' : 'cursor-pointer',
            )}
          >
            <Icon name="stories" size={13} strokeWidth={2} />
            צור סטורי אוטומטית
          </button>
        )}
        {editingGallery && galleryImages.length >= STORY_GENERATE_MIN_PHOTOS && (
          <button
            onClick={() => { void storyGen.openStudio() }}
            className={cn(ctaButton, 'cursor-pointer bg-ink text-white')}
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
          className={cn(
            ctaButton, 'bg-ink text-white',
            storyUploading ? 'cursor-wait opacity-60' : 'cursor-pointer',
          )}
        >
          <Icon name="plus" size={13} strokeWidth={2} />
          העלאת סטורי
        </button>
      </div>
    </>
  )
}
