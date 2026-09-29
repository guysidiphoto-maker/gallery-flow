import { Button } from './Button'

export function ErrorBanner({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[4px] border border-danger/40 bg-danger/5 px-[18px] py-3.5 text-[13.5px] text-danger">
      <span>{text}</span>
      {onRetry && <Button variant="danger" onClick={onRetry} className="px-3.5 py-[7px]">נסה שוב</Button>}
    </div>
  )
}
