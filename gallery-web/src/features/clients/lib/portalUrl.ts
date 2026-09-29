// Public client page URL (branded path when the business slug is known). It is
// a preview of the PUBLIC page — not impersonation and not a client session.
export function portalUrl(businessSlug: string | null, clientId: string): string {
  const base = businessSlug ? `/${businessSlug}/client/${clientId}` : `/client/${clientId}`
  return typeof window !== 'undefined' ? `${window.location.origin}${base}` : base
}
