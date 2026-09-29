import { Button } from '../ui/Button'
import { ErrorBanner } from '../ui/ErrorBanner'
import { FormField } from '../ui/FormField'
import { Modal } from '../ui/Modal'
import AssignClientField from './AssignClientField'
import { t, type AssignmentLocale } from './strings'
import type { AssignModalState } from './useBulkAssign'

export function AssignModal({ state: m, locale }: { state: AssignModalState; locale: AssignmentLocale }) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)
  const target = m.target
  return (
    <Modal
      open={!!target}
      onClose={m.close}
      title={target?.client_id ? tr('bulk.modal.reassignTitle') : tr('bulk.modal.assignTitle')}
    >
      {target && (
        <form onSubmit={m.submit}>
          <p className="mb-[18px] text-[13.5px] text-ink-soft">
            {tr('bulk.modal.gallery')}: <strong className="text-ink">{target.name}</strong>
          </p>
          <FormField label={tr('assign.field.label')} required>
            <AssignClientField value={m.chosenClient} onChange={id => m.setChosenClient(id)} allowCreateInline locale={locale} />
          </FormField>
          {m.error && <div className="mb-3.5"><ErrorBanner text={m.error} /></div>}
          <div className="flex gap-2.5">
            <Button type="submit" variant="primary" busy={m.busy} disabled={!m.chosenClient}>
              {target.client_id ? tr('bulk.modal.submitReassign') : tr('bulk.modal.submitAssign')}
            </Button>
            <Button variant="ghost" onClick={m.close}>{tr('bulk.modal.cancel')}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
