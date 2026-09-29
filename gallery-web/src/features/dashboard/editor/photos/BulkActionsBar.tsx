import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { useEditor } from '../EditorContext'

const barButton =
  'inline-flex h-8 cursor-pointer items-center gap-1 rounded-hair border border-white/40 bg-transparent px-3 text-[12px] text-white'

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
      <button onClick={() => bulkToggleTopPick(true)} className={barButton}>★ הוספה למועדפים</button>
      <button onClick={() => bulkToggleTopPick(false)} className={barButton}>הסרה מהמועדפים</button>
      {otherSections.length > 0 && (
        <select
          aria-label="העבר לסט"
          value=""
          onChange={(e) => { if (e.target.value) void bulkMoveToSection(e.target.value) }}
          className="h-8 cursor-pointer rounded-hair border border-white/40 bg-transparent px-2.5 text-[12px] text-white"
        >
          <option value="" className="text-ink">העבר לסט…</option>
          {otherSections.map(s => (
            <option key={s.id} value={s.id} className="text-ink">{s.name}</option>
          ))}
        </select>
      )}
      <button onClick={() => void bulkDownloadSelected()} className={barButton}>הורדה</button>
      <button
        onClick={bulkDeleteSelected}
        className={cn(barButton, 'border-danger-strong bg-danger-strong font-medium')}
      >מחיקה</button>
      <button onClick={exitSelectMode} aria-label="ביטול בחירה" title="ביטול בחירה" className="flex size-8 cursor-pointer items-center justify-center bg-transparent text-white">
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
