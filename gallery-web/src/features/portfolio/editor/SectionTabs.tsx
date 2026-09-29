import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import type { EditorSection } from './options'
import { icons } from './icons'

const SECTIONS: { key: EditorSection; label: string; icon: ReactNode }[] = [
  { key: 'brand', label: 'מיתוג', icon: icons.brand },
  { key: 'design', label: 'עיצוב', icon: icons.design },
  { key: 'content', label: 'תוכן', icon: icons.layout },
  { key: 'contact', label: 'קשר', icon: icons.phone },
]

export function SectionTabs({ active, onChange }: { active: EditorSection; onChange: (s: EditorSection) => void }) {
  return (
    <div className="mb-5 flex gap-[3px] rounded-xl border border-white/5 bg-black/35 p-[3px]">
      {SECTIONS.map(s => {
        const on = active === s.key
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-[7px] rounded-[9px] border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all duration-200',
              on ? 'border-(color:--accent)/[19%] bg-(color:--accent)/[9.4%] text-white' : 'border-transparent text-white/35',
            )}
          >
            <span className={cn('transition-opacity duration-200', on ? 'opacity-100' : 'opacity-50')}>{s.icon}</span>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
