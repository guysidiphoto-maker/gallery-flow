// Designed placeholder cover for a gallery without an image — a common path, so
// it must look intentional: a deterministic soft gradient + initials monogram.

import type { CSSProperties } from 'react'
import { cn } from '@/shared/ui'

// Calm, low-saturation duotones that sit well on the cream canvas. Data, not theme.
const GRADIENTS: Array<[string, string]> = [
  ['#E8E3D9', '#CBBFA8'],
  ['#DCE1DA', '#AEB8A6'],
  ['#E5DCD5', '#C4A98F'],
  ['#DDE0E4', '#A9AEB8'],
  ['#E7DEDA', '#BFA39A'],
  ['#DCE3E0', '#9FB3AD'],
  ['#E4E0D6', '#B7AE8E'],
  ['#E0DBE0', '#ABA0B0'],
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

// First glyphs of up to two words; only Latin gets uppercased (Hebrew has no case).
function initials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '•'
  const words = cleaned.split(/\s+/).filter(Boolean)
  const take = words.length >= 2 ? [words[0][0], words[1][0]] : [cleaned.slice(0, 2)]
  const joined = take.join('')
  return /[a-z]/i.test(joined) ? joined.toUpperCase() : joined
}

interface Props {
  name: string
  /** Aspect-ratio utility for the box, e.g. 'aspect-[3/2]'. */
  aspectClass?: string
  rounded?: boolean
}

export function CoverFallback({ name, aspectClass = 'aspect-[3/2]', rounded = false }: Props) {
  const h = hashString(name || 'gallery')
  const [from, to] = GRADIENTS[h % GRADIENTS.length]
  const angle = 120 + (h % 6) * 15
  const vars = { '--cf-from': from, '--cf-to': to, '--cf-angle': `${angle}deg` } as CSSProperties

  return (
    <div
      aria-hidden
      style={vars}
      className={cn(
        'relative flex w-full items-center justify-center overflow-hidden',
        'bg-[linear-gradient(var(--cf-angle),var(--cf-from),var(--cf-to))]',
        rounded && 'rounded-[4px]',
        aspectClass,
      )}
    >
      <span className="font-serif text-[clamp(30px,5vw,56px)] font-medium tracking-[0.04em] text-ink opacity-[0.34] select-none">
        {initials(name)}
      </span>
      {/* Hairline inner frame for a printed feel. */}
      <span className={cn('pointer-events-none absolute inset-2.5 border border-ink/12', rounded && 'rounded-[3px]')} />
    </div>
  )
}
