import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import type { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { Icon, type IconName } from '@/shared/ui/Icon'
import { Button, cn, Eyebrow, Input } from '@/shared/ui'
import AssignClientField from '@/features/clients/assignment/AssignClientField'
import type { CreateGalleryState } from '../hooks/useCreateGallery'
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

const labelClass = 'mb-2 block text-[13px] font-medium text-ink'

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
      className="fixed inset-0 z-[1000] flex animate-[dash-overlay-in_.2s_ease_both] items-center justify-center bg-ink/55 backdrop-blur-[6px]"
      onClick={close}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-gallery-heading"
        className="max-h-[90vh] w-[90%] max-w-[560px] animate-[dash-modal-in_.3s_ease_both] overflow-y-auto rounded-[4px] border border-line bg-canvas px-11 pt-10 pb-9 [direction:rtl]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-[18px] flex items-center justify-between">
          <Eyebrow className="font-medium">גלריה חדשה</Eyebrow>
          <button onClick={close} aria-label="סגירה" className="flex cursor-pointer border-none bg-transparent p-1 text-ink-soft">
            <Icon name="close" size={16} strokeWidth={1.85} />
          </button>
        </div>

        <h2 id="new-gallery-heading" className="mb-2.5 text-[28px] leading-[1.1] font-medium tracking-[-0.02em] text-ink">
          יצירת גלריה חדשה
        </h2>
        <p className="mb-8 text-sm leading-[1.55] text-ink-soft">
          מלאו את הפרטים כדי להתחיל
        </p>

        <label className="mb-[22px] block">
          <span className={labelClass}>שם הגלריה</span>
          <Input
            type="text"
            value={newName}
            onChange={(e) => form.setNewName(e.target.value)}
            placeholder="לדוגמה: החתונה של יוסי ומיכל"
            autoFocus
            className="py-3"
          />
        </label>

        <label className="mb-7 block">
          <span className={labelClass}>תאריך אירוע</span>
          <Input
            type="date"
            value={form.newDate}
            onChange={(e) => form.setNewDate(e.target.value)}
            className="py-3"
          />
        </label>

        {/* Optional client connection; "no client yet" never blocks creation. */}
        <div data-tour="assign-gallery" className="mb-7 block">
          <span className={labelClass}>{ownerT('assign.modalLabel')}</span>
          <AssignClientField
            value={form.newGalleryClientId}
            onChange={(clientId) => form.setNewGalleryClientId(clientId)}
            allowCreateInline
            locale={locale}
          />
        </div>

        <div className="mt-1 mb-6 h-px bg-line" />

        <IconOptionPicker eyebrow="סגנון מסך פתיחה" options={WELCOME_OPTIONS} value={form.welcomeStyle} onChange={form.setWelcomeStyle} />
        <IconOptionPicker eyebrow="תצוגת פיד" options={FEED_OPTIONS} value={form.feedLayout} onChange={form.setFeedLayout} />

        <div className="mt-1 mb-6 h-px bg-line" />

        <FaceRecognitionField form={form} />

        {privacyRows.map((row, i, arr) => (
          <div key={row.key} className={i === arr.length - 1 ? undefined : 'mb-[18px]'}>
            <SwitchRow title={row.title} desc={row.desc} on={row.on} onClick={() => row.set(!row.on)} />
            {row.key === 'code' && row.on && (
              <Input
                type="text"
                value={form.galleryCode}
                onChange={(e) => form.setGalleryCode(e.target.value)}
                placeholder="הזינו קוד גישה"
                className="mt-2.5 py-3"
              />
            )}
          </div>
        ))}

        <div className="dash-modal-actions mt-8 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={close} className="h-11 px-6 py-0">
            ביטול
          </Button>
          <button
            onClick={form.createGallery}
            disabled={creating || !newName.trim()}
            className={cn(
              'inline-flex h-11 items-center gap-2.5 rounded-hair border px-8 text-eyebrow font-medium tracking-label text-white uppercase',
              !newName.trim() || creating ? 'cursor-not-allowed border-line bg-line' : 'cursor-pointer border-ink bg-ink',
            )}
          >
            {creating ? (
              <>
                <span className="inline-block size-3 animate-[spin_.6s_linear_infinite] rounded-full border-[1.5px] border-white/40 border-t-white" />
                יוצר גלריה…
              </>
            ) : 'יצירת גלריה'}
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
