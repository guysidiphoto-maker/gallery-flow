import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { useEditor } from '../EditorContext'

const barButton =
  'cursor-pointer rounded-hair border border-white/40 bg-transparent px-3 py-1.5 text-[11px] tracking-[0.14em] text-white uppercase'

// Sticky select-mode toolbar. Wraps on narrow viewports so the trailing
// controls are never pushed off-screen.
export function BulkActionsBar() {
  const { session, photos } = useEditor()
  const { sections, activeSectionId } = session
  const {
    selectedImageIds, selectAllImages, bulkToggleTopPick, bulkMoveToSection,
    bulkDownloadSelected, bulkDeleteSelected, exitSelectMode,
  } = photos
  // Only other sets are useful move destinations.
  const otherSections = sections.filter(s => s.id !== activeSectionId)

  return (
    <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 bg-ink px-4 py-2.5 text-[12px] text-white">
      <span className="font-medium tracking-[0.04em]">
        {selectedImageIds.size} {selectedImageIds.size === 1 ? 'תמונה נבחרה' : 'תמונות נבחרו'}
      </span>
      <button onClick={selectAllImages} className={cn(barButton, 'ms-auto')}>בחר הכל</button>
      <button onClick={() => bulkToggleTopPick(true)} className={cn(barButton, 'flex items-center gap-1')}>★ Pin</button>
      <button onClick={() => bulkToggleTopPick(false)} className={barButton}>Unpin</button>
      {otherSections.length > 0 && (
        <select
          aria-label="העבר לסט"
          value=""
          onChange={(e) => { if (e.target.value) void bulkMoveToSection(e.target.value) }}
          className="cursor-pointer rounded-hair border border-white/40 bg-transparent px-2.5 py-1.5 text-[11px] tracking-[0.08em] text-white"
        >
          <option value="" className="text-ink">העבר לסט…</option>
          {otherSections.map(s => (
            <option key={s.id} value={s.id} className="text-ink">{s.name}</option>
          ))}
        </select>
      )}
      <button onClick={() => void bulkDownloadSelected()} className={barButton}>Download</button>
      <button
        onClick={bulkDeleteSelected}
        className={cn(barButton, 'border-danger-strong bg-danger-strong font-medium')}
      >Delete</button>
      <button onClick={exitSelectMode} aria-label="Cancel" className="flex cursor-pointer items-center bg-transparent px-2 py-1.5 text-white">
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
