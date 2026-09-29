import { useRef, useState } from 'react'
import { cn } from '@/shared/ui'
import { FieldLabel } from './FieldLabel'

const slotButton =
  'rounded-hair border border-line bg-transparent px-2.5 py-2 text-[11px] tracking-[0.14em]'

export function LogoSlotEditor({ label, hint, dark, url, onUpload, onClear }: {
  label: string
  hint: string
  /** Preview on a dark background (the dark-mode logo slot). */
  dark: boolean
  url: string | null | undefined
  onUpload: (file: File) => Promise<void>
  onClear: () => Promise<void>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div
        className={cn(
          'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-hair border border-line',
          dark ? 'bg-ink' : 'bg-raised',
        )}
      >
        {url ? (
          <img src={url} alt={label} className="max-h-[70%] max-w-[70%] object-contain" />
        ) : (
          <span className={cn('text-[11px] tracking-[0.1em]', dark ? 'text-white/50' : 'text-muted')}>
            אין לוגו
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[11px] leading-normal text-muted">{hint}</div>
      <div className="mt-2.5 flex gap-2">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={async e => {
            const f = e.target.files?.[0]
            if (!f) return
            setUploading(true)
            try { await onUpload(f) } finally {
              setUploading(false)
              if (ref.current) ref.current.value = ''
            }
          }}
        />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className={cn(slotButton, 'flex-1 font-semibold text-ink uppercase disabled:cursor-wait')}
        >
          {uploading ? '…' : url ? 'החלפה' : 'העלאה'}
        </button>
        {url && (
          <button type="button" onClick={() => void onClear()} className={cn(slotButton, 'font-medium text-muted')}>
            ×
          </button>
        )}
      </div>
    </div>
  )
}
