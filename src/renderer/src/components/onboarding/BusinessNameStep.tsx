import React, { useState } from 'react'
import { slugify } from '../../lib/auth'

interface BusinessNameStepProps {
  onNext: (name: string, slug: string) => void
}

export function BusinessNameStep({ onNext }: BusinessNameStepProps) {
  const [name, setName] = useState('')

  const generatedSlug = slugify(name)

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
        What's your business name?
      </div>

      {/* Input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Jane Smith Photography"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onNext(name.trim(), generatedSlug)
        }}
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

      {/* Live slug preview */}
      {name.trim() && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: 'rgba(255,255,255,.4)',
            fontFamily: 'ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace',
          }}
        >
          pixflow.app/{generatedSlug}
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={() => {
          if (name.trim()) onNext(name.trim(), generatedSlug)
        }}
        disabled={!name.trim()}
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
          cursor: name.trim() ? 'pointer' : 'default',
          opacity: name.trim() ? 1 : 0.4,
          transition: 'opacity 0.15s ease, filter 0.15s ease',
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          if (name.trim()) e.currentTarget.style.filter = 'brightness(1.1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = 'brightness(1)'
        }}
      >
        Continue
      </button>
    </div>
  )
}
