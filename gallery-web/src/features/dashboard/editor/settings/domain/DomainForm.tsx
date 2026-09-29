import { Button, Eyebrow, Input, cn } from '@/shared/ui'
import { useEditor } from '../../EditorContext'

export function DomainForm() {
  const { customDomain: { domainInput, domainError, domainSaving, changeDomainInput, submitCustomDomain } } = useEditor()
  const blocked = domainSaving || !domainInput.trim()
  return (
    <div>
      <div className="mb-3.5 text-[12px] leading-[1.6] text-muted">
        חברו דומיין שבבעלותכם וגלריות יוצגו תחתיו במקום תחת pixflow-ai.com.
      </div>
      <label className="mb-3 block">
        <Eyebrow className="mb-2 block text-[9px] font-medium">הדומיין המותאם שלך</Eyebrow>
        <Input
          type="text"
          value={domainInput}
          onChange={(e) => changeDomainInput(e.target.value)}
          placeholder="photos.studio-shem.co.il"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn('py-3 text-left text-[14px]', domainError && 'border-danger focus:border-danger')}
        />
      </label>
      {domainError && (
        <div className="mb-3 text-[12px] leading-normal text-danger">
          {domainError}
        </div>
      )}
      <Button
        onClick={submitCustomDomain}
        disabled={blocked}
        className="px-[18px] py-2.5 text-[12px] font-semibold tracking-[0.14em] disabled:opacity-50"
      >
        {domainSaving ? 'שומר...' : 'בדוק זמינות ושמור'}
      </Button>
    </div>
  )
}
