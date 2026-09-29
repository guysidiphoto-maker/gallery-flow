// Truthful Pixieset export recipe: a guided manual migration, no scraping or credentials.
import type { WizardCommon } from '../wizardTypes'
import { ImportPanel } from '../components/ImportPanel'
import { ImportButton } from '../components/ImportButton'
import { Notice } from '../components/Notice'
import { heading, intro } from '../components/theme'

const ITEMS = ['import.step1.item1', 'import.step1.item2', 'import.step1.item3', 'import.step1.item4'] as const

export function Step1Explain({ t, onNext }: WizardCommon & { onNext: () => void }) {
  return (
    <ImportPanel>
      <h2 className={heading}>{t('import.step1.title')}</h2>
      <p className={intro}>{t('import.step1.intro')}</p>
      <ol className="mb-[18px] flex list-decimal flex-col gap-3 ps-[22px] marker:font-semibold">
        {ITEMS.map(k => (
          <li key={k} className="text-sm leading-[1.7]">{t(k)}</li>
        ))}
      </ol>
      <div className="mb-[18px]">
        <Notice tone="info">{t('import.step1.note')}</Notice>
      </div>
      <div className="flex justify-end">
        <ImportButton onClick={onNext}>{t('import.step1.cta')}</ImportButton>
      </div>
    </ImportPanel>
  )
}
