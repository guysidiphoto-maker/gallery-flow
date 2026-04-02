import React, { useState } from 'react'

interface AuthInputProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  autoFocus?: boolean
}

export function AuthInput({ value, onChange, placeholder, type = 'text', autoFocus }: AuthInputProps) {
  const [focused, setFocused] = useState(false)

  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        padding: '13px 16px',
        background: 'rgba(255,255,255,.05)',
        border: `1px solid ${focused ? 'rgba(99,102,241,.5)' : 'rgba(255,255,255,.08)'}`,
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color .2s, box-shadow .2s',
        boxShadow: focused ? '0 0 0 3px rgba(99,102,241,.12)' : 'none',
        boxSizing: 'border-box',
      }}
    />
  )
}
