import { border, textMuted } from '../../styles'

// Desktop public hero / mobile public / private entry screen previews.
export function CoverPreviews({ url, title }: { url: string | null; title: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px', minWidth: 180 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMuted, marginBottom: 6 }}>דסקטופ · ציבורי</div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 7', borderRadius: 8, overflow: 'hidden', background: '#0a0a0f' }}>
          {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center', color: '#fff', background: 'linear-gradient(to bottom, rgba(0,0,0,.1), rgba(0,0,0,.5))' }}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
          </div>
        </div>
      </div>
      <div style={{ width: 92 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMuted, marginBottom: 6 }}>מובייל</div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', background: '#0a0a0f', border: `2px solid ${border}` }}>
          {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 6, textAlign: 'center', color: '#fff', background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.6))' }}>
            <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          </div>
        </div>
      </div>
      <div style={{ width: 92 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMuted, marginBottom: 6 }}>מסך כניסה</div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden', background: '#0a0a0f', border: `2px solid ${border}` }}>
          {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'blur(6px) brightness(.55) saturate(.85)', transform: 'scale(1.12)' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 40%, rgba(10,10,15,.35), rgba(10,10,15,.85))' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 }}>
            <div style={{ width: 18, height: 15, borderRadius: 3, border: '1.5px solid rgba(255,255,255,.55)' }} />
            <div style={{ width: '70%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,.14)' }} />
            <div style={{ width: '70%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,.28)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
