import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must know our custom token names to dedupe conflicts correctly.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['eyebrow'],
      radius: ['hair'],
      shadow: ['soft', 'card', 'pop'],
      font: ['display', 'serif', 'gallery-heading', 'gallery-body'],
      tracking: ['label', 'wide-label'],
      ease: ['out-expo', 'in-out-quint'],
    },
  },
})

/** Join class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
