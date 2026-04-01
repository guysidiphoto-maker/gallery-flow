import React, { useState } from 'react'

interface BrandingStepProps {
  onNext: (logo: string | null, website: string | null) => void
  onBack: () => void
}

export function BrandingStep({ onNext, onBack }: BrandingStepProps) {
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [website, setWebsite] = useState('')

  async function handleChooseLogo() {
    try {
      const result = await (window as any).api.chooseLogoFile()
      if (result) {
        setLogoPath(result.path || result)
        setLogoPreview(result.dataUrl || result.path || result)
      }
    } catch (err) {
      console.error('Failed to choose logo:', err)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Heading */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'rgba(255,255,255,.9)',
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        Add your branding{' '}
        <span style={{ fontWeight: 400, color: 'rgba(255,255,255,.4)', fontSize: 15 }}>
          (optional)
        </span>
      </div>

      {/* Logo upload area */}
      <div
        onClick={handleChooseLogo}
        style={{
          width: '100%',
          height: 120,
          border: '2px dashed rgba(255,255,255,.15)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          marginBottom: 20,
          overflow: 'hidden',
          transition: 'border-color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.3)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)')}
      >
        {logoPreview ? (
          <img
            src={logoPreview}
            alt="Logo preview"
            style={{
              maxWidth: '80%',
              maxHeight: '80%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, marginBottom: 6 }}>
              <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
              Click to upload logo
            </div>
          </div>
        )}
      </div>

      {/* Website URL input */}
      <input
        type="url"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="https://your-website.com"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          backgroundColor: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10,
          padding: '14px 16px',
          fontSize: 15,
          color: 'rgba(255,255,255,.9)',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />

      {/* Finish Setup button */}
      <button
        onClick={() => onNext(logoPath, website.trim() || null)}
        style={{
          marginTop: 28,
          width: '100%',
          backgroundColor: '#6366f1',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          borderRadius: 10,
          padding: '14px 16px',
          cursor: 'pointer',
          transition: 'filter 0.15s ease',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
      >
        Finish Setup
      </button>

      {/* Skip link */}
      <div
        onClick={() => onNext(null, null)}
        style={{
          marginTop: 16,
          fontSize: 13,
          color: 'rgba(255,255,255,.4)',
          cursor: 'pointer',
          textAlign: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.6)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.4)')}
      >
        Skip
      </div>

      {/* Back link */}
      <div
        onClick={onBack}
        style={{
          marginTop: 10,
          fontSize: 13,
          color: 'rgba(255,255,255,.4)',
          cursor: 'pointer',
          textAlign: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.6)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,.4)')}
      >
        Back
      </div>
    </div>
  )
}
