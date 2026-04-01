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
        <h1 className="pw-gate__title">{galleryName}</h1>
        <p className="pw-gate__sub">This gallery is protected</p>
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
