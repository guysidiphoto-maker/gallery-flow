import { summarizePreset, type GalleryPreset } from '@/shared/gallery/galleryPresets'
import { border, textMuted, textPrimary } from '../../styles'
import { useEditor } from '../EditorContext'

export function PresetRow({ preset: p }: { preset: GalleryPreset }) {
  const { presets: { presetBusy, handleApplyPreset, handleSetDefaultPreset, handleRenamePreset, handleDeletePreset } } = useEditor()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '10px 12px', border: `1px solid ${border}`, borderRadius: 2, background: '#fff',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          {p.is_default && (
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#1b8a4e', background: 'rgba(45,196,121,.12)', padding: '2px 6px', borderRadius: 10,
            }}>ברירת מחדל</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summarizePreset(p).join(' · ') || 'ללא הגדרות'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button disabled={presetBusy} onClick={() => handleApplyPreset(p)} style={{
          padding: '7px 12px', borderRadius: 2, border: `1px solid ${textPrimary}`,
          background: textPrimary, color: '#fff', fontSize: 11, fontWeight: 500,
          cursor: presetBusy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: presetBusy ? 0.5 : 1,
        }}>החל</button>
        {!p.is_default && (
          <button disabled={presetBusy} onClick={() => handleSetDefaultPreset(p)} aria-label="הגדר כברירת מחדל" title="הגדר כברירת מחדל" style={{
            padding: '7px 10px', borderRadius: 2, border: `1px solid ${border}`,
            background: 'transparent', color: textPrimary, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>★</button>
        )}
        <button disabled={presetBusy} onClick={() => handleRenamePreset(p)} aria-label="שנה שם" title="שנה שם" style={{
          padding: '7px 10px', borderRadius: 2, border: `1px solid ${border}`,
          background: 'transparent', color: textPrimary, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        }}>✎</button>
        <button disabled={presetBusy} onClick={() => handleDeletePreset(p)} aria-label="מחק" title="מחק" style={{
          padding: '7px 10px', borderRadius: 2, border: `1px solid ${border}`,
          background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        }}>✕</button>
      </div>
    </div>
  )
}
