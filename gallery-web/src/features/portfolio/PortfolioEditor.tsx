import { useEffect, useState, type CSSProperties } from 'react'
import { type PortfolioSettings, loadPortfolioSettings, savePortfolioSettings } from './portfolioSettings'
import { ensureStylesheet } from './fonts'
import type { EditorGallery, EditorSection } from './editor/options'
import { EditorHeader } from './editor/EditorHeader'
import { PreviewPane } from './editor/PreviewPane'
import { SectionTabs } from './editor/SectionTabs'
import { BrandSection } from './editor/BrandSection'
import { DesignSection } from './editor/DesignSection'
import { ContentSection } from './editor/ContentSection'
import { ContactSection } from './editor/ContactSection'
import './portfolio.css'

ensureStylesheet('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&family=Rubik:wght@300;400;500;600;700;800&family=Assistant:wght@300;400;500;600;700;800&display=swap')

interface PortfolioEditorProps {
  clientId: string
  clientName: string
  studioName: string
  galleries: EditorGallery[]
  covers: Map<string, string>
  publicUrl: string
}

export function PortfolioEditor({ clientId, clientName, studioName, galleries, covers, publicUrl }: PortfolioEditorProps) {
  const [settings, setSettings] = useState<PortfolioSettings>(() => loadPortfolioSettings(clientId))
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState<EditorSection>('brand')
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')

  useEffect(() => { savePortfolioSettings(clientId, settings) }, [settings, clientId])

  const update = (patch: Partial<PortfolioSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const save = () => {
    savePortfolioSettings(clientId, settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    // A dark "site editor" island inside the cream portal; the palette was designed against near-black.
    <div
      dir="rtl"
      className="pe-root mx-auto max-w-[1100px] rounded-[14px] bg-night px-6 py-5 text-white/90"
      style={{ '--accent': settings.accentColor } as CSSProperties}
    >
      <EditorHeader publicUrl={publicUrl} saved={saved} onSave={save} />

      <div className="flex items-start gap-5">
        <PreviewPane
          settings={settings}
          clientName={clientName}
          galleries={galleries}
          covers={covers}
          mode={previewMode}
          onModeChange={setPreviewMode}
        />

        <div className="min-w-0 flex-1">
          <SectionTabs active={activeSection} onChange={setActiveSection} />
          {activeSection === 'brand' && (
            <BrandSection settings={settings} clientName={clientName} studioName={studioName} update={update} />
          )}
          {activeSection === 'design' && (
            <DesignSection settings={settings} galleries={galleries} covers={covers} update={update} />
          )}
          {activeSection === 'content' && (
            <ContentSection settings={settings} galleries={galleries} covers={covers} update={update} />
          )}
          {activeSection === 'contact' && <ContactSection settings={settings} update={update} />}
        </div>
      </div>
    </div>
  )
}
