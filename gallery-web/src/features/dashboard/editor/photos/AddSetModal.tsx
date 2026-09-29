import { Icon } from '@/shared/ui/Icon'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { border, textMuted, textPrimary, textSecondary } from '../../styles'
import { useEditor } from '../EditorContext'

// "New Photo Set" dialog: name + optional description shown to clients.
export function AddSetModal() {
  const { sections: sec } = useEditor()
  const { newSectionName, setNewSectionName, newSectionDesc, setNewSectionDesc, setShowAddSetModal, addSection } = sec
  const dialogRef = useFocusTrap<HTMLDivElement>(true, () => setShowAddSetModal(false))

  return (
    <div
      onClick={() => setShowAddSetModal(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'overlayIn .2s ease both',
      }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-set-heading"
        onClick={e => e.stopPropagation()}
        className="dash-mobile-modal"
        style={{
          background: '#fff',
          width: 'calc(100vw - 40px)', maxWidth: 480,
          padding: '40px 40px 32px',
          border: `1px solid ${border}`,
          animation: 'modalIn .25s ease both',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 28,
        }}>
          <h3 id="add-set-heading" style={{
            fontSize: 12, fontWeight: 500, margin: 0, color: textPrimary,
            letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>New Photo Set</h3>
          <button onClick={() => setShowAddSetModal(false)} aria-label="Close" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: textSecondary, padding: 4, display: 'flex',
          }}>
            <Icon name="close" size={16} strokeWidth={1.85} />
          </button>
        </div>

        <label style={{ display: 'block', marginBottom: 24 }}>
          <span style={{
            display: 'block', marginBottom: 8,
            fontSize: 13, fontWeight: 500, color: textPrimary,
          }}>Photo Set Name</span>
          <input
            autoFocus
            type="text"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newSectionName.trim()) addSection() }}
            placeholder="לדוגמה: טקס, קבלת פנים, הכנות"
            style={{
              width: '100%', padding: '12px 14px',
              border: `1px solid ${border}`, borderRadius: 2,
              background: '#fff', color: textPrimary,
              fontSize: 14, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 28 }}>
          <span style={{
            display: 'block', marginBottom: 8,
            fontSize: 13, fontWeight: 500, color: textPrimary,
          }}>Description</span>
          <textarea
            value={newSectionDesc}
            onChange={(e) => setNewSectionDesc(e.target.value.slice(0, 500))}
            placeholder="אופציונלי"
            rows={4}
            style={{
              width: '100%', padding: '12px 14px',
              border: `1px solid ${border}`, borderRadius: 2,
              background: '#fff', color: textPrimary,
              fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{
            marginTop: 6, fontSize: 11, color: textMuted,
            letterSpacing: '0.04em',
          }}>{newSectionDesc.length} / 500</div>
        </label>

        <p style={{
          fontSize: 12, color: textSecondary, marginBottom: 24, lineHeight: 1.5,
        }}>
          התיאור מוצג ללקוחות שלך כשהם רואים את הקטע הזה — מצוין לסטוריטלינג.
        </p>

        <div className="dash-modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setShowAddSetModal(false)} style={{
            padding: '10px 22px', borderRadius: 2,
            background: 'transparent', border: `1px solid ${border}`,
            color: textPrimary, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>Cancel</button>
          <button onClick={addSection} disabled={!newSectionName.trim()} style={{
            padding: '10px 28px', borderRadius: 2,
            background: newSectionName.trim() ? textPrimary : border,
            border: `1px solid ${newSectionName.trim() ? textPrimary : border}`,
            color: '#fff',
            cursor: newSectionName.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}
