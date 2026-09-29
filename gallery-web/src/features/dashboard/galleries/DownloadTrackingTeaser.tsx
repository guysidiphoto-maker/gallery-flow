import { accentLight, border, card, textMuted } from '../styles'

// "Coming soon" teaser. Skeleton rows instead of fake emails so nobody
// mistakes them for real activity.
export function DownloadTrackingTeaser() {
  return (
    <div style={{
      marginTop: 48, padding: 28, borderRadius: 18,
      background: card, border: `1px solid ${border}`,
      backdropFilter: 'blur(8px)',
      animation: 'fadeInUp .5s ease both .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            מעקב הורדות
          </h3>
          <p style={{ fontSize: 12, color: textMuted, margin: 0 }}>
            צפו מי הוריד תמונות מהגלריות שלכם
          </p>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: 20,
          background: 'rgba(45,196,121,.08)', border: '1px solid rgba(45,196,121,.15)',
          fontSize: 11, color: accentLight, fontWeight: 600,
        }}>בקרוב</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
      }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,.02)', border: `1px solid rgba(0,0,0,.03)`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            opacity: 0.55,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                height: 10, width: '60%', borderRadius: 4,
                background: border, marginBottom: 6,
              }} />
              <div style={{
                height: 8, width: '30%', borderRadius: 4,
                background: border,
              }} />
            </div>
            <div style={{
              height: 22, width: 36, borderRadius: 8,
              background: 'rgba(45,196,121,.1)',
            }} />
          </div>
        ))}
      </div>
    </div>
  )
}
