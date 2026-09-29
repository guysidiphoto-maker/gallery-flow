// Browser-origin allowlist for write/cost endpoints. Requests without an Origin
// header (server-to-server, curl) are allowed; auth is enforced separately.
const ALLOWED_DOMAINS = ['pixflow.co.il', 'pixflow-ai.com', 'eclipsemedia.co.il']

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const host = new URL(origin).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return true
    return ALLOWED_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}
