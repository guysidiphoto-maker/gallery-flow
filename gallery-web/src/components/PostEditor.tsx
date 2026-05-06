import { useState } from 'react'

export interface ScheduledPost {
  imageId: string
  galleryId: string
  galleryName: string
  eventType: string
  filename: string
  imageUrl: string
  caption: string
  scheduledDate: string
  scheduledTime: string
  status: 'draft' | 'scheduled' | 'posted'
}

interface PostEditorProps {
  post: ScheduledPost
  onUpdate: (post: ScheduledPost) => void
  onClose: () => void
  onGenerateCaption: (post: ScheduledPost) => void
  generating: boolean
}

export function PostEditor({ post, onUpdate, onClose, onGenerateCaption, generating }: PostEditorProps) {
  const [copied, setCopied] = useState(false)

  const copyCaption = () => {
    navigator.clipboard.writeText(post.caption).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const downloadPhoto = async () => {
    const res = await fetch(post.imageUrl)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = post.filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={{
      width: 340, flexShrink: 0, direction: 'rtl',
      borderRight: '1px solid rgba(255,255,255,.06)',
      background: 'rgba(255,255,255,.015)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>עריכת פוסט</span>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,.05)', border: 'none', borderRadius: 6,
          width: 26, height: 26, cursor: 'pointer', color: 'rgba(255,255,255,.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontFamily: 'inherit',
        }}>✕</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Photo preview */}
        <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: 'rgba(255,255,255,.03)' }}>
          <img src={post.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>

        {/* Status */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['draft', 'scheduled', 'posted'] as const).map(s => (
            <button key={s} onClick={() => onUpdate({ ...post, status: s })} style={{
              flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600,
              background: post.status === s
                ? (s === 'posted' ? 'rgba(16,185,129,.15)' : s === 'scheduled' ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.06)')
                : 'transparent',
              color: post.status === s
                ? (s === 'posted' ? '#34d399' : s === 'scheduled' ? '#a5b4fc' : 'rgba(255,255,255,.7)')
                : 'rgba(255,255,255,.35)',
              border: `1px solid ${post.status === s
                ? (s === 'posted' ? 'rgba(16,185,129,.25)' : s === 'scheduled' ? 'rgba(99,102,241,.25)' : 'rgba(255,255,255,.1)')
                : 'rgba(255,255,255,.05)'}`,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
            }}>
              {s === 'draft' ? 'טיוטה' : s === 'scheduled' ? 'מתוזמן' : 'פורסם'}
            </button>
          ))}
        </div>

        {/* Date + Time */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.7)', marginBottom: 6 }}>תאריך ושעה</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="date"
              value={post.scheduledDate}
              onChange={e => onUpdate({ ...post, scheduledDate: e.target.value, status: e.target.value ? 'scheduled' : 'draft' })}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
                color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <input
              type="time"
              value={post.scheduledTime}
              onChange={e => onUpdate({ ...post, scheduledTime: e.target.value })}
              style={{
                width: 100, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
                color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Caption */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.7)' }}>תיאור לאינסטגרם</span>
            <button
              onClick={() => onGenerateCaption(post)}
              disabled={generating}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.2)',
                color: '#a5b4fc', cursor: generating ? 'wait' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {generating ? '...' : '✨ AI'}
            </button>
          </div>
          <textarea
            value={post.caption}
            onChange={e => onUpdate({ ...post, caption: e.target.value })}
            placeholder="כתוב תיאור לפוסט..."
            rows={5}
            style={{
              width: '100%', padding: 12, boxSizing: 'border-box',
              background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit',
              lineHeight: 1.6, resize: 'vertical', outline: 'none', direction: 'rtl',
            }}
          />
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>
            {post.caption.length} תווים
          </div>
        </div>

        {/* Gallery info */}
        <div style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,.65)',
          background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)',
        }}>
          {post.galleryName} · {post.eventType || 'אירוע'}
        </div>
      </div>

      {/* Action buttons (sticky bottom) */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.06)',
        display: 'flex', gap: 8,
      }}>
        <button onClick={copyCaption} style={{
          flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
          background: copied ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${copied ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.08)'}`,
          color: copied ? '#34d399' : 'rgba(255,255,255,.7)',
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
        }}>
          {copied ? '✓ הועתק' : 'העתק תיאור'}
        </button>
        <button onClick={downloadPhoto} style={{
          flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: '#6366f1', border: 'none', color: '#fff',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          הורד תמונה
        </button>
      </div>
    </div>
  )
}
