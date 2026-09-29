import { Button } from '../ui/Button'
import { CopyField } from '../ui/CopyField'
import { Modal } from '../ui/Modal'
import type { LinkResult } from './useClientDetail'

export function LinkResultModal({ result, onClose }: { result: LinkResult | null; onClose: () => void }) {
  return (
    <Modal open={!!result} onClose={onClose} title={result?.title ?? ''}>
      {result && (
        <div>
          <p className="mb-[18px] text-[13.5px] leading-relaxed text-ink-soft">{result.note}</p>
          <CopyField value={result.link} />
          <div className="mt-5">
            <Button variant="outline" onClick={onClose}>סגור</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
