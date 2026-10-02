import { useCallback, useEffect, useState } from 'react'
import { getHidden as gcGetHidden, setHidden as gcSetHidden, verifyClientCode } from '@/shared/data/publicGallery'
import type { Gallery } from '@/shared/types'
import type { ViewerRole } from '../lib/viewerSettings'

/**
 * Client vs guest role (client selection mode) and the client's hidden-photo set.
 * Hidden ids load for public galleries too; the server scopes them per unlock token.
 * The client code is checked server-side and kept for the session, since hiding
 * a photo re-sends it.
 */
export function useClientAccess(gallery: Gallery | null, unlocked: boolean, clientSelectionEnabled: boolean) {
  const [viewerRole, setViewerRole] = useState<ViewerRole>('none')
  const [clientCodeInput, setClientCodeInput] = useState('')
  const [clientCodeError, setClientCodeError] = useState(false)
  const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set())
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null)

  useEffect(() => {
    if (!gallery) return
    gcGetHidden(gallery.id).then(ids => {
      setHiddenImageIds(new Set(ids))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery?.id, unlocked])

  // Without client selection everyone is a guest; otherwise restore a saved client role.
  useEffect(() => {
    if (!gallery) return
    if (!clientSelectionEnabled) {
      setViewerRole('guest')
      return
    }
    const saved = sessionStorage.getItem(`client-role-${gallery.id}`)
    const savedCode = sessionStorage.getItem(`client-code-${gallery.id}`)
    // A role saved before codes were server-checked has no code; ask again.
    if (saved === 'client' && savedCode) {
      setViewerRole('client')
      setVerifiedCode(savedCode)
    }
  }, [gallery, clientSelectionEnabled])

  const toggleHideImage = useCallback(async (imageId: string) => {
    if (!gallery) return
    const isHidden = hiddenImageIds.has(imageId)
    if (!await gcSetHidden(gallery.id, imageId, !isHidden, verifiedCode)) return
    setHiddenImageIds(prev => {
      const next = new Set(prev)
      if (isHidden) next.delete(imageId); else next.add(imageId)
      return next
    })
  }, [gallery, hiddenImageIds, verifiedCode])

  const submitClientCode = async () => {
    if (!gallery) return
    if (await verifyClientCode(gallery.id, clientCodeInput)) {
      setViewerRole('client')
      setVerifiedCode(clientCodeInput)
      sessionStorage.setItem(`client-role-${gallery.id}`, 'client')
      sessionStorage.setItem(`client-code-${gallery.id}`, clientCodeInput)
    } else {
      setClientCodeError(true)
    }
  }

  const changeClientCode = (value: string) => {
    setClientCodeInput(value.toUpperCase())
    setClientCodeError(false)
  }

  return {
    viewerRole,
    chooseGuest: () => setViewerRole('guest'),
    clientCodeInput,
    clientCodeError,
    changeClientCode,
    submitClientCode,
    hiddenImageIds,
    toggleHideImage,
  }
}
