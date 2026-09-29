import { useRef, useState, useCallback, useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { getStoredToken } from '@/shared/gallery/galleryClient'
import { THINKING_LINES_MAP, type FaceSearchLang } from './faceSearchTexts'
import { isServerImageRow, type ServerImageRow } from './serverImageRow'

export type Phase =
  | 'welcome'
  | 'camera'
  | 'thinking'
  | 'found'
  | 'not-found'
  | 'not-found-private'

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

interface Options {
  galleryId: string
  privacyMode: 'open' | 'private'
  lang: FaceSearchLang
  onSelfieCapture?: (url: string) => void
}

/** Camera, selfie capture and the rekognition search behind the face-search flow. */
export function useFaceSearch({ galleryId, privacyMode, lang, onSelfieCapture }: Options) {
  const [phase, setPhase] = useState<Phase>('welcome')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [matchIds, setMatchIds] = useState<string[]>([])
  const [matchImages, setMatchImages] = useState<ServerImageRow[]>([])
  const [visibleLines, setVisibleLines] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch {
      // No camera (or permission denied): fall back to picking a file.
      fileInputRef.current?.click()
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (phase === 'camera') {
      startCamera()
    } else {
      stopCamera()
    }
    return stopCamera
  }, [phase, startCamera, stopCamera])

  const startSearch = useCallback(async (file: File) => {
    setPhase('thinking')
    setVisibleLines(0)

    const lineTimers: ReturnType<typeof setTimeout>[] = []
    THINKING_LINES_MAP[lang].forEach((_, i) => {
      lineTimers.push(setTimeout(() => setVisibleLines(i + 1), 500 + i * 600))
    })

    const finish = (next: Phase) => {
      setFadeOut(true)
      setTimeout(() => {
        setFadeOut(false)
        setPhase(next)
      }, 500)
    }
    const notFound: Phase = privacyMode === 'private' ? 'not-found-private' : 'not-found'

    try {
      const form = new FormData()
      form.append('galleryId', galleryId)
      form.append('selfie', file)
      const token = getStoredToken(galleryId)
      if (token) form.append('token', token)

      const { data, error } = await supabase.functions.invoke('rekognition', {
        body: form,
      })

      if (error) throw new Error(error.message || 'Search failed')
      if (data?.error) throw new Error(String(data.error))

      const matches: Array<{ imageId: string; similarity: number }> = data?.matches ?? []
      const rawImages: unknown = data?.images ?? []
      const images: ServerImageRow[] = Array.isArray(rawImages)
        ? rawImages.filter(isServerImageRow)
        : []

      lineTimers.forEach(t => clearTimeout(t))

      // Minimum "thinking" time so the result never flashes in.
      await new Promise(r => setTimeout(r, 400))

      if (matches.length > 0) {
        const ids = matches.map(m => m.imageId)
        setMatchIds(ids)
        setMatchImages(images)
        setMatchCount(ids.length)
        finish('found')
      } else {
        finish(notFound)
      }
    } catch {
      finish(notFound)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, privacyMode])

  const captureSelfie = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const size = Math.min(video.videoWidth, video.videoHeight)
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Center square crop, mirrored to match the on-screen preview.
    const sx = (video.videoWidth - size) / 2
    const sy = (video.videoHeight - size) / 2
    ctx.translate(size, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)

    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      setSelfieUrl(url)
      onSelfieCapture?.(url)

      stopCamera()
      startSearch(file)
    }, 'image/jpeg', 0.85)
  }, [stopCamera, startSearch, onSelfieCapture])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_SELFIE_BYTES) return
    const url = URL.createObjectURL(f)
    setSelfieUrl(url)
    onSelfieCapture?.(url)

    stopCamera()
    startSearch(f)
  }

  const retry = () => {
    setSelfieUrl(null)
    setMatchIds([])
    setMatchCount(0)
    setVisibleLines(0)
    setPhase('camera')
  }

  return {
    phase, setPhase, selfieUrl, matchCount, matchIds, matchImages, visibleLines, fadeOut,
    videoRef, canvasRef, fileInputRef,
    captureSelfie, onFileChange, retry,
  }
}
