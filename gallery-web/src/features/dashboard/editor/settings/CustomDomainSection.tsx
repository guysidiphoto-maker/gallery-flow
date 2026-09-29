import { useEditor } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { DomainUpsell } from './domain/DomainUpsell'
import { DomainVerified } from './domain/DomainVerified'
import { DomainPendingDns } from './domain/DomainPendingDns'
import { DomainForm } from './domain/DomainForm'

// Account-level setting surfaced here until a studio settings page exists:
// upsell (plan lacks it), input form, DNS-pending, or verified.
export function CustomDomainSection() {
  const { customDomain: d } = useEditor()
  return (
    <SettingsSection eyebrow="דומיין מותאם">
      {!d.customDomainEnabled ? (
        <DomainUpsell />
      ) : d.customDomainStatus === 'verified' && d.customDomain ? (
        <DomainVerified domain={d.customDomain} />
      ) : d.customDomainStatus === 'pending_dns' && d.customDomain && d.customDomainToken ? (
        <DomainPendingDns domain={d.customDomain} token={d.customDomainToken} />
      ) : (
        <DomainForm />
      )}
    </SettingsSection>
  )
}
