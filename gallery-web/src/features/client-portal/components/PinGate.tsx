import { Button, Input, cn } from '@/shared/ui'
import { usePinUnlock } from '../hooks/usePinUnlock'
import { CenteredCard } from './CenteredCard'
import { CardHeading } from './CardHeading'

/** Legacy access-code gate for clients that were given a PIN instead of a membership. */
export function PinGate({ clientId, slug, onUnlocked }: {
  clientId: string
  slug: string
  onUnlocked: () => void
}) {
  const { codeInput, setCodeInput, codeError, submitting, tryUnlock } = usePinUnlock(clientId, onUnlocked)

  return (
    <CenteredCard dir="rtl">
      <CardHeading eyebrow="Client Dashboard" title="הזינו קוד גישה" lead="הקוד נמצא במייל שקיבלת מהצלם" leadClassName="mb-8" />
      <div className="flex gap-2">
        <Input
          type="text"
          value={codeInput}
          onChange={e => setCodeInput(e.target.value)}
          placeholder="CODE"
          autoFocus
          disabled={submitting}
          onKeyDown={e => { if (e.key === 'Enter' && !submitting) void tryUnlock() }}
          className={cn(
            'flex-1 px-3.5 py-3 text-center text-[15px] tracking-label uppercase',
            codeError && 'border-danger-strong focus:border-danger-strong',
          )}
        />
        <Button onClick={() => { void tryUnlock() }} disabled={submitting} className="px-6 py-3 disabled:opacity-70">
          {submitting ? 'מאמת...' : 'Enter'}
        </Button>
      </div>
      {codeError && <p className="mt-3 text-xs font-medium text-danger-strong">{codeError}</p>}
      <a
        href={slug ? `/${slug}/client/${clientId}` : `/client/${clientId}`}
        className="mt-7 inline-block text-eyebrow tracking-label text-muted uppercase no-underline transition-colors hover:text-ink"
      >
        View public page →
      </a>
    </CenteredCard>
  )
}
