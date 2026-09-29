import { summarizePreset, type GalleryPreset } from '@/shared/gallery/galleryPresets'
import { cn } from '@/shared/ui'
import { useEditor } from '../EditorContext'

const iconBtn = 'cursor-pointer rounded-hair border border-line bg-transparent px-2.5 py-[7px] text-[11px]'

export function PresetRow({ preset: p }: { preset: GalleryPreset }) {
  const { presets: { presetBusy, handleApplyPreset, handleSetDefaultPreset, handleRenamePreset, handleDeletePreset } } = useEditor()
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-hair border border-line bg-raised px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-ink">{p.name}</span>
          {p.is_default && (
            <span className="rounded-[10px] bg-success/12 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] text-success uppercase">
              ברירת מחדל
            </span>
          )}
        </div>
        <div className="mt-[3px] truncate text-[11px] text-muted">
          {summarizePreset(p).join(' · ') || 'ללא הגדרות'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button disabled={presetBusy} onClick={() => handleApplyPreset(p)} className={cn(
          'rounded-hair border border-ink bg-ink px-3 py-[7px] text-[11px] font-medium text-white',
          presetBusy ? 'cursor-default opacity-50' : 'cursor-pointer',
        )}>החל</button>
        {!p.is_default && (
          <button disabled={presetBusy} onClick={() => handleSetDefaultPreset(p)} aria-label="הגדר כברירת מחדל" title="הגדר כברירת מחדל"
            className={cn(iconBtn, 'text-ink')}>★</button>
        )}
        <button disabled={presetBusy} onClick={() => handleRenamePreset(p)} aria-label="שנה שם" title="שנה שם"
          className={cn(iconBtn, 'text-ink')}>✎</button>
        <button disabled={presetBusy} onClick={() => handleDeletePreset(p)} aria-label="מחק" title="מחק"
          className={cn(iconBtn, 'text-danger-strong')}>✕</button>
      </div>
    </div>
  )
}
