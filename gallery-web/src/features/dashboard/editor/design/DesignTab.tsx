import { border, textMuted, textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'
import { CoverSubTab } from './CoverSubTab'
import { TypographySubTab } from './TypographySubTab'
import { ColorSubTab } from './ColorSubTab'
import { GridSubTab } from './GridSubTab'

const SUB_TABS = [
  { id: 'cover' as const, label: 'Cover' },
  { id: 'type'  as const, label: 'Typography' },
  { id: 'color' as const, label: 'Color' },
  { id: 'grid'  as const, label: 'Grid' },
]

// Design settings write delivery_settings JSONB, so they need no schema change.
export function DesignTab() {
  const { session: { designSubTab, setDesignSubTab } } = useEditor()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase', marginBottom: 10,
        }}>Design</div>
        <h3 style={{
          fontSize: 22, fontWeight: 500, margin: 0,
          letterSpacing: '-0.015em', color: textPrimary,
        }}>עיצוב הגלריה</h3>
      </div>

      <div style={{
        display: 'flex', gap: 0, borderBottom: `1px solid ${border}`,
        marginBottom: 28, overflowX: 'auto',
      }}>
        {SUB_TABS.map(t => {
          const active = designSubTab === t.id
          return (
            <button key={t.id} onClick={() => setDesignSubTab(t.id)}
              style={{
                padding: '14px 22px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11, fontWeight: 500,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                color: active ? textPrimary : textMuted,
                borderBottom: active ? `2px solid ${textPrimary}` : '2px solid transparent',
                marginBottom: -1,
                transition: 'color .15s, border-color .15s',
                flexShrink: 0,
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {designSubTab === 'cover' && <CoverSubTab />}
      {designSubTab === 'type' && <TypographySubTab />}
      {designSubTab === 'color' && <ColorSubTab />}
      {designSubTab === 'grid' && <GridSubTab />}
    </div>
  )
}
