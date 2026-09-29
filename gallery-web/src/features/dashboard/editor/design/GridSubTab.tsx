import { border, textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { labelStyle } from './designStyles'

const GRID_OPTIONS = [
  {
    key: 'thumbnailSize', defaultV: 'regular',
    eyebrow: 'גודל תמונות',
    hint: 'רגיל = 4 עמ׳ · גדול = 3 עמ׳ · ענק = תמונה אחת בשורה (גם במובייל)',
    opts: [
      { id: 'regular', label: 'רגיל' },
      { id: 'large',   label: 'גדול' },
      { id: 'full',    label: 'ענק' },
    ],
  },
  {
    key: 'gridSpacing', defaultV: 'regular',
    eyebrow: 'מרווח בין תמונות',
    hint: 'רגיל = צמוד · מורווח = רווח נדיב',
    opts: [
      { id: 'regular', label: 'רגיל' },
      { id: 'large',   label: 'מורווח' },
    ],
  },
] as const

export function GridSubTab() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {GRID_OPTIONS.map(g => (
        <div key={g.key}>
          <div style={{ ...labelStyle }}>{g.eyebrow}</div>
          <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4, margin: '0 0 8px' }}>{g.hint}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {g.opts.map(o => {
              const active = ((ds[g.key] as string) || g.defaultV) === o.id
              return (
                <button key={o.id} onClick={() => updateGallerySetting(g.key, o.id)}
                  style={{
                    flex: 1, padding: '14px 16px',
                    border: `1px solid ${active ? textPrimary : border}`,
                    background: active ? '#fff' : 'transparent',
                    borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary,
                    transition: 'border-color .15s, background .15s',
                  }}>{o.label}</button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
