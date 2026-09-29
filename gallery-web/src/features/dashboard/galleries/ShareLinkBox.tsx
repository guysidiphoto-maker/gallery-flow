import { Icon } from '@/shared/ui/Icon'
import { border, textPrimary } from '../styles'

// Canonical public URL (same short route the email uses) + copy + publish status.
export function ShareLinkBox({ url, isLive, copied, onCopy }: {
  url: string
  isLive: boolean
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: 14, marginBottom: 18, borderRadius: 12,
      background: 'rgba(0,0,0,.03)', border: `1px solid ${border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
          color: isLive ? '#1b8a4e' : '#b45309',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isLive ? '#22c55e' : '#d97706',
          }} />
          {isLive ? 'פורסם — הקישור פעיל' : 'טיוטה — הקישור לא פעיל עד לפרסום'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          readOnly
          value={url}
          onFocus={e => e.currentTarget.select()}
          aria-label="קישור ציבורי לגלריה"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8, direction: 'ltr', textAlign: 'left',
            background: '#fff', border: `1px solid ${border}`, color: textPrimary,
            fontSize: 12, fontFamily: 'inherit', outline: 'none', minWidth: 0,
          }}
        />
        <button
          onClick={onCopy}
          style={{
            padding: '9px 14px', borderRadius: 8, whiteSpace: 'nowrap',
            background: copied ? 'rgba(45,196,121,.10)' : textPrimary,
            border: `1px solid ${copied ? 'rgba(45,196,121,.45)' : textPrimary}`,
            color: copied ? '#1b8a4e' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={12} strokeWidth={1.85} />
          {copied ? 'הועתק' : 'העתק'}
        </button>
      </div>
    </div>
  )
}
