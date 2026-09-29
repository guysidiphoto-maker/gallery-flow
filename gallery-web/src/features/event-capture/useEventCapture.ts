import { useEffect, useState, type FormEvent } from 'react'
import { getActiveEvent } from '@/shared/data/events'
import type { EventConfig } from '@/shared/types'
import { cleanPhone, flushQueue, isValidPhone, queueLead } from './leadQueue'

export type Phase = 'loading' | 'form' | 'submitting' | 'done' | 'error'

/** Event id from `/event/{id}`. */
function readEventId(): string {
  const match = window.location.pathname.match(/^\/event\/([^/]+)$/)
  return match?.[1] || ''
}

/** Loads the event behind the QR link and owns the lead form state + submit. */
export function useEventCapture() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [event, setEvent] = useState<EventConfig | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [phoneError, setPhoneError] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [whatsappSent, setWhatsappSent] = useState(true)
  const [galleryUrl, setGalleryUrl] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [turnstileToken, setTurnstileToken] = useState('')

  const eventId = readEventId()

  useEffect(() => {
    if (!eventId) { setPhase('error'); return }

    getActiveEvent(eventId)
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); return }
        setEvent(data as EventConfig)
        setGalleryUrl(data.gallery_url)
        setPhase('form')
      })

    flushQueue()
  }, [eventId])

  useEffect(() => {
    const goOnline = () => { setOffline(false); flushQueue() }
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const trimName = name.trim()
    const trimPhone = cleanPhone(phone)
    let hasError = false

    if (!trimName) { setNameError(true); hasError = true }
    if (!isValidPhone(trimPhone)) { setPhoneError(true); hasError = true }
    if (hasError) return

    const payload = {
      eventId,
      name: trimName,
      phone: trimPhone,
      email: email.trim() || undefined,
      turnstileToken: turnstileToken || undefined,
    }

    setPhase('submitting')

    // Optimistic success: the lead is queued and sent once back online.
    if (!navigator.onLine) {
      queueLead(payload as Record<string, string>)
      setPhase('done')
      return
    }

    try {
      const resp = await fetch('/api/capture-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })

      const data = await resp.json()

      if (!resp.ok && data?.error === 'invalid_phone') {
        setPhoneError(true)
        setPhase('form')
        return
      }

      if (data?.galleryUrl) setGalleryUrl(data.galleryUrl)
      setWhatsappSent(data?.whatsappSent !== false)
      setPhase('done')
    } catch {
      queueLead(payload as Record<string, string>)
      setPhase('done')
    }
  }

  return {
    phase, event, offline, whatsappSent, galleryUrl, handleSubmit, setTurnstileToken,
    name, nameError, setName: (v: string) => { setName(v); setNameError(false) },
    phone, phoneError, setPhone: (v: string) => { setPhone(v); setPhoneError(false) },
    email, setEmail,
  }
}

export type EventCaptureForm = ReturnType<typeof useEventCapture>
