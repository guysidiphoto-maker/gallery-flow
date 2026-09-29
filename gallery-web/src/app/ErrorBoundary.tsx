import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { getSentryReportContext } from '@/shared/lib/sentryContext'

interface State {
  hasError: boolean
  eventId: string | null
  copied: boolean
}

// Last-resort fallback for render crashes (e.g. stale chunks after a deploy).
// Reports to Sentry and lets the user copy a support report.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, eventId: null, copied: false }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    let eventId: string | null = null
    try {
      eventId = Sentry.captureException(error, { extra: { errorInfo } }) ?? null
    } catch {
      console.error('ErrorBoundary failed to report to Sentry', error)
    }
    this.setState({ eventId })
  }

  copyReport = async (): Promise<void> => {
    const ctx = getSentryReportContext()
    const report = [
      `Sentry Event ID: ${ctx.eventId ?? this.state.eventId ?? 'n/a'}`,
      `Timestamp:       ${ctx.timestamp}`,
      `URL:             ${ctx.url}`,
      `User ID:         ${ctx.user.id ?? 'n/a'}`,
      `Gallery ID:      ${ctx.gallery.id ?? 'n/a'}`,
      `Gallery slug:    ${ctx.gallery.slug ?? 'n/a'}`,
      `Gallery status:  ${ctx.gallery.status ?? 'n/a'}`,
      `User Agent:      ${ctx.userAgent}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(report)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2400)
    } catch {
      // Clipboard blocked: let the user copy it by hand.
      try { window.prompt('העתק את הטקסט הבא ושלח אלינו במייל:', report) } catch { /* noop */ }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const { eventId, copied } = this.state
    return (
      <div dir="rtl" className="fixed inset-0 flex items-center justify-center bg-night p-6 text-center text-white/85">
        <div className="max-w-[420px]">
          <h1 className="mb-3 font-display text-[32px] font-extrabold tracking-tight text-white">התרחשה שגיאה</h1>
          <p className="mb-7 text-sm leading-relaxed text-white/60">נסה לרענן את הדף. אם זה לא נפתר, פנה אלינו.</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button
              onClick={() => window.location.reload()}
              className="rounded-sm bg-lime px-[22px] py-3 text-[13px] font-bold tracking-wide text-black"
            >
              רענן דף
            </button>
            <button
              onClick={this.copyReport}
              className={`rounded-sm border border-white/25 px-[22px] py-3 text-[13px] font-semibold tracking-wide text-white/85 transition-colors ${copied ? 'bg-lime/15' : 'bg-transparent'}`}
            >
              {copied ? 'הועתק' : 'העתק דיווח'}
            </button>
          </div>
          {eventId && <p className="mt-[18px] font-mono text-[11px] break-all text-white/35">{eventId}</p>}
        </div>
      </div>
    )
  }
}
