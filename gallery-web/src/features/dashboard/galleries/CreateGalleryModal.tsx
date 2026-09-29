import type React from 'react'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import type { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { Icon, type IconName } from '@/shared/ui/Icon'
import AssignClientField from '@/features/clients/assignment/AssignClientField'
import type { CreateGalleryState } from '../hooks/useCreateGallery'
import { bg, border, textMuted, textPrimary, textSecondary } from '../styles'
import { inputBase, labelStyle } from './createModalStyles'
import { IconOptionPicker } from './IconOptionPicker'
import { FaceRecognitionField } from './FaceRecognitionField'
import { SwitchRow } from './SwitchRow'
import { FaceConfirmDialog } from './FaceConfirmDialog'

type OwnerLocaleApi = ReturnType<typeof useOwnerLocale>

const WELCOME_OPTIONS = [
  { value: 'mosaic' as const,    label: 'פסיפס',    icon: 'sections' as IconName },
  { value: 'cinematic' as const, label: 'קולנועי', icon: 'photo'    as IconName },
  { value: 'minimal' as const,   label: 'מינימלי', icon: 'gallery'  as IconName },
]

const FEED_OPTIONS = [
  { value: 'grid' as const,     label: 'רשת',     icon: 'gallery'  as IconName },
  { value: 'masonry' as const,  label: 'אבן',     icon: 'sections' as IconName },
  { value: 'carousel' as const, label: 'קרוסלה', icon: 'arrow-out' as IconName },
]

const focusBorder = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = textPrimary }
const blurBorder = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = border }

export function CreateGalleryModal({ form, tokenBalance, locale, ownerT }: {
  form: CreateGalleryState
  tokenBalance: number
  locale: OwnerLocaleApi['locale']
  ownerT: OwnerLocaleApi['t']
}) {
  const close = () => form.setShowModal(false)
  const ref = useFocusTrap<HTMLDivElement>(true, close)
  const { newName, creating } = form
  const privacyRows = [
    { key: 'code',  on: form.requireGalleryCode, set: form.setRequireGalleryCode,
      title: 'קוד גישה לגלריה', desc: 'דרשו קוד כניסה לצפייה בגלריה' },
    { key: 'track', on: form.trackDownloads, set: form.setTrackDownloads,
      title: 'מעקב הורדות',     desc: 'עקבו אחרי הורדות לפי אימייל' },
  ] as const

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,20,19,.55)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, animation: 'overlayIn .2s ease both',
      }}
      onClick={close}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-gallery-heading"
        style={{
          background: bg,
          borderRadius: 4, padding: '40px 44px 36px', width: '90%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto' as const,
          border: `1px solid ${border}`, direction: 'rtl',
          animation: 'modalIn .3s ease both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase',
          }}>
            New Gallery
          </div>
          <button onClick={close} aria-label="סגירה" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: textSecondary, padding: 4, display: 'flex',
          }}>
            <Icon name="close" size={16} strokeWidth={1.85} />
          </button>
        </div>

        <h2 id="new-gallery-heading" style={{
          fontSize: 28, fontWeight: 500, margin: '0 0 10px',
          color: textPrimary, letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>
          יצירת גלריה חדשה
        </h2>
        <p style={{ color: textSecondary, fontSize: 14, margin: '0 0 32px', lineHeight: 1.55 }}>
          מלאו את הפרטים כדי להתחיל
        </p>

        <label style={{ display: 'block', marginBottom: 22 }}>
          <span style={labelStyle}>שם הגלריה</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => form.setNewName(e.target.value)}
            placeholder="לדוגמה: החתונה של יוסי ומיכל"
            autoFocus
            style={inputBase}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 28 }}>
          <span style={labelStyle}>תאריך אירוע</span>
          <input
            type="date"
            value={form.newDate}
            onChange={(e) => form.setNewDate(e.target.value)}
            style={inputBase}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </label>

        {/* Optional client connection; "no client yet" never blocks creation. */}
        <div data-tour="assign-gallery" style={{ display: 'block', marginBottom: 28 }}>
          <span style={{ ...labelStyle, marginBottom: 8 }}>{ownerT('assign.modalLabel')}</span>
          <AssignClientField
            value={form.newGalleryClientId}
            onChange={(clientId) => form.setNewGalleryClientId(clientId)}
            allowCreateInline
            locale={locale}
          />
        </div>

        <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

        <IconOptionPicker eyebrow="סגנון מסך פתיחה" options={WELCOME_OPTIONS} value={form.welcomeStyle} onChange={form.setWelcomeStyle} />
        <IconOptionPicker eyebrow="תצוגת פיד" options={FEED_OPTIONS} value={form.feedLayout} onChange={form.setFeedLayout} />

        <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

        <FaceRecognitionField form={form} />

        {privacyRows.map((row, i, arr) => (
          <div key={row.key} style={{ marginBottom: i === arr.length - 1 ? 0 : 18 }}>
            <SwitchRow title={row.title} desc={row.desc} on={row.on} onClick={() => row.set(!row.on)} />
            {row.key === 'code' && row.on && (
              <input
                type="text"
                value={form.galleryCode}
                onChange={(e) => form.setGalleryCode(e.target.value)}
                placeholder="הזינו קוד גישה"
                style={{ ...inputBase, marginTop: 10 }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            )}
          </div>
        ))}

        <div className="dash-modal-actions" style={{ display: 'flex', gap: 10, marginTop: 32, justifyContent: 'flex-end' }}>
          <button
            onClick={close}
            style={{
              background: 'transparent', color: textPrimary,
              border: `1px solid ${border}`,
              borderRadius: 2, padding: '12px 24px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'border-color .15s',
              letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = textPrimary }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = border }}
          >
            Cancel
          </button>
          <button
            onClick={form.createGallery}
            disabled={creating || !newName.trim()}
            style={{
              background: !newName.trim() || creating ? border : textPrimary,
              color: '#fff', border: `1px solid ${!newName.trim() || creating ? border : textPrimary}`,
              borderRadius: 2, padding: '12px 32px', fontSize: 11, fontWeight: 500,
              cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 10,
            }}
          >
            {creating ? (
              <>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.4)', borderTopColor: '#fff', animation: 'spin .6s linear infinite' }} />
                Creating
              </>
            ) : 'Create Gallery'}
          </button>
        </div>
      </div>

      {form.showFaceConfirm && (
        <FaceConfirmDialog
          tokenBalance={tokenBalance}
          onCancel={() => form.setShowFaceConfirm(false)}
          onEnable={() => { form.setFaceRecognition(true); form.setShowFaceConfirm(false) }}
        />
      )}
    </div>
  )
}
