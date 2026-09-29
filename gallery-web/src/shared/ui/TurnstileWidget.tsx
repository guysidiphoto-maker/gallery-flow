// Cloudflare Turnstile in managed mode: invisible for most visitors, interactive
// only for suspicious ones. The script loads lazily on first mount.

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
  // Only a siteKey change re-renders the widget; callback identity changes are ignored.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  return (
    <div ref={containerRef} className="my-3 flex items-center justify-center" />
  )
}
