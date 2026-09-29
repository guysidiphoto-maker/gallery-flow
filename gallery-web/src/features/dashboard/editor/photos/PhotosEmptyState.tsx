import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, border, textMuted, textSecondary } from '../../styles'

export function PhotosEmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '80px 24px',
      background: bgSubtle, border: `1px dashed ${border}`,
    }}>
      <Icon name="photo" size={36} strokeWidth={1.2} style={{ opacity: 0.4 }} />
      <p style={{
        marginTop: 16, color: textSecondary, fontSize: 14,
        fontWeight: 500,
      }}>
        אין עדיין תמונות בגלריה הזו
      </p>
      <p style={{
        marginTop: 6, color: textMuted, fontSize: 11,
        fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>
        Drag photos anywhere · or click Add Media
      </p>
    </div>
  )
}
