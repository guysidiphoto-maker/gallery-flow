import { useState } from 'react'
import { signInWithGoogle } from '@/shared/lib/auth'
import { useOwnerBusiness } from '@/shared/lib/useOwnerBusiness'
import { Button, Eyebrow, Icon } from '@/shared/ui'
import { useCustomDomain } from './useCustomDomain'
import { useStudioIdentity } from './useStudioIdentity'
import { useTokenBalance } from './useTokenBalance'
import { CustomDomainSection } from './components/CustomDomainSection'
import { StudioIdentitySection } from './components/StudioIdentitySection'
import { TokensSection } from './components/TokensSection'
import { BuyTokensModal } from './components/BuyTokensModal'
import { primaryAction } from './components/settingsStyles'

// Checkout (create-checkout edge function) isn't live in prod yet, so buying is
// hidden behind the billing flag while the balance stays visible.
const TOKEN_BILLING_ON = import.meta.env.VITE_FEATURE_GALLERY_BILLING === 'true'

export function StudioSettings() {
  const { user, authLoading, status, businessId } = useOwnerBusiness()
  const balance = useTokenBalance(status === 'ready' || status === 'no-business')
  const domain = useCustomDomain(businessId)
  const { identity, update, justSaved } = useStudioIdentity()
  const [showBuyTokens, setShowBuyTokens] = useState(false)

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-sm tracking-[0.02em] text-ink-soft">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="max-w-[420px] p-10 text-center">
          <h1 className="mb-3 text-[26px] font-medium tracking-[-0.015em] text-ink">הגדרות סטודיו</h1>
          <p className="mb-7 text-sm leading-[1.6] text-ink-soft">יש להתחבר כדי לצפות בהגדרות החשבון.</p>
          <Button onClick={signInWithGoogle} className={`${primaryAction} px-[22px] py-3`}>
            התחברות עם Google
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-canvas text-ink">
      <div className="flex items-center gap-3.5 border-b border-line bg-surface px-8 py-[18px]">
        <button
          type="button"
          onClick={() => { window.location.pathname = '/dashboard' }}
          aria-label="חזרה לדשבורד"
          className="flex items-center bg-transparent p-1 text-ink-soft"
        >
          <Icon name="close" size={18} strokeWidth={1.85} />
        </button>
        <div>
          <Eyebrow className="mb-1 block text-[10px] font-medium">Studio</Eyebrow>
          <h1 className="text-[22px] font-medium tracking-[-0.015em] text-ink">הגדרות סטודיו</h1>
        </div>
      </div>

      <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-6 pt-10 pb-20">
        <CustomDomainSection domain={domain} />
        <StudioIdentitySection identity={identity} onUpdate={update} justSaved={justSaved} />
        <TokensSection balance={balance} onBuy={TOKEN_BILLING_ON ? () => setShowBuyTokens(true) : undefined} />
      </div>

      {TOKEN_BILLING_ON && (
        <BuyTokensModal open={showBuyTokens} onClose={() => setShowBuyTokens(false)} balance={balance} />
      )}
    </div>
  )
}
