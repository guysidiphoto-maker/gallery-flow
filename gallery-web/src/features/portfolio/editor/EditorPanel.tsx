import type { ReactNode } from 'react'

/** Titled card inside the dark editor, with an accent-tinted icon chip. */
export function EditorPanel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/2 px-5 py-[18px] transition-[border-color] duration-200">
      <div className="mb-3.5 flex items-center gap-2 text-[12.5px] font-bold text-white/80">
        {icon && (
          <div className="flex size-6 items-center justify-center rounded-md bg-(color:--accent)/[6%] text-(color:--accent)">
            {icon}
          </div>
        )}
        {title}
      </div>
      {children}
    </div>
  )
}
