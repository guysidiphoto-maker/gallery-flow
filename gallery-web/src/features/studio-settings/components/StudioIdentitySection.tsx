import { Eyebrow, Input, Panel, Toggle, cn } from '@/shared/ui'
import type { StudioIdentity } from '../useStudioIdentity'
import { fieldInput, fieldLabel, helpText } from './settingsStyles'

const urlInputProps = { dir: 'ltr', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const

export function StudioIdentitySection({ identity, onUpdate, justSaved }: {
  identity: StudioIdentity
  onUpdate: <K extends keyof StudioIdentity>(key: K, value: StudioIdentity[K]) => void
  justSaved: boolean
}) {
  return (
    <Panel eyebrow="זהות הסטודיו" className="pb-5">
      <div className={cn(helpText, 'mb-[18px]')}>
        הגדרות אלו ישמשו כברירת מחדל לגלריות חדשות (החלה על גלריות קיימות תגיע בקרוב).
      </div>

      <div className="flex flex-col gap-4">
        <label className="block">
          <Eyebrow className={fieldLabel}>שם הסטודיו</Eyebrow>
          <Input
            type="text"
            value={identity.studioName}
            onChange={e => onUpdate('studioName', e.target.value)}
            placeholder="לדוגמה: סטודיו שם"
            className={cn(fieldInput, 'text-right')}
          />
        </label>

        <label className="block">
          <Eyebrow className={fieldLabel}>אתר הסטודיו</Eyebrow>
          <Input
            type="url"
            value={identity.studioWebsite}
            onChange={e => onUpdate('studioWebsite', e.target.value)}
            placeholder="https://studio-shem.co.il"
            {...urlInputProps}
            className={cn(fieldInput, 'text-left')}
          />
        </label>

        <label className="block">
          <Eyebrow className={fieldLabel}>קישור ללוגו</Eyebrow>
          <Input
            type="url"
            value={identity.logoUrl}
            onChange={e => onUpdate('logoUrl', e.target.value)}
            placeholder="https://…/logo.png"
            {...urlInputProps}
            className={cn(fieldInput, 'text-left')}
          />
          {identity.logoUrl && (
            <div className="mt-2.5 flex items-center gap-3 border border-line bg-raised p-3">
              <img
                src={identity.logoUrl}
                alt="תצוגת לוגו"
                className="h-9 w-auto object-contain"
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              <span className="text-[11px] tracking-[0.12em] text-muted uppercase">Preview</span>
            </div>
          )}
        </label>

        <div className="flex items-center justify-between border-t border-line py-3.5">
          <div className="flex-1 pe-4">
            <div className="mb-1 text-[13px] font-medium text-ink">הצג קרדיט בתחתית הגלריה</div>
            <div className="text-xs leading-normal text-muted">
              הוספת "Powered by Pixflow" בפוטר. ניתן לכבות בתכניות העסקיות.
            </div>
          </div>
          <Toggle
            checked={identity.showFooterCredit}
            onChange={next => onUpdate('showFooterCredit', next)}
          />
        </div>
      </div>

      {/* Confirms the local write stuck. */}
      <div className="mt-3 flex min-h-[18px] justify-start">
        {justSaved && (
          <span className="text-[10px] font-medium tracking-label text-sage uppercase">נשמר</span>
        )}
      </div>
    </Panel>
  )
}
