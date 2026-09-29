import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'

/** Read-only link/token with a copy button that confirms visibly. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      {label && (
        <div className="mb-2 text-[10px] font-medium tracking-[0.14em] text-muted uppercase">{label}</div>
      )}
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          dir="ltr"
          onFocus={e => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-hair border border-line bg-raised px-3 py-2.5 text-left font-mono text-xs text-ink-soft"
        />
        <button
          onClick={copy}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-hair border px-3.5 text-[11px] font-medium tracking-[0.1em] uppercase',
            copied ? 'border-sage bg-sage/10 text-sage' : 'border-ink bg-transparent text-ink',
          )}
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} strokeWidth={1.9} />
          {copied ? 'הועתק' : 'העתק'}
        </button>
      </div>
    </div>
  )
}
