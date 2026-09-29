import { cn } from '@/shared/ui'

// `toneClass` colors the count (a text-* utility).
export function UploadReviewRow({ label, n, toneClass }: { label: string; n: number; toneClass: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cn('text-[15px] font-bold', toneClass)}>{n}</span>
    </div>
  )
}
