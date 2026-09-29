import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'

// Canonical public URL (same short route the email uses) + copy + publish status.
export function ShareLinkBox({ url, isLive, copied, onCopy }: {
  url: string
  isLive: boolean
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="mb-[18px] flex flex-col gap-2.5 rounded-[12px] border border-line bg-black/3 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', isLive ? 'text-success' : 'text-warning')}>
          <span className={cn('size-[7px] rounded-full', isLive ? 'bg-success' : 'bg-warning')} />
          {isLive ? 'פורסם — הקישור פעיל' : 'טיוטה — הקישור לא פעיל עד לפרסום'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={e => e.currentTarget.select()}
          aria-label="קישור ציבורי לגלריה"
          className="min-w-0 flex-1 rounded-[8px] border border-line bg-raised px-3 py-[9px] text-left text-xs text-ink outline-none [direction:ltr]"
        />
        <button
          onClick={onCopy}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border px-3.5 py-[9px] text-xs font-semibold whitespace-nowrap',
            copied ? 'border-success/45 bg-success/10 text-success' : 'border-ink bg-ink text-white',
          )}
        >
          <Icon name={copied ? 'check' : 'copy'} size={12} strokeWidth={1.85} />
          {copied ? 'הועתק' : 'העתק'}
        </button>
      </div>
    </div>
  )
}
