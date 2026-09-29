import { cn } from '@/shared/ui'

// Overrides the editorial Input look with this form's rounded, theme-var style.
// Direction is forced RTL even on dir="ltr" inputs, matching the original layout.
export function inputClass(hasError: boolean) {
  return cn(
    'appearance-none rounded-[12px] border-(--q-input-border) bg-(--q-input-bg) px-4 py-3.5 text-[16px] leading-normal',
    'text-(--q-text) shadow-(--q-input-shadow) transition-[border-color] duration-200 [direction:rtl]',
    'placeholder:text-(--q-placeholder) focus:border-brand/50',
    hasError && 'border-(--q-error-border)',
  )
}

export const GRADIENT_CTA = 'bg-linear-135/srgb from-brand to-brand-violet text-white font-bold'
