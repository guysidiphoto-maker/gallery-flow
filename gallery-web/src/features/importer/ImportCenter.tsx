// Five-step guided MANUAL Pixieset migration (no API, no scraping): the owner exports
// CSVs + per-collection ZIPs themselves. The job row is created lazily on leaving
// step 1, so reading the intro leaves no draft behind.
import { useCallback, useMemo, useState } from 'react'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { makeT, dirFor, type ImporterLocale } from './strings'
import { createJob, loadOwnerBusiness, type ImportCollection, type OwnerBusiness } from './importApi'
import type { StepIndex, ZipSlot, CollectionOutcome } from './wizardTypes'
import { ImportButton } from './components/ImportButton'
import { Notice } from './components/Notice'
import { StepIndicator } from './components/StepIndicator'
import { textDim, textMain } from './components/theme'
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

export default function ImportCenter({ onOpenGallery, onExit, locale: localeProp = 'he' }: ImportCenterProps) {
  const owner = useOwnerLocale()
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
    <div dir={dir} className={`${textMain} mx-auto max-w-[920px] px-1 py-2`}>
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="mb-1 text-2xl font-extrabold">{t('import.title')}</h1>
            <p className={`${textDim} text-sm`}>{t('import.subtitle')}</p>
          </div>
          {onExit && <ImportButton variant="ghost" onClick={onExit}>{t('import.common.close')}</ImportButton>}
        </div>
        <StepIndicator t={t} step={step} />
      </header>

      {bootError && (
        <div className="mb-4">
          <Notice tone="danger">{t('import.common.error')}</Notice>
        </div>
      )}

      {step === 1 && <Step1Explain {...commonProps} onNext={goToStep2} />}

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

      {booting && <div className={`${textDim} mt-3 text-[13px]`}>{t('import.common.loading')}</div>}
    </div>
  )
}
