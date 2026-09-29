import { bg, border, accent, textSecondary } from './styles'

export function DashboardLoading() {
  return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: `3px solid ${border}`, borderTopColor: accent,
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ color: textSecondary, fontSize: 14, fontFamily: 'inherit', letterSpacing: '0.02em' }}>Loading...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
