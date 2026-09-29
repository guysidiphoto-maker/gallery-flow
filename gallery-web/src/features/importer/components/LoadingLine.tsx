import { Spinner } from '@/shared/ui'

export function LoadingLine({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-night-muted">
      <Spinner className="border-night-line border-t-brand" />
      {label}
    </div>
  )
}
