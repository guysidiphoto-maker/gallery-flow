import { Button } from '@/shared/ui'
import { useEditor } from '../../EditorContext'

export function DomainVerified({ domain }: { domain: string }) {
  const { customDomain: { domainSaving, removeCustomDomain } } = useEditor()
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-sage" />
        <span className="text-[13px] font-semibold text-ink">
          הדומיין מאומת ✓
        </span>
      </div>
      <a
        href={`https://${domain}`}
        target="_blank"
        rel="noreferrer"
        className="mb-4 inline-block text-[14px] text-ink underline [direction:ltr] [unicode-bidi:embed]"
      >
        {domain}
      </a>
      <div>
        <Button
          variant="ghost"
          onClick={removeCustomDomain}
          disabled={domainSaving}
          className="px-[18px] py-2.5 text-[12px] tracking-[0.14em] disabled:cursor-wait"
        >
          {domainSaving ? 'מסיר...' : 'הסר דומיין'}
        </Button>
      </div>
    </div>
  )
}
