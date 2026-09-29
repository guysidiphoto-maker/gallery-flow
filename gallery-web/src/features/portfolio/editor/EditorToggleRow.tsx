import { cn } from '@/shared/ui'

/** Label + accent-colored switch; the whole row toggles. */
export function EditorToggleRow({ label, description, checked, onToggle }: {
  label: string
  description?: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="flex cursor-pointer items-center justify-between rounded-lg px-1 py-2.5 transition-colors duration-150 hover:bg-white/2"
    >
      <div>
        <div className="text-[13px] font-medium text-white/70">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-white/50">{description}</div>}
      </div>
      {/* Switch is always LTR so "on" sits left regardless of page direction. */}
      <div
        dir="ltr"
        className={cn(
          'flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-[13px] p-[3px] transition-all duration-250',
          checked
            ? 'justify-start bg-(color:--accent) shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_14.5%,transparent)]'
            : 'justify-end border border-white/6 bg-white/8',
        )}
      >
        <div className="size-5 rounded-full bg-white shadow-[0_1px_4px_rgb(0_0_0/0.25)] transition-all duration-250" />
      </div>
    </div>
  )
}
