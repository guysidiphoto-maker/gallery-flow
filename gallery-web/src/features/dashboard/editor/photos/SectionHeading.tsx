import { border, textMuted, textPrimary, textSecondary } from '../../styles'
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
    <div style={{ minWidth: 0, flex: 1 }}>
      <h3 style={{
        fontSize: 22, fontWeight: 500, margin: 0,
        letterSpacing: '-0.015em', color: textPrimary,
      }}>
        {activeSec ? activeSec.name : 'תמונות'}
        <span style={{
          marginInlineStart: 12, color: textMuted,
          fontSize: 14, fontWeight: 400,
        }}>
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
          style={{
            marginTop: 8, width: '100%', maxWidth: 560,
            padding: '8px 10px', borderRadius: 2,
            border: `1px solid ${border}`, background: '#fff',
            color: textPrimary, fontSize: 13, lineHeight: 1.45,
            fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setSectionDescDraft(activeSec.description ?? '')
            setEditingSectionDescId(activeSec.id)
          }}
          style={{
            display: 'block', marginTop: 6,
            padding: 0, background: 'transparent', border: 'none',
            textAlign: 'right' as const, cursor: 'text',
            color: activeSec.description ? textSecondary : textMuted,
            fontSize: 13, lineHeight: 1.45, fontFamily: 'inherit',
            maxWidth: 560,
          }}
        >
          {activeSec.description || '+ הוסף תיאור לסקשן'}
        </button>
      ))}
    </div>
  )
}
