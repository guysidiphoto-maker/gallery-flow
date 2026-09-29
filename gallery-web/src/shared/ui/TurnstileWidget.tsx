// TurnstileWidget — Phase 4.5.D
//
// Renders the Cloudflare Turnstile invisible challenge widget. In Managed
// mode, the vast majority of legitimate viewers see nothing — Cloudflare
// scores the request silently and resolves a token within a second. Bots
// or sketchy IPs get an interactive challenge.
//
// Flow:
//   1. App.tsx's public-session useEffect calls ensurePublicSession()
//   2. If the server returns 429 with `turnstile_required` + a site key,
//      App.tsx renders <TurnstileWidget siteKey={...} onToken={...} />
//   3. Cloudflare's invisible challenge runs; on success we call onToken()
//   4. App.tsx re-calls ensurePublicSession({turnstileToken}) and stores
//      the resulting public-viewer token
//
// We load the Cloudflare turnstile.js script dynamically. It only mounts
// when the widget actually renders, so non-rate-limited gallery loads
// pay zero JS-loading cost.

import { useEffect, useRef } from 'react'

interface TurnstileGlobal {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: (err: unknown) => void
      'expired-callback'?: () => void
      appearance?: 'always' | 'execute' | 'interaction-only'
      execution?: 'render' | 'execute'
      theme?: 'auto' | 'light' | 'dark'
      retry?: 'auto' | 'never'
      size?: 'normal' | 'compact' | 'invisible'
    },
  ) => string
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptLoadingPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptLoadingPromise) return scriptLoadingPromise
  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src^="${SCRIPT_SRC}"]`)
    if (existing) {
      // Another mount started loading; wait until it's ready.
      const check = () => {
        if (window.turnstile) resolve()
        else setTimeout(check, 50)
      }
      check()
      return
    }
    const s = document.createElement('script')
    s.src = `${SCRIPT_SRC}?render=explicit`
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile_script_load_failed'))
    document.head.appendChild(s)
  })
  return scriptLoadingPromise
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string
  onToken: (token: string) => void
  onError?: (err: unknown) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled) return
        if (!containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'execute',
          execution: 'render',
          retry: 'auto',
          size: 'normal',
          callback: token => onToken(token),
          'error-callback': err => onError?.(err),
        })
      })
      .catch(err => onError?.(err))
    return () => {
      cancelled = true
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current)
        }
      } catch { /* ignore */ }
      widgetIdRef.current = null
    }
  // siteKey is stable per render; siteKey/onToken/onError changes drop the widget
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '12px 0',
      }}
    />
  )
}
