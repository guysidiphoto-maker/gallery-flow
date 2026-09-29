import { useState } from 'react'
import { Button } from '@/shared/ui'

const COPIED_MS = 1500
const keyCell = 'text-left text-[9px] font-medium tracking-wide-label text-muted uppercase'
const valueCell = 'font-mono text-[13px] text-ink'

/** The TXT record the owner must add at their DNS provider, with a copy button. */
export function DnsRecordCard({ domain, token }: { domain: string; token: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      // Clipboard may be blocked; the value is visible on screen.
    }
  }

  return (
    <div
      dir="ltr"
      className="mb-4 grid grid-cols-[88px_1fr] gap-x-3.5 gap-y-2.5 border border-line bg-raised px-4 py-3.5 [unicode-bidi:embed]"
    >
      <div className={keyCell}>Type</div>
      <div className={valueCell}>TXT</div>

      <div className={keyCell}>Name</div>
      <div className={`${valueCell} wrap-anywhere`}>{`_pixflow-verify.${domain}`}</div>

      <div className={keyCell}>Value</div>
      <div className="flex items-center gap-2">
        <code className={`${valueCell} flex-1 border border-line bg-surface px-2.5 py-1.5 wrap-anywhere`}>
          {token}
        </code>
        <Button variant="ghost" onClick={copy} className="shrink-0 px-3 py-1.5 text-[11px] tracking-[0.12em]">
          {copied ? 'הועתק' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
