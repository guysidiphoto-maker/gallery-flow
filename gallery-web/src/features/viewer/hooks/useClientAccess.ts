import { useCallback, useEffect, useState } from 'react'
import { getHidden as gcGetHidden, setHidden as gcSetHidden } from '@/shared/data/publicGallery'
import type { Gallery } from '@/shared/types'
import type { ViewerRole } from '../lib/viewerSettings'

/**
 * Client vs guest role (client selection mode) and the client's hidden-photo set.
 * Hidden ids load for public galleries too; the server scopes them per unlock token.
 */
export function useClientAccess(gallery: Gallery | null, unlocked: boolean, clientSelectionEnabled: boolean, clientCode: string) {
  const [viewerRole, setViewerRole] = useState<ViewerRole>('none')
  const [clientCodeInput, setClientCodeInput] = useState('')
  const [clientCodeError, setClientCodeError] = useState(false)
  const [hiddenImageIds, setHiddenImageIds] = useState<Set<string>>(new Set())

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
    if (saved === 'client') setViewerRole('client')
  }, [gallery, clientSelectionEnabled])

  const toggleHideImage = useCallback(async (imageId: string) => {
    if (!gallery) return
    const isHidden = hiddenImageIds.has(imageId)
    await gcSetHidden(gallery.id, imageId, !isHidden)
    setHiddenImageIds(prev => {
      const next = new Set(prev)
      if (isHidden) next.delete(imageId); else next.add(imageId)
      return next
    })
  }, [gallery, hiddenImageIds])

  const submitClientCode = () => {
    if (!gallery) return
    if (clientCodeInput === clientCode) {
      setViewerRole('client')
      sessionStorage.setItem(`client-role-${gallery.id}`, 'client')
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
