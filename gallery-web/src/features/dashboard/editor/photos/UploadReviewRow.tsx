import { border, textMuted } from '../../styles'

export function UploadReviewRow({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${border}` }}>
      <span style={{ fontSize: 13, color: textMuted }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: tone }}>{n}</span>
    </div>
  )
}
