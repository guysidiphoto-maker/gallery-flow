import { useState } from 'react'
import { cn } from '@/shared/ui'
import { CoverFallback } from './CoverFallback'

/** Real cover image, degrading to CoverFallback on a missing URL or a failed load. */
export function PortalCover({ coverUrl, name, aspectClass = 'aspect-[3/2]', rounded = false, className }: {
  coverUrl: string | null
  name: string
  aspectClass?: string
  rounded?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!coverUrl || failed) return <CoverFallback name={name} aspectClass={aspectClass} rounded={rounded} />
  return (
    <div className={cn('w-full overflow-hidden bg-surface', rounded && 'rounded-[4px]', aspectClass, className)}>
      <img src={coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="block size-full object-cover" />
    </div>
  )
}
