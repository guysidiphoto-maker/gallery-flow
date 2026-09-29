import type { ReactNode } from 'react'
import { cn } from '@/shared/ui'
import { inputClass } from './classes'

/** Labeled text input with a leading accent icon. */
export function EditorInput({ label, value, placeholder, onChange, icon }: {
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  icon: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-[5px] text-[11.5px] font-semibold text-white/70">{label}</div>
      <div className="relative">
        <span className="pointer-events-none absolute start-3 top-1/2 flex -translate-y-1/2 items-center text-(color:--accent) opacity-50">
          {icon}
        </span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClass, 'ps-[38px]')}
        />
      </div>
    </div>
  )
}
