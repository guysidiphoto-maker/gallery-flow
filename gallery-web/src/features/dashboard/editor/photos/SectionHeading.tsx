import { cn } from '@/shared/ui'
import { sectionImages } from '../../lib/photoOrder'
import { useEditor } from '../EditorContext'

// Active section title + count, with an inline-editable description (shown to
// the client under the chapter heading).
export function SectionHeading() {
  const { session, sections: sec } = useEditor()
  const { sections, activeSectionId, galleryImages } = session
  const { editingSectionDescId, setEditingSectionDescId, sectionDescDraft, setSectionDescDraft, saveSectionDescription } = sec
  const activeSec = activeSectionId ? sections.find(s => s.id === activeSectionId) : null
  const visibleImages = sectionImages(galleryImages, activeSectionId)
  const editingDesc = activeSec && editingSectionDescId === activeSec.id

  return (
    <div className="min-w-0 flex-1">
      <h3 className="m-0 text-[22px] font-medium tracking-[-0.015em] text-ink">
        {activeSec ? activeSec.name : 'תמונות'}
        <span className="ms-3 text-[14px] font-normal text-muted">
          {visibleImages.length}
        </span>
      </h3>
      {activeSec && (editingDesc ? (
        <textarea
          autoFocus
          value={sectionDescDraft}
          onChange={e => setSectionDescDraft(e.target.value)}
          onBlur={() => {
            void saveSectionDescription(activeSec.id, sectionDescDraft)
            setEditingSectionDescId(null)
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setEditingSectionDescId(null); return }
            // Cmd/Ctrl+Enter commits (plain Enter inserts newline).
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur()
          }}
          placeholder="תיאור לסקשן (מוצג ללקוח מתחת לכותרת הפרק)"
          rows={2}
          maxLength={500}
          className="mt-2 w-full max-w-[560px] resize-y rounded-hair border border-line bg-raised px-2.5 py-2 text-[13px] leading-[1.45] text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setSectionDescDraft(activeSec.description ?? '')
            setEditingSectionDescId(activeSec.id)
          }}
          className={cn(
            'mt-1.5 block max-w-[560px] cursor-text bg-transparent p-0 text-right text-[13px] leading-[1.45]',
            activeSec.description ? 'text-ink-soft' : 'text-muted',
          )}
        >
          {activeSec.description || '+ הוסף תיאור לסקשן'}
        </button>
      ))}
    </div>
  )
}
