import { Icon } from '@/shared/ui/Icon'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { cn } from '@/shared/ui'
import { useEditor } from '../EditorContext'
import '../editor.css'

const field = 'w-full rounded-hair border border-line bg-raised px-3.5 py-3 text-[14px] text-ink outline-none'
const label = 'mb-2 block text-[13px] font-medium text-ink'

// "New Photo Set" dialog: name + optional description shown to clients.
export function AddSetModal() {
  const { sections: sec } = useEditor()
  const { newSectionName, setNewSectionName, newSectionDesc, setNewSectionDesc, setShowAddSetModal, addSection } = sec
  const dialogRef = useFocusTrap<HTMLDivElement>(true, () => setShowAddSetModal(false))

  return (
    <div
      onClick={() => setShowAddSetModal(false)}
      className="fixed inset-0 z-[1100] flex animate-[fade-in_.2s_ease_both] items-center justify-center bg-ink/55 backdrop-blur-[6px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-set-heading"
        onClick={e => e.stopPropagation()}
        className="dash-mobile-modal w-[calc(100vw-40px)] max-w-[480px] animate-[editor-modal-in_.25s_ease_both] border border-line bg-raised px-10 pt-10 pb-8"
      >
        <div className="mb-7 flex items-center justify-between">
          <h3 id="add-set-heading" className="m-0 text-[12px] font-medium tracking-wide-label text-ink uppercase">New Photo Set</h3>
          <button
            onClick={() => setShowAddSetModal(false)}
            aria-label="Close"
            className="flex cursor-pointer bg-transparent p-1 text-ink-soft"
          >
            <Icon name="close" size={16} strokeWidth={1.85} />
          </button>
        </div>

        <label className="mb-6 block">
          <span className={label}>Photo Set Name</span>
          <input
            autoFocus
            type="text"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newSectionName.trim()) addSection() }}
            placeholder="לדוגמה: טקס, קבלת פנים, הכנות"
            className={field}
          />
        </label>

        <label className="mb-7 block">
          <span className={label}>Description</span>
          <textarea
            value={newSectionDesc}
            onChange={(e) => setNewSectionDesc(e.target.value.slice(0, 500))}
            placeholder="אופציונלי"
            rows={4}
            className={cn(field, 'resize-y')}
          />
          <div className="mt-1.5 text-[11px] tracking-[0.04em] text-muted">{newSectionDesc.length} / 500</div>
        </label>

        <p className="mb-6 text-[12px] leading-normal text-ink-soft">
          התיאור מוצג ללקוחות שלך כשהם רואים את הקטע הזה — מצוין לסטוריטלינג.
        </p>

        <div className="dash-modal-actions flex justify-end gap-2.5">
          <button
            onClick={() => setShowAddSetModal(false)}
            className="rounded-hair border py-2.5 text-[11px] font-medium tracking-label uppercase cursor-pointer border-line bg-transparent px-[22px] text-ink"
          >Cancel</button>
          <button
            onClick={addSection}
            disabled={!newSectionName.trim()}
            className={cn(
              'rounded-hair border py-2.5 text-[11px] font-medium tracking-label uppercase px-7 text-white',
              newSectionName.trim() ? 'cursor-pointer border-ink bg-ink' : 'cursor-not-allowed border-line bg-line',
            )}
          >Save</button>
        </div>
      </div>
    </div>
  )
}
