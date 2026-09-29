import { Eyebrow, cn } from '@/shared/ui'
import { useEditor } from '../EditorContext'
import { CoverSubTab } from './CoverSubTab'
import { TypographySubTab } from './TypographySubTab'
import { ColorSubTab } from './ColorSubTab'
import { GridSubTab } from './GridSubTab'

const SUB_TABS = [
  { id: 'cover' as const, label: 'שער' },
  { id: 'type'  as const, label: 'טיפוגרפיה' },
  { id: 'color' as const, label: 'צבע' },
  { id: 'grid'  as const, label: 'רשת' },
]

// Design settings write delivery_settings JSONB, so they need no schema change.
export function DesignTab() {
  const { session: { designSubTab, setDesignSubTab } } = useEditor()
  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <Eyebrow className="mb-2.5 block">עיצוב</Eyebrow>
        <h3 className="text-[22px] font-medium tracking-[-0.015em] text-ink">עיצוב הגלריה</h3>
      </div>

      <div className="mb-7 flex overflow-x-auto border-b border-line">
        {SUB_TABS.map(t => {
          const active = designSubTab === t.id
          return (
            <button key={t.id} onClick={() => setDesignSubTab(t.id)}
              className={cn(
                '-mb-px shrink-0 border-b-2 bg-transparent px-[22px] py-3.5 text-[13px] font-medium transition-colors duration-150',
                active ? 'border-ink text-ink' : 'border-transparent text-muted',
              )}>
              {t.label}
            </button>
          )
        })}
      </div>

      {designSubTab === 'cover' && <CoverSubTab />}
      {designSubTab === 'type' && <TypographySubTab />}
      {designSubTab === 'color' && <ColorSubTab />}
      {designSubTab === 'grid' && <GridSubTab />}
    </div>
  )
}
