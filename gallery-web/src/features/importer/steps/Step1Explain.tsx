// Step1Explain.tsx — truthful Pixieset export recipe. Link text only, no
// scraping, no credential entry. Makes clear this is a guided MANUAL migration.

import React from 'react'
import { Panel, Button, Notice, palette } from '../ui'
import type { WizardCommon } from '../wizardTypes'

export function Step1Explain({ t, onNext }: WizardCommon & { onNext: () => void }) {
  const items: Array<'import.step1.item1' | 'import.step1.item2' | 'import.step1.item3' | 'import.step1.item4'> = [
    'import.step1.item1', 'import.step1.item2', 'import.step1.item3', 'import.step1.item4',
  ]
  return (
    <Panel>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{t('import.step1.title')}</h2>
      <p style={{ color: palette.textDim, fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>
        {t('import.step1.intro')}
      </p>
      <ol style={{ margin: '0 0 18px', paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(k => (
          <li key={k} style={{ fontSize: 14, lineHeight: 1.7 }}>{t(k)}</li>
        ))}
      </ol>
      <div style={{ marginBottom: 18 }}>
        <Notice tone="info">{t('import.step1.note')}</Notice>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onNext}>{t('import.step1.cta')}</Button>
      </div>
    </Panel>
  )
}
