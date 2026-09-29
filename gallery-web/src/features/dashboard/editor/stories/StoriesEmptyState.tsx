import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, border, textMuted } from '../../styles'

export function StoriesEmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '52px 20px',
      color: textMuted,
      border: `1px dashed ${border}`,
      background: bgSubtle,
    }}>
      <div style={{ marginBottom: 14, color: textMuted, opacity: 0.55, display: 'flex', justifyContent: 'center' }}>
        <Icon name="stories" size={36} strokeWidth={1.4} />
      </div>
      <div style={{ fontSize: 14 }}>
        עדיין אין סטוריז. הוסף את הראשון בלחיצה על "העלאת סטורי".
      </div>
    </div>
  )
}
