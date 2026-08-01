// Step3Zip.tsx — pick one or more ZIPs, list entries client-side with jszip,
// apply the shared validators (zipRules), auto-match filename → collection, and
// let the owner re-map manually. Shows a validation summary of rejected entries
// and their reasons. No bytes leave the browser here.

import React, { useCallback, useRef, useState } from 'react'
import { Panel, Button, Notice, Spinner, Chip, palette } from '../ui'
import type { WizardCommon, ImportCollection, ZipSlot } from '../wizardTypes'
import { listZipEntries } from '../importApi'
import { autoMatchZipToCollection } from '../zipRules'

let slotSeq = 0

export function Step3Zip({
  t, collections, zips, setZips, onBack, onNext,
}: WizardCommon & {
  collections: ImportCollection[]
  zips: ZipSlot[]
  setZips: React.Dispatch<React.SetStateAction<ZipSlot[]>>
  onBack: () => void
  onNext: () => void
}) {
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Only collections the owner did not skip are valid ZIP targets.
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
    <Panel>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{t('import.step3.title')}</h2>
      <p style={{ color: palette.textDim, fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>{t('import.step3.intro')}</p>

      <div style={{ marginBottom: 16 }}>
        <input
          ref={fileRef} type="file" accept=".zip,application/zip" multiple style={{ display: 'none' }}
          onChange={e => onFiles(e.target.files)}
        />
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>{t('import.step3.choose')}</Button>
      </div>

      {reading && <div style={{ marginBottom: 16 }}><Spinner label={t('import.step3.reading')} /></div>}

      {zips.length === 0 && !reading && (
        <div style={{ color: palette.textDim, fontSize: 14, padding: '12px 0' }}>{t('import.common.empty')}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {zips.map(z => {
          const s = z.listing?.summary
          return (
            <div key={z.id} style={{ background: palette.panelAlt, border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{z.file.name}</strong>
                <button onClick={() => remove(z.id)} style={{ background: 'none', border: 'none', color: palette.textDim, cursor: 'pointer', fontSize: 13 }}>
                  {t('import.common.close')}
                </button>
              </div>

              {z.error && (
                <div style={{ marginTop: 10 }}>
                  <Notice tone="danger">{z.error === 'zip_too_large' ? t('import.step3.zipTooBig') : t('import.common.error')}</Notice>
                </div>
              )}

              {s && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <Chip kind="ok">{t('import.step3.validFiles')}: {s.accepted.length}</Chip>
                    <Chip kind="neutral">{t('import.step3.skipped')}: {s.skipped.length}</Chip>
                    <Chip kind={s.rejected.length ? 'danger' : 'neutral'}>{t('import.step3.rejected')}: {s.rejected.length}</Chip>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 13, color: palette.textDim }}>{t('import.step3.assignTo')}</label>
                    <select
                      value={z.collectionId ?? ''}
                      onChange={e => remap(z.id, e.target.value || null)}
                      style={{ background: palette.panel, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
                    >
                      <option value="">{t('import.step3.unassigned')}</option>
                      {targets.map(c => (
                        <option key={c.id} value={c.id}>{c.source_name}</option>
                      ))}
                    </select>
                  </div>

                  {s.overJobCap && (
                    <div style={{ marginTop: 10 }}><Notice tone="warn">{t('import.step3.totalWarning')}</Notice></div>
                  )}

                  {s.rejected.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 13, color: palette.textDim }}>{t('import.step3.rejectedWhy')}</summary>
                      <ul style={{ margin: '8px 0 0', paddingInlineStart: 20, fontSize: 12, color: palette.textDim }}>
                        {s.rejected.slice(0, 50).map((r, i) => (
                          <li key={i}>{r.path}: {t(`import.reject.${r.reason}` as never)}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {overCap && (
        <div style={{ marginTop: 16 }}><Notice tone="warn">{t('import.step3.totalWarning')}</Notice></div>
      )}
      {zips.length > 0 && !anyMapped && (
        <div style={{ marginTop: 16 }}><Notice tone="warn">{t('import.step3.needAssign')}</Notice></div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <Button variant="ghost" onClick={onBack}>{t('import.common.back')}</Button>
        <Button onClick={onNext} disabled={!anyMapped}>{t('import.step3.cta')}</Button>
      </div>
    </Panel>
  )
}
