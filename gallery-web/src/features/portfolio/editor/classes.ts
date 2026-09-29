import { cn } from '@/shared/ui'

// `--accent` is the user-picked accent, set on the editor root. Opacity steps
// mirror the old hex-alpha suffixes (e.g. "12" ≈ 7%, "35" ≈ 21%).

export const inputClass =
  'w-full rounded-[10px] border-[1.5px] border-white/7 bg-black/30 px-3.5 py-[11px] text-[13px] text-white outline-none ' +
  '[direction:rtl] transition-[border-color,box-shadow] duration-200 placeholder:text-white/20 ' +
  'focus:border-(color:--accent)/[38%] focus:ring-3 focus:ring-(color:--accent)/[7%]'

export function smallButtonClass(danger = false) {
  return cn(
    'flex items-center gap-1.5 rounded-lg border bg-white/4 px-4 py-[7px] text-[11.5px] font-semibold transition-all duration-150',
    danger ? 'border-(color:--pe-danger)/15 text-(color:--pe-danger)' : 'border-white/8 text-white/60',
  )
}

/** Selectable option card (font, hero style, grid columns). */
export function optionClass(active: boolean) {
  return cn(
    'cursor-pointer rounded-xl font-semibold transition-all duration-200',
    active
      ? 'border-2 border-(color:--accent)/[21%] bg-(color:--accent)/[7%] text-white'
      : 'border-[1.5px] border-white/5 bg-white/2 text-white/35',
  )
}

export const accentGlow = {
  sm: 'shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_12.5%,transparent)]',
  md: 'shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_12.5%,transparent)]',
  lg: 'shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_12.5%,transparent)]',
}
