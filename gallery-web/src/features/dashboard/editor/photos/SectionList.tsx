import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { textMuted, textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'
import { SectionRow } from './SectionRow'

// Editor sidebar "Photos" block: the sets list with drag-reorder + Add Set.
export function SectionList() {
  const { session, sections: sec } = useEditor()
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [sectionDragOverId, setSectionDragOverId] = useState<string | null>(null)

  return (
    <div style={{ padding: '20px 18px 12px' }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, paddingInline: 4,
      }}>
        <span>Photos</span>
        <button onClick={() => sec.setShowAddSetModal(true)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: textPrimary, padding: 0, display: 'inline-flex',
          alignItems: 'center', gap: 4, fontFamily: 'inherit',
          fontSize: 9, fontWeight: 500, letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}>
          <Icon name="plus" size={11} strokeWidth={2} />
          <span>Add Set</span>
        </button>
      </div>

      {session.sections.map(s => (
        <SectionRow
          key={s.id}
          section={s}
          draggedSectionId={draggedSectionId}
          setDraggedSectionId={setDraggedSectionId}
          sectionDragOverId={sectionDragOverId}
          setSectionDragOverId={setSectionDragOverId}
        />
      ))}
    </div>
  )
}
