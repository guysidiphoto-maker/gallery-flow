import { border, textMuted, textPrimary } from '../../../styles'
import { useEditor } from '../../EditorContext'

export function DomainForm() {
  const { customDomain: { domainInput, domainError, domainSaving, changeDomainInput, submitCustomDomain } } = useEditor()
  const blocked = domainSaving || !domainInput.trim()
  return (
    <div>
      <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 14 }}>
        חברו דומיין שבבעלותכם וגלריות יוצגו תחתיו במקום תחת pixflow-ai.com.
      </div>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase',
          display: 'block', marginBottom: 8,
        }}>הדומיין המותאם שלך</span>
        <input
          type="text"
          value={domainInput}
          onChange={(e) => changeDomainInput(e.target.value)}
          placeholder="photos.studio-shem.co.il"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 2,
            background: '#fff', border: `1px solid ${domainError ? '#A85B5B' : border}`,
            color: textPrimary, fontSize: 14, fontFamily: 'inherit',
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color .15s',
            textAlign: 'left',
          }}
          onFocus={(e) => { if (!domainError) e.currentTarget.style.borderColor = textPrimary }}
          onBlur={(e) => { if (!domainError) e.currentTarget.style.borderColor = border }}
        />
      </label>
      {domainError && (
        <div style={{ fontSize: 12, color: '#A85B5B', marginBottom: 12, lineHeight: 1.5 }}>
          {domainError}
        </div>
      )}
      <button
        type="button"
        onClick={submitCustomDomain}
        disabled={blocked}
        style={{
          padding: '10px 18px', borderRadius: 2,
          background: textPrimary, color: '#fff',
          border: `1px solid ${textPrimary}`,
          fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase',
          cursor: blocked ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          opacity: blocked ? 0.5 : 1,
        }}
      >
        {domainSaving ? 'שומר...' : 'בדוק זמינות ושמור'}
      </button>
    </div>
  )
}
