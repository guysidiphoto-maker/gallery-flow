import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

/** Selectable choice tile: raised with an ink hairline when selected, outlined otherwise. */
export function OptionTile({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      className={cn(
        'rounded-hair border transition-colors duration-150',
        selected ? 'border-ink bg-raised' : 'border-line bg-transparent',
        className,
      )}
      {...rest}
    />
  )
}
