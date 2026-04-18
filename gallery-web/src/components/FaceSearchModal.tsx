import { useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'

interface FaceSearchModalProps {
  galleryId: string
  onClose: () => void
  onMatches: (imageIds: string[]) => void
}

type Phase = 'pick' | 'searching' | 'error'

const MAX_SELFIE_BYTES = 5 * 1024 * 1024

export function FaceSearchModal({ galleryId, onClose, onMatches }: FaceSearchModalProps) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pickFile = () => fileInputRef.current?.click()

  const search = useCallback(async (file: File) => {
    if (file.size > MAX_SELFIE_BYTES) {
      setErrorMsg('Image is too large (5 MB max). Try a smaller photo.')
      setPhase('error')
      return
    }

    setPhase('searching')
    setPreviewUrl(URL.createObjectURL(file))

    try {
      const form = new FormData()
      form.append('galleryId', galleryId)
      form.append('selfie', file)

      const { data, error } = await supabase.functions.invoke('rekognition', {
        body: form,
      })

      if (error) throw new Error(error.message || 'Search failed')
      if (data?.error) throw new Error(String(data.error))

      const matches: Array<{ imageId: string; similarity: number }> = data?.matches ?? []
      if (matches.length === 0) {
        setErrorMsg('No matches found. Try a clearer photo of your face.')
        setPhase('error')
        return
      }

      const imageIds = matches.map(m => m.imageId)
      onMatches(imageIds)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg.includes('Too many') ? 'Too many searches from your location. Try again in an hour.' : msg)
      setPhase('error')
    }
  }, [galleryId, onMatches])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    void search(f)
  }

  const retry = () => {
    setErrorMsg('')
    setPreviewUrl(null)
    setPhase('pick')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, borderRadius: 16,
          background: '#111', border: '1px solid rgba(255,255,255,.08)',
          padding: 28, color: '#fff',
          boxShadow: '0 24px 80px rgba(0,0,0,.5)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,.06)', border: 'none',
            color: 'rgba(255,255,255,.6)', cursor: 'pointer',
            fontSize: 18, lineHeight: 1,
          }}
        >×</button>

        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Find your photos</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.5 }}>
          Upload a clear photo of your face. We'll find every photo of you in this gallery.
          Your selfie is never saved.
        </p>

        {/* Preview */}
        {previewUrl && (
          <div style={{
            width: 120, height: 120, borderRadius: 60, overflow: 'hidden',
            margin: '0 auto 20px', border: '2px solid rgba(99,102,241,.5)',
          }}>
            <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {phase === 'pick' && (
          <>
            <button
              onClick={pickFile}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Upload a selfie
            </button>
            <p style={{ margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,.35)', textAlign: 'center' }}>
              JPG or PNG · up to 5 MB
            </p>
          </>
        )}

        {phase === 'searching' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 40, height: 40, margin: '0 auto 16px',
              border: '3px solid rgba(99,102,241,.2)', borderTopColor: '#6366f1',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,.7)' }}>Searching the gallery…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {phase === 'error' && (
          <>
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
              fontSize: 13, color: '#fca5a5', lineHeight: 1.5,
            }}>
              {errorMsg}
            </div>
            <button
              onClick={retry}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12,
                border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer',
                background: 'transparent', color: '#fff',
                fontSize: 13, fontWeight: 600,
              }}
            >
              Try another photo
            </button>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="user"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  )
}
