import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

export type Phase = 'welcome' | 'camera' | 'thinking' | 'found'

export const THINKING_LINES = [
  'רגע… מחפשים אותך',
  'עוברים על התמונות 👀',
  'יש מצב שתפסנו אותך…',
  'עוד שנייה ויש לנו את זה',
]

export const FOUND_THUMBS = 6

/** State machine for the /demo selfie flow: camera, staged "thinking" copy, reveal. */
export function useSelfieDemo() {
  const [phase, setPhase] = useState<Phase>('welcome')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [visibleLines, setVisibleLines] = useState(0)
  const [visibleThumbs, setVisibleThumbs] = useState(0)
  const [cameraAvailable, setCameraAvailable] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraAvailable(true)
    } catch {
      setCameraAvailable(false)
    }
  }, [])

  useEffect(() => {
    if (phase === 'camera') startCamera()
    else stopCamera()
    return stopCamera
  }, [phase, startCamera, stopCamera])

  // Thinking: reveal one line every 600ms, then move to "found".
  useEffect(() => {
    if (phase !== 'thinking') { setVisibleLines(0); return }
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleLines(i)
      if (i >= THINKING_LINES.length) clearInterval(timer)
    }, 600)
    const done = setTimeout(() => setPhase('found'), THINKING_LINES.length * 600 + 1400)
    return () => { clearInterval(timer); clearTimeout(done) }
  }, [phase])

  useEffect(() => {
    if (phase !== 'found') { setVisibleThumbs(0); return }
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleThumbs(i)
      if (i >= FOUND_THUMBS) clearInterval(timer)
    }, 180)
    return () => clearInterval(timer)
  }, [phase])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    setSelfieUrl(canvas.toDataURL('image/jpeg', 0.85))
    stopCamera()
    setPhase('thinking')
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setSelfieUrl(reader.result as string)
      setPhase('thinking')
    }
    reader.readAsDataURL(file)
  }

  function reset() {
    setSelfieUrl(null)
    setVisibleLines(0)
    setVisibleThumbs(0)
    setPhase('welcome')
  }

  return {
    phase, setPhase, selfieUrl, visibleLines, visibleThumbs, cameraAvailable,
    videoRef, fileRef, capture, handleFileUpload, reset,
  }
}
