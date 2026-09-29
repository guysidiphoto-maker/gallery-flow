import { cn } from '@/shared/ui'
import type { StepIndex, T } from '../wizardTypes'
import { surfaceAlt, textDim } from './theme'

const STEPS: StepIndex[] = [1, 2, 3, 4, 5]

export function StepIndicator({ t, step }: { t: T; step: StepIndex }) {
  return (
    <ol className="mt-4 flex flex-wrap gap-2">
      {STEPS.map(s => (
        <li
          key={s}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold',
            s === step ? 'border-brand bg-brand text-white'
              : s < step ? 'border-night-line bg-brand/15 text-brand'
                : cn(surfaceAlt, textDim, 'border-night-line'),
          )}
        >
          {s}. {t(`import.step${s}.title` as never).replace(/^.*?:\s*/, '')}
        </li>
      ))}
    </ol>
  )
}
