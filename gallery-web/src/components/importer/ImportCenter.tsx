// ImportCenter.tsx — provider-agnostic Import Center (contract C7).
//
// A five-step guided MANUAL migration wizard. There is NO Pixieset API and no
// scraping: the owner exports their own CSVs + per-collection ZIPs from the
// official Pixieset UI, and this wizard turns them into piXflow draft galleries.
//
// Navigation is props-only (no router coupling): onOpenGallery? opens a created
// gallery, onExit? returns to wherever the Dashboard mounted this. The `locale`
// prop (default 'he') drives text + direction; it falls back to the owner-wide
// locale from useOwnerLocale when the prop is not pinned.
//
// State machine of the wizard mirrors the server job:
//   1 Explain → 2 CSV dry-run + mapping → 3 ZIP mapping → 4 Run → 5 Report.
// Each step owns its loading / empty / error states. The job row is created
// lazily on first entry to step 2 so a user who only reads step 1 leaves no
// draft behind.

import React, { useCallback, useMemo, useState } from 'react'
import { useOwnerLocale } from '../../lib/ownerLocale'
import { makeT, dirFor, type ImporterLocale } from './strings'
import { palette, Button, Notice } from './ui'
import { createJob, loadOwnerBusiness, type ImportCollection, type OwnerBusiness } from './importApi'
import type { StepIndex, ZipSlot, CollectionOutcome } from './wizardTypes'
import { Step1Explain } from './steps/Step1Explain'
import { Step2Csv } from './steps/Step2Csv'
import { Step3Zip } from './steps/Step3Zip'
import { Step4Run } from './steps/Step4Run'
import { Step5Report } from './steps/Step5Report'

export interface ImportCenterProps {
  /** Open a created gallery inside the Dashboard (step 5 links). */
  onOpenGallery?: (galleryId: string) => void
  /** Leave the Import Center (back to the previous Dashboard view). */
  onExit?: () => void
  /** Force a locale; when omitted, follows the owner-wide locale. Default 'he'. */
  locale?: ImporterLocale
}

const STEPS: StepIndex[] = [1, 2, 3, 4, 5]

export default function ImportCenter({ onOpenGallery, onExit, locale: localeProp = 'he' }: ImportCenterProps) {
  const owner = useOwnerLocale()
  // The explicit prop wins; otherwise follow the owner-wide locale.
  const locale: ImporterLocale = localeProp ?? (owner.locale as ImporterLocale)
  const dir = dirFor(locale)
  const t = useMemo(() => makeT(locale), [locale])

  const [step, setStep] = useState<StepIndex>(1)
  const [jobId, setJobId] = useState<string | null>(null)
  const [business, setBusiness] = useState<OwnerBusiness | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [booting, setBooting] = useState(false)

  const [collections, setCollections] = useState<ImportCollection[]>([])
  const [zips, setZips] = useState<ZipSlot[]>([])
  const [outcomes, setOutcomes] = useState<CollectionOutcome[]>([])

  // Lazily create the job + resolve the business when the owner leaves step 1.
  const ensureJob = useCallback(async (): Promise<boolean> => {
    if (jobId && business) return true
    setBooting(true); setBootError(null)
    try {
      const biz = business ?? await loadOwnerBusiness()
      if (!biz) { setBootError('no_business'); return false }
      setBusiness(biz)
      let id = jobId
      if (!id) {
        const created = await createJob('pixieset', 'photos_zip')
        if (!created.ok || !created.job_id) { setBootError(created.error ?? 'create_failed'); return false }
        id = created.job_id
        setJobId(id)
      }
      return true
    } catch {
      setBootError('boot_failed')
      return false
    } finally {
      setBooting(false)
    }
  }, [jobId, business])

  const goToStep2 = useCallback(async () => {
    const ok = await ensureJob()
    if (ok) setStep(2)
  }, [ensureJob])

  const commonProps = { t, dir, locale }

  return (
    <div dir={dir} style={{ color: palette.text, maxWidth: 920, margin: '0 auto', padding: '8px 4px' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>{t('import.title')}</h1>
            <p style={{ color: palette.textDim, fontSize: 14, margin: 0 }}>{t('import.subtitle')}</p>
          </div>
          {onExit && (
            <Button variant="ghost" onClick={onExit}>{t('import.common.close')}</Button>
          )}
        </div>

        {/* Step indicator */}
        <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '16px 0 0', flexWrap: 'wrap' }}>
          {STEPS.map(s => {
            const active = s === step
            const done = s < step
            return (
              <li key={s} style={{
                fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
                background: active ? palette.accent : done ? 'rgba(91,140,255,.15)' : palette.panelAlt,
                color: active ? palette.accentText : done ? palette.accent : palette.textDim,
                border: `1px solid ${active ? palette.accent : palette.border}`,
              }}>
                {s}. {t(`import.step${s}.title` as never).replace(/^.*?:\s*/, '')}
              </li>
            )
          })}
        </ol>
      </header>

      {bootError && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="danger">{t('import.common.error')}</Notice>
        </div>
      )}

      {step === 1 && (
        <Step1Explain {...commonProps} onNext={goToStep2} />
      )}

      {step === 2 && jobId && (
        <Step2Csv
          {...commonProps}
          jobId={jobId}
          collections={collections}
          setCollections={setCollections}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && jobId && (
        <Step3Zip
          {...commonProps}
          collections={collections}
          zips={zips}
          setZips={setZips}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && jobId && business && (
        <Step4Run
          {...commonProps}
          jobId={jobId}
          business={business}
          collections={collections}
          zips={zips}
          onBack={() => setStep(3)}
          onFinished={out => { setOutcomes(out); setStep(5) }}
        />
      )}

      {step === 5 && jobId && (
        <Step5Report
          {...commonProps}
          jobId={jobId}
          outcomes={outcomes}
          onOpenGallery={onOpenGallery}
          onDone={() => onExit?.()}
        />
      )}

      {booting && (
        <div style={{ marginTop: 12, fontSize: 13, color: palette.textDim }}>{t('import.common.loading')}</div>
      )}
    </div>
  )
}
