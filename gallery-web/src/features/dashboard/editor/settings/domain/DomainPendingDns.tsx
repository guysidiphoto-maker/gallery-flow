import { bgSubtle, border, textMuted, textPrimary } from '../../../styles'
import { useEditor } from '../../EditorContext'

const labelCell = { fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' } as const
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export function DomainPendingDns({ domain, token }: { domain: string; token: string }) {
  const { customDomain: { domainSaving, domainCopied, recheckCustomDomain, removeCustomDomain, copyVerificationToken } } = useEditor()
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
        המתנה לאימות DNS — עד 72 שעות
      </div>
      <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 16 }}>
        הוסיפו את רשומת ה־TXT הבאה אצל ספק הדומיין שלכם. ברגע שה־DNS יתעדכן, נאמת את הבעלות אוטומטית.
      </div>

      <div className="dash-dns-grid" style={{
        background: '#fff',
        border: `1px solid ${border}`,
        padding: '14px 16px',
        marginBottom: 16,
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        gap: '10px 14px',
        direction: 'ltr',
        unicodeBidi: 'embed',
      }}>
        <div style={labelCell}>Type</div>
        <div style={{ fontSize: 13, color: textPrimary, fontFamily: MONO }}>TXT</div>

        <div style={labelCell}>Name</div>
        <div style={{ fontSize: 13, color: textPrimary, fontFamily: MONO, overflowWrap: 'anywhere' }}>
          {`_pixflow-verify.${domain}`}
        </div>

        <div style={labelCell}>Value</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{
            flex: 1,
            fontSize: 13, color: textPrimary,
            fontFamily: MONO,
            background: bgSubtle,
            padding: '6px 10px',
            border: `1px solid ${border}`,
            overflowWrap: 'anywhere',
          }}>
            {token}
          </code>
          <button
            type="button"
            onClick={() => { void copyVerificationToken(token) }}
            style={{
              padding: '6px 12px', borderRadius: 2,
              background: 'transparent', color: textPrimary,
              border: `1px solid ${border}`,
              fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {domainCopied ? 'הועתק' : 'Copy'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={recheckCustomDomain}
          disabled={domainSaving}
          style={{
            padding: '10px 18px', borderRadius: 2,
            background: textPrimary, color: '#fff',
            border: `1px solid ${textPrimary}`,
            fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: domainSaving ? 0.6 : 1,
          }}
        >
          רענן סטטוס
        </button>
        <button
          type="button"
          onClick={removeCustomDomain}
          disabled={domainSaving}
          style={{
            padding: '10px 18px', borderRadius: 2,
            background: 'transparent', color: textPrimary,
            border: `1px solid ${border}`,
            fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: domainSaving ? 0.6 : 1,
          }}
        >
          ביטול
        </button>
      </div>
    </div>
  )
}
