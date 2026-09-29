// Offline lead queue: guests at venues often have no signal, so leads are kept in
// localStorage and re-posted when the page next loads or comes back online.

const PHONE_RE = /^05[0-9]\d{7}$/

export function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '')
}

/** Israeli mobile, local (05X…) or international (+9725X…). */
export function isValidPhone(raw: string): boolean {
  const clean = cleanPhone(raw)
  return PHONE_RE.test(clean) || /^\+9725[0-9]\d{7}$/.test(clean)
}

const QUEUE_KEY = 'gf_lead_queue'

export function queueLead(payload: Record<string, string>) {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    queue.push(payload)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* noop */ }
}

export async function flushQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return
    const queue: Record<string, string>[] = JSON.parse(raw)
    if (queue.length === 0) return
    localStorage.removeItem(QUEUE_KEY)
    for (const payload of queue) {
      await fetch('/api/capture-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        queueLead(payload)
      })
    }
  } catch { /* noop */ }
}
