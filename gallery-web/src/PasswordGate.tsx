import { useState, useEffect } from 'react'

interface PasswordGateProps {
  galleryId: string
  galleryName: string
  password: string
  onUnlock: () => void
}

const STORAGE_KEY_PREFIX = 'gf_unlocked_'

export function PasswordGate({ galleryId, galleryName, password, onUnlock }: PasswordGateProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY_PREFIX + galleryId) === '1') {
      onUnlock()
    }
  }, [galleryId, onUnlock])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (value === password) {
      sessionStorage.setItem(STORAGE_KEY_PREFIX + galleryId, '1')
      onUnlock()
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div className="pw-gate">
      <form className="pw-gate__card" onSubmit={handleSubmit}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', borderRadius: 999, marginBottom: 8,
          background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.12)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.65)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(34,197,94,.65)', textTransform: 'uppercase' }}>
            End-to-end protected
          </span>
        </div>
        <h1 className="pw-gate__title">{galleryName}</h1>
        <p className="pw-gate__sub">This gallery is password protected</p>
        <input
          className="pw-gate__input"
          type="password"
          placeholder="Enter password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false) }}
          autoFocus
        />
        {error && <p className="pw-gate__error">Incorrect password</p>}
        <button className="pw-gate__btn" type="submit">View Gallery</button>
      </form>
    </div>
  )
}

export function isGalleryUnlocked(galleryId: string): boolean {
  return sessionStorage.getItem(STORAGE_KEY_PREFIX + galleryId) === '1'
}
