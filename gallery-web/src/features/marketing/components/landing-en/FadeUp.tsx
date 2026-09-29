import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/ui'

interface Props {
  children: ReactNode
  className?: string
  delay?: number
}

/**
 * Fade + rise on first view. Callers may pass their own transition/transform
 * classes; they win (cards keep their hover lift and only the transform eases).
 */
export function FadeUp({ children, className, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-[650ms] ease-[ease]',
        visible ? 'opacity-100 [transform:translateY(0)_scale(1)]' : 'opacity-0 [transform:translateY(28px)_scale(0.97)]',
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
