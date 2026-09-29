import { useState } from 'react'
import { warmGalleryCache } from '@/shared/lib/warmCache'
import type { Gallery, Toast } from '../types'

// Share Center modal: email send + server-rendered preview of the same email.
export function useShareGallery(deps: {
  showToast: Toast
  loadActivitySummary: (galleryId: string) => unknown
}) {
  const { showToast, loadActivitySummary } = deps
  const [shareGallery, setShareGallery] = useState<Gallery | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareSubject, setShareSubject] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [shareSending, setShareSending] = useState(false)
  const [shareSent, setShareSent] = useState(false)
  const [shareLinkCopied, setShareLinkCopied] = useState(false)
  // Non-null = the preview modal is open with this HTML.
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  function openEmailShare(g: Gallery) {
    setShareGallery(g)
    setShareSubject(`התמונות שלך מ-${g.name} מוכנות`)
    setShareMessage('')
    setShareEmail('')
    setShareSent(false)
    setShareLinkCopied(false)
    // "Recent recipients" comes from the real email log.
    void loadActivitySummary(g.id)
  }

  async function sendShareEmail() {
    if (!shareGallery || !shareEmail) return
    setShareSending(true)
    void warmGalleryCache(shareGallery.id)
    try {
      const { sendGalleryShareEmail } = await import('../lib/shareGallery')
      const res = await sendGalleryShareEmail({
        galleryId: shareGallery.id,
        recipientEmail: shareEmail,
        subject: shareSubject || undefined,
        message: shareMessage || undefined,
      })
      if (res.ok) {
        setShareSent(true)
        // Only auto-close the modal it was sent from, not one opened meanwhile.
        const sentId = shareGallery.id
        setTimeout(() => {
          setShareGallery(g => (g?.id === sentId ? null : g))
          setShareSent(false)
        }, 1800)
      } else {
        showToast({ kind: 'error', text: 'שגיאה בשליחה: ' + (res.error || 'לא ידוע') })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ kind: 'error', text: 'שגיאה: ' + msg })
      console.warn('[sendGalleryShareEmail]', err)
    } finally {
      setShareSending(false)
    }
  }

  // Runs the same composer as the send path, so the preview is byte-identical.
  async function previewShareEmail() {
    if (!shareGallery || previewLoading) return
    setPreviewLoading(true)
    try {
      const { previewGalleryShareEmail } = await import('../lib/shareGallery')
      const res = await previewGalleryShareEmail({
        galleryId: shareGallery.id,
        recipientEmail: shareEmail || undefined,
        subject: shareSubject || undefined,
        message: shareMessage || undefined,
      })
      if (res.ok && res.html) {
        setPreviewHtml(res.html)
      } else {
        alert('שגיאה בתצוגה מקדימה: ' + (res.error || 'לא ידוע'))
      }
    } catch (err) {
      alert('שגיאה: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPreviewLoading(false)
    }
  }

  function copyShareLink(url: string, galleryId: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setShareLinkCopied(true)
        setTimeout(() => setShareLinkCopied(false), 1800)
      },
      () => showToast({ kind: 'error', text: 'ההעתקה נכשלה' }),
    )
    void warmGalleryCache(galleryId)
  }

  return {
    shareGallery, setShareGallery,
    shareEmail, setShareEmail,
    shareSubject, setShareSubject,
    shareMessage, setShareMessage,
    shareSending, shareSent, shareLinkCopied,
    previewHtml, setPreviewHtml, previewLoading,
    openEmailShare, sendShareEmail, previewShareEmail, copyShareLink,
  }
}

export type ShareGalleryState = ReturnType<typeof useShareGallery>
