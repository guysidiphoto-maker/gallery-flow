import { border, statusLive, textPrimary } from '../../../styles'
import { useEditor } from '../../EditorContext'

export function DomainVerified({ domain }: { domain: string }) {
  const { customDomain: { domainSaving, removeCustomDomain } } = useEditor()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: statusLive,
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>
          הדומיין מאומת ✓
        </span>
      </div>
      <a
        href={`https://${domain}`}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-block', marginBottom: 16,
          fontSize: 14, color: textPrimary, textDecoration: 'underline',
          direction: 'ltr', unicodeBidi: 'embed',
        }}
      >
        {domain}
      </a>
      <div>
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
          {domainSaving ? 'מסיר...' : 'הסר דומיין'}
        </button>
      </div>
    </div>
  )
}
