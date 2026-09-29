// ZIPs are listed and validated client-side (jszip + zipRules), auto-matched to
// collections by filename, and can be re-mapped manually. No bytes leave the browser here.
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { WizardCommon, ImportCollection, ZipSlot } from '../wizardTypes'
import { listZipEntries } from '../importApi'
import { autoMatchZipToCollection } from '../zipRules'
import { ImportPanel } from '../components/ImportPanel'
import { ImportButton } from '../components/ImportButton'
import { Notice } from '../components/Notice'
import { LoadingLine } from '../components/LoadingLine'
import { ZipSlotCard } from '../components/ZipSlotCard'
import { emptyText, heading, intro } from '../components/theme'

let slotSeq = 0

export function Step3Zip({
  t, collections, zips, setZips, onBack, onNext,
}: WizardCommon & {
  collections: ImportCollection[]
  zips: ZipSlot[]
  setZips: Dispatch<SetStateAction<ZipSlot[]>>
  onBack: () => void
  onNext: () => void
}) {
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Skipped collections are not valid ZIP targets.
  const targets = collections.filter(c => c.client_match_status !== 'skip')

  const onFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setReading(true)
    const added: ZipSlot[] = []
    for (const file of Array.from(fileList)) {
      const id = `zip-${slotSeq++}`
      try {
        const listing = await listZipEntries(file)
        const autoId = autoMatchZipToCollection(
          file.name, targets.map(c => ({ id: c.id, sourceName: c.source_name })),
        )
        added.push({ id, file, listing, error: null, collectionId: autoId })
      } catch (e) {
        const msg = (e as Error)?.message === 'zip_too_large' ? 'zip_too_large' : 'zip_read_failed'
        added.push({ id, file, listing: null, error: msg, collectionId: null })
      }
    }
    setZips(prev => [...prev, ...added])
    setReading(false)
  }, [targets, setZips])

  const remap = (slotId: string, collectionId: string | null) =>
    setZips(prev => prev.map(z => z.id === slotId ? { ...z, collectionId } : z))
  const remove = (slotId: string) => setZips(prev => prev.filter(z => z.id !== slotId))

  const anyMapped = zips.some(z => z.listing && z.collectionId)
  const overCap = zips.some(z => z.listing?.summary.overJobCap)

  return (
    <ImportPanel>
      <h2 className={heading}>{t('import.step3.title')}</h2>
      <p className={intro}>{t('import.step3.intro')}</p>

      <div className="mb-4">
        <input
          ref={fileRef} type="file" accept=".zip,application/zip" multiple className="hidden"
          onChange={e => onFiles(e.target.files)}
        />
        <ImportButton variant="ghost" onClick={() => fileRef.current?.click()}>{t('import.step3.choose')}</ImportButton>
      </div>

      {reading && <div className="mb-4"><LoadingLine label={t('import.step3.reading')} /></div>}

      {zips.length === 0 && !reading && <div className={emptyText}>{t('import.common.empty')}</div>}

      <div className="flex flex-col gap-3.5">
        {zips.map(z => (
          <ZipSlotCard
            key={z.id}
            t={t}
            slot={z}
            targets={targets}
            onRemap={collectionId => remap(z.id, collectionId)}
            onRemove={() => remove(z.id)}
          />
        ))}
      </div>

      {overCap && (
        <div className="mt-4"><Notice tone="warn">{t('import.step3.totalWarning')}</Notice></div>
      )}
      {zips.length > 0 && !anyMapped && (
        <div className="mt-4"><Notice tone="warn">{t('import.step3.needAssign')}</Notice></div>
      )}

      <div className="mt-5 flex justify-between">
        <ImportButton variant="ghost" onClick={onBack}>{t('import.common.back')}</ImportButton>
        <ImportButton onClick={onNext} disabled={!anyMapped}>{t('import.step3.cta')}</ImportButton>
      </div>
    </ImportPanel>
  )
}
