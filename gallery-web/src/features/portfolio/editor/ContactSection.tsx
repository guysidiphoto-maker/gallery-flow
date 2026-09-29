import type { PortfolioSettings } from '../portfolioSettings'
import { EditorPanel } from './EditorPanel'
import { EditorInput } from './EditorInput'
import { icons } from './icons'

export function ContactSection({ settings, update }: {
  settings: PortfolioSettings
  update: (patch: Partial<PortfolioSettings>) => void
}) {
  return (
    <div className="flex animate-[pe-fade-in_.3s_ease_both] flex-col gap-4">
      <EditorPanel title="פרטי קשר" icon={icons.phone}>
        <div className="flex flex-col gap-3.5">
          <EditorInput label="טלפון" value={settings.phone} placeholder="050-1234567" onChange={v => update({ phone: v })} icon={icons.phone} />
          <EditorInput label="אימייל" value={settings.email} placeholder="info@company.com" onChange={v => update({ email: v })} icon={icons.mail} />
          <EditorInput label="אינסטגרם" value={settings.instagram} placeholder="username (בלי @)" onChange={v => update({ instagram: v })} icon={icons.instagram} />
          <EditorInput label="אתר" value={settings.website} placeholder="www.company.com" onChange={v => update({ website: v })} icon={icons.globe} />
        </div>
      </EditorPanel>
    </div>
  )
}
