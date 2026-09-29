import { TOKEN_BILLING_ON } from './lib/billing'
import { bgSubtle, border, textMuted, textPrimary, textSecondary } from './styles'

// Sidebar token balance. Clickable (opens the buy modal) only when checkout is live.
export function TokenBalanceCard({ tokenBalance, onBuyTokens }: { tokenBalance: number; onBuyTokens: () => void }) {
  const low = tokenBalance < 50
  return (
    <button
      onClick={TOKEN_BILLING_ON ? onBuyTokens : undefined}
      style={{
        background: bgSubtle,
        border: `1px solid ${border}`,
        borderRadius: 4, padding: '16px 18px',
        cursor: TOKEN_BILLING_ON ? 'pointer' : 'default', fontFamily: 'inherit',
        color: textPrimary, textAlign: 'right' as const,
        transition: 'border-color .2s, background .2s',
        marginBottom: 16,
      }}
      onMouseEnter={TOKEN_BILLING_ON ? (e => { e.currentTarget.style.borderColor = textPrimary }) : undefined}
      onMouseLeave={TOKEN_BILLING_ON ? (e => { e.currentTarget.style.borderColor = border }) : undefined}
    >
      <div style={{
        fontSize: 10, color: textMuted, marginBottom: 8,
        fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span>Tokens</span>
        {low && <span style={{ color: '#A67C52', letterSpacing: '0.14em' }}>Low</span>}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 500, color: textPrimary,
        marginBottom: 10, letterSpacing: '-0.02em', lineHeight: 1,
      }}>
        {tokenBalance.toLocaleString('he-IL')}
      </div>
      {TOKEN_BILLING_ON && (
        <div style={{
          fontSize: 11, fontWeight: 500, color: textSecondary,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6,
          paddingTop: 10, borderTop: `1px solid ${border}`,
        }}>
          Buy more
          <span style={{ marginInlineStart: 'auto' }}>→</span>
        </div>
      )}
    </button>
  )
}
