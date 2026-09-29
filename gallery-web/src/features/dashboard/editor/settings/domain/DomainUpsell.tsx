import { textMuted, textPrimary } from '../../../styles'

export function DomainUpsell() {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
        תכנית עסקית בלבד
      </div>
      <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 16 }}>
        חברו דומיין משלכם — למשל photos.studio-shem.co.il — ושלחו ללקוחות קישור ממותג במקום pixflow-ai.com.
      </div>
      <button
        type="button"
        onClick={() => { window.location.href = '/#pricing' }}
        style={{
          padding: '10px 18px', borderRadius: 2,
          background: textPrimary, color: '#fff',
          border: `1px solid ${textPrimary}`,
          fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        שדרוג לתכנית עסקית
      </button>
    </div>
  )
}
