import { useRef, type ChangeEvent } from 'react'
import type { PortfolioSettings } from '../portfolioSettings'
import { EditorPanel } from './EditorPanel'
import { EditorToggleRow } from './EditorToggleRow'
import { inputClass, smallButtonClass } from './classes'
import { icons } from './icons'

export function BrandSection({ settings, clientName, studioName, update }: {
  settings: PortfolioSettings
  clientName: string
  studioName: string
  update: (patch: Partial<PortfolioSettings>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update({ logoBase64: reader.result as string })
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex animate-[pe-fade-in_.3s_ease_both] flex-col gap-4">
      <EditorPanel title="לוגו" icon={icons.image}>
        {settings.logoBase64 ? (
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-white/6 bg-white/3 p-3">
              <img src={settings.logoBase64} alt="" className="block max-h-14 max-w-[140px]" />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => fileRef.current?.click()} className={smallButtonClass()}>
                {icons.upload}
                החלף
              </button>
              <button onClick={() => update({ logoBase64: '' })} className={smallButtonClass(true)}>
                {icons.trash}
                הסר
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center gap-2.5 rounded-[14px] border-2 border-dashed border-white/8 bg-white/[.015] px-4 py-7 text-[13px] font-medium text-white/35 transition-all duration-200 hover:border-(color:--accent)/25 hover:bg-(color:--accent)/[3%]"
          >
            <div className="flex size-10 items-center justify-center rounded-[10px] bg-white/4">{icons.imageLg}</div>
            העלה לוגו
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
      </EditorPanel>

      <EditorPanel title="כותרת ראשית" icon={icons.type}>
        <input value={settings.pageTitle} onChange={e => update({ pageTitle: e.target.value })} placeholder={clientName} className={inputClass} />
        <div className="mt-2 flex items-center gap-[5px] text-[11px] text-white/45">
          {icons.info}
          ברירת מחדל: שם הלקוח
        </div>
      </EditorPanel>

      <EditorPanel title="טאגליין" icon={icons.lines}>
        <input
          value={settings.tagline}
          onChange={e => update({ tagline: e.target.value })}
          placeholder="הפקות אירועים מהשורה הראשונה"
          className={inputClass}
        />
      </EditorPanel>

      <EditorPanel title="הגדרות נוספות" icon={icons.gear}>
        <div className="flex flex-col gap-1">
          <EditorToggleRow
            label="הצג באדג' סטודיו"
            description={`Powered by ${studioName}`}
            checked={settings.showStudioBadge}
            onToggle={() => update({ showStudioBadge: !settings.showStudioBadge })}
          />
          <div className="my-1 h-px bg-white/4" />
          <EditorToggleRow
            label="הצג מספר תמונות"
            description="מציג את כמות התמונות בכל גלריה"
            checked={settings.showPhotoCounts}
            onToggle={() => update({ showPhotoCounts: !settings.showPhotoCounts })}
          />
        </div>
      </EditorPanel>
    </div>
  )
}
