import React, { useEffect, useRef, useState } from 'react'
import { useAuth, signInWithGoogle } from '../lib/auth'
import { supabase } from '../supabase'
import { getMyTokenBalance, startCheckout, TOKEN_PACKAGES } from '../lib/tokenClient'
import { Icon } from '../components/Icon'
import { useFocusTrap } from '../lib/useFocusTrap'

// Token-pack buying (the "קנו עוד" button → buy-tokens modal → startCheckout)
// is gated behind the gallery-billing flag. The create-checkout edge function
// is NOT deployed to prod, so any "buy" click would dead-end in an error. Until
// checkout is real, hide the buy affordances while KEEPING the balance display
// so photographers can still see their tokens. Flip
// VITE_FEATURE_GALLERY_BILLING=true once checkout is live.
const TOKEN_BILLING_ON = import.meta.env.VITE_FEATURE_GALLERY_BILLING === 'true'

// ── Theme tokens ──────────────────────────────────────────────────────────────
// Mirror the editorial-minimal palette used by Dashboard.tsx so the Studio
// Settings page reads as a sibling surface and not a different product. Keeping
// the values copied (not imported) avoids leaking dashboard internals; the
// page is small enough that a few duplicated constants are cheaper than the
// dependency.
const bg = '#F2EFE9'
const bgSubtle = '#FAF9F5'
const card = '#FBFBF9'
const border = '#D0D0D0'
const textPrimary = '#141413'
const textSecondary = '#333333'
const textMuted = '#767470'
const accent = '#141413'
const accentLight = '#000000'
const accentGlow = 'rgba(20,20,19,.08)'
const statusLive = '#7B8F6E'

// Editorial section shell — eyebrow + cream panel. Identical visual to the
// per-gallery Settings Section so photographers feel at home moving between
// the two surfaces.
function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: '24px 24px 20px',
      background: bgSubtle,
      border: `1px solid ${border}`,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 14,
      }}>{eyebrow}</div>
      {children}
    </section>
  )
}

// Studio-level identity fields. The plan is to apply these as defaults to new
// galleries (and offer a "sync to existing" action) once the backend writes
// land. For now we persist them in localStorage so the page is interactive
// and the user can see the form working — wiring to galleries is a follow-up.
const STUDIO_IDENTITY_KEY = 'pixflow.studioIdentity.v1'
type StudioIdentity = {
  studioName: string
  studioWebsite: string
  logoUrl: string
  showFooterCredit: boolean
}
const DEFAULT_IDENTITY: StudioIdentity = {
  studioName: '',
  studioWebsite: '',
  logoUrl: '',
  showFooterCredit: true,
}

function loadIdentity(): StudioIdentity {
  if (typeof window === 'undefined') return DEFAULT_IDENTITY
  try {
    const raw = window.localStorage.getItem(STUDIO_IDENTITY_KEY)
    if (!raw) return DEFAULT_IDENTITY
    const parsed = JSON.parse(raw) as Partial<StudioIdentity>
    return { ...DEFAULT_IDENTITY, ...parsed }
  } catch {
    return DEFAULT_IDENTITY
  }
}

export function StudioSettings() {
  const { user, loading } = useAuth()

  // ── Business + tokens ───────────────────────────────────────────────────────
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState<number>(0)
  const [showBuyTokens, setShowBuyTokens] = useState(false)
  const buyTokensRef = useFocusTrap<HTMLDivElement>(showBuyTokens, () => setShowBuyTokens(false))

  // ── Custom domain (account-level) ──────────────────────────────────────────
  // Lifted verbatim from Dashboard.tsx — same state shape, same RPC, same DNS
  // copy/paste flow. The behavioral contract must not change for photographers
  // who have already started a domain claim.
  type CustomDomainStatus = 'unverified' | 'pending_dns' | 'verified' | 'error'
  const [customDomainEnabled, setCustomDomainEnabled] = useState<boolean>(false)
  const [customDomain, setCustomDomain] = useState<string | null>(null)
  const [customDomainStatus, setCustomDomainStatus] = useState<CustomDomainStatus>('unverified')
  const [customDomainToken, setCustomDomainToken] = useState<string | null>(null)
  const [domainInput, setDomainInput] = useState<string>('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainCopied, setDomainCopied] = useState(false)

  // ── Studio identity (local-only for now) ───────────────────────────────────
  const [identity, setIdentity] = useState<StudioIdentity>(loadIdentity)
  const [identitySavedAt, setIdentitySavedAt] = useState<number | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve the photographer's business + plan. Mirrors Dashboard.initBusiness
  // intentionally rather than refactoring it out — the two surfaces share
  // logic but are deployed independently, and the shape might diverge.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (biz?.id) setBusinessId(biz.id)
      const balance = await getMyTokenBalance()
      if (cancelled) return
      setTokenBalance(balance)
    })()
    return () => { cancelled = true }
  }, [user])

  // Pull the plan flag + current domain claim once the business id is known.
  // Both queries are RLS-scoped; failures fall back to the upsell card.
  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const planPromise = supabase.rpc('get_my_plan')
      const bizPromise = supabase
        .from('businesses')
        .select('custom_domain, custom_domain_status, custom_domain_verification_token')
        .eq('id', businessId)
        .maybeSingle()
      const [{ data: planRows }, { data: bizRow }] = await Promise.all([planPromise, bizPromise])
      if (cancelled) return
      const plan = Array.isArray(planRows) ? planRows[0] : planRows
      setCustomDomainEnabled(Boolean((plan as { custom_domain_enabled?: boolean } | null)?.custom_domain_enabled))
      const row = bizRow as {
        custom_domain?: string | null
        custom_domain_status?: CustomDomainStatus | null
        custom_domain_verification_token?: string | null
      } | null
      setCustomDomain(row?.custom_domain ?? null)
      setCustomDomainStatus((row?.custom_domain_status as CustomDomainStatus) ?? 'unverified')
      setCustomDomainToken(row?.custom_domain_verification_token ?? null)
    })()
    return () => { cancelled = true }
  }, [businessId])

  // ── Custom domain helpers — lifted verbatim from Dashboard.tsx ─────────────
  async function submitCustomDomain() {
    const candidate = domainInput.trim().toLowerCase()
    if (!candidate) {
      setDomainError('יש להזין דומיין')
      return
    }
    setDomainSaving(true)
    setDomainError(null)
    try {
      const { data, error } = await supabase.rpc('set_business_custom_domain', { p_domain: candidate })
      if (error) {
        setDomainError('שגיאה בשמירה — נסו שוב')
        return
      }
      const result = data as {
        ok: boolean
        domain?: string
        verification_token?: string
        dns_record?: { type: string; name: string; value: string }
        error?: string
      } | null
      if (!result?.ok) {
        setDomainError(domainErrorToHebrew(result?.error))
        return
      }
      setCustomDomain(result.domain ?? candidate)
      setCustomDomainToken(result.verification_token ?? null)
      setCustomDomainStatus('pending_dns')
      setDomainInput('')
    } finally {
      setDomainSaving(false)
    }
  }

  async function recheckCustomDomain() {
    if (!businessId) return
    const { data } = await supabase
      .from('businesses')
      .select('custom_domain, custom_domain_status, custom_domain_verification_token')
      .eq('id', businessId)
      .maybeSingle()
    const row = data as {
      custom_domain?: string | null
      custom_domain_status?: 'unverified' | 'pending_dns' | 'verified' | 'error' | null
      custom_domain_verification_token?: string | null
    } | null
    if (row) {
      setCustomDomain(row.custom_domain ?? null)
      setCustomDomainStatus((row.custom_domain_status as 'unverified' | 'pending_dns' | 'verified' | 'error') ?? 'unverified')
      setCustomDomainToken(row.custom_domain_verification_token ?? null)
    }
  }

  async function removeCustomDomain() {
    if (!businessId) return
    setDomainSaving(true)
    try {
      await supabase
        .from('businesses')
        .update({
          custom_domain: null,
          custom_domain_status: 'unverified',
          custom_domain_verification_token: null,
          custom_domain_added_at: null,
          custom_domain_verified_at: null,
        })
        .eq('id', businessId)
      setCustomDomain(null)
      setCustomDomainStatus('unverified')
      setCustomDomainToken(null)
      setDomainError(null)
    } finally {
      setDomainSaving(false)
    }
  }

  function domainErrorToHebrew(code: string | undefined): string {
    switch (code) {
      case 'invalid_format':    return 'פורמט דומיין לא תקין — לדוגמה: photos.studio-shem.co.il'
      case 'reserved_domain':   return 'לא ניתן להשתמש בדומיין זה'
      case 'plan_not_eligible': return 'דומיין מותאם זמין רק בתכנית עסקית'
      case 'domain_taken':      return 'דומיין זה כבר בשימוש'
      case 'empty_domain':      return 'יש להזין דומיין'
      case 'no_business':       return 'לא נמצא חשבון עסקי'
      case 'not_authenticated': return 'יש להתחבר מחדש'
      default:                  return 'שגיאה לא צפויה — נסו שוב'
    }
  }

  // ── Identity helpers ───────────────────────────────────────────────────────
  // Debounced "saved" pill: update state immediately, persist to localStorage,
  // then briefly show a confirmation chip so the user knows the change stuck.
  function updateIdentity<K extends keyof StudioIdentity>(key: K, value: StudioIdentity[K]) {
    setIdentity(prev => {
      const next = { ...prev, [key]: value }
      try { window.localStorage.setItem(STUDIO_IDENTITY_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setIdentitySavedAt(Date.now())
    savedTimer.current = setTimeout(() => setIdentitySavedAt(null), 1800)
  }

  // ── Render — gates ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ color: textSecondary, fontSize: 14, letterSpacing: '0.02em' }}>Loading…</div>
      </div>
    )
  }

  if (!user) {
    // Mirror the Dashboard sign-in gate so a deep-link to /studio-settings
    // doesn't dead-end on a blank screen for signed-out visitors.
    return (
      <div style={{
        background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'inherit', direction: 'rtl',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 40 }}>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: '0 0 12px', color: textPrimary, letterSpacing: '-0.015em' }}>
            הגדרות סטודיו
          </h1>
          <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 28px', lineHeight: 1.6 }}>
            יש להתחבר כדי לצפות בהגדרות החשבון.
          </p>
          <button
            onClick={signInWithGoogle}
            style={{
              padding: '12px 22px', borderRadius: 2,
              background: textPrimary, color: '#fff', border: `1px solid ${textPrimary}`,
              fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            התחברות עם Google
          </button>
        </div>
      </div>
    )
  }

  // ── Render — main page ─────────────────────────────────────────────────────
  return (
    <div style={{
      background: bg, minHeight: '100vh', fontFamily: 'inherit',
      direction: 'rtl', color: textPrimary,
    }}>
      {/* Topbar — back button + page title. Matches the gallery-editor topbar
          rhythm so the surface reads as a sibling, not a popover. */}
      <div style={{
        padding: '18px 32px', borderBottom: `1px solid ${border}`,
        background: bgSubtle,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => { window.location.pathname = '/dashboard' }}
          aria-label="חזרה לדשבורד"
          style={{
            background: 'none', border: 'none', color: textSecondary, cursor: 'pointer',
            padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <Icon name="close" size={18} strokeWidth={1.85} />
        </button>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 4,
          }}>
            Studio
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 500, margin: 0,
            letterSpacing: '-0.015em', color: textPrimary,
          }}>
            הגדרות סטודיו
          </h1>
        </div>
      </div>

      {/* Body — narrow column, three sections, generous spacing. */}
      <div style={{
        maxWidth: 760, margin: '0 auto',
        padding: '40px 24px 80px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* ── Domain (account-level) ────────────────────────────────────────
            Three states: upsell (plan doesn't include it), input form (no
            domain set), DNS-pending card with copy + verify, or verified
            card with a remove button. Lifted from Dashboard.tsx unchanged. */}
        <Section eyebrow="דומיין מותאם">
          {!customDomainEnabled ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
                תכנית עסקית בלבד
              </div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 16 }}>
                חברו דומיין משלכם — למשל photos.studio-shem.co.il — ושלחו ללקוחות קישור ממותג במקום pixflow-ai.com.
              </div>
              <button
                type="button"
                onClick={() => { window.location.href = '/#pricing' }}
                style={{
                  padding: '10px 18px', borderRadius: 2,
                  background: textPrimary, color: '#fff',
                  border: `1px solid ${textPrimary}`,
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                  textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                שדרוג לתכנית עסקית
              </button>
            </div>
          ) : customDomainStatus === 'verified' && customDomain ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: statusLive,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>
                  הדומיין מאומת ✓
                </span>
              </div>
              <a
                href={`https://${customDomain}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block', marginBottom: 16,
                  fontSize: 14, color: textPrimary, textDecoration: 'underline',
                  direction: 'ltr', unicodeBidi: 'embed',
                }}
              >
                {customDomain}
              </a>
              <div>
                <button
                  type="button"
                  onClick={removeCustomDomain}
                  disabled={domainSaving}
                  style={{
                    padding: '10px 18px', borderRadius: 2,
                    background: 'transparent', color: textPrimary,
                    border: `1px solid ${border}`,
                    fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                    opacity: domainSaving ? 0.6 : 1,
                  }}
                >
                  {domainSaving ? 'מסיר...' : 'הסר דומיין'}
                </button>
              </div>
            </div>
          ) : customDomainStatus === 'pending_dns' && customDomain && customDomainToken ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
                המתנה לאימות DNS — עד 72 שעות
              </div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 16 }}>
                הוסיפו את רשומת ה־TXT הבאה אצל ספק הדומיין שלכם. ברגע שה־DNS יתעדכן, נאמת את הבעלות אוטומטית.
              </div>

              <div style={{
                background: '#fff',
                border: `1px solid ${border}`,
                padding: '14px 16px',
                marginBottom: 16,
                display: 'grid',
                gridTemplateColumns: '88px 1fr',
                gap: '10px 14px',
                direction: 'ltr',
                unicodeBidi: 'embed',
              }}>
                <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Type</div>
                <div style={{ fontSize: 13, color: textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>TXT</div>

                <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Name</div>
                <div style={{ fontSize: 13, color: textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>
                  {`_pixflow-verify.${customDomain}`}
                </div>

                <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.22em', color: textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Value</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{
                    flex: 1,
                    fontSize: 13, color: textPrimary,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    background: bgSubtle,
                    padding: '6px 10px',
                    border: `1px solid ${border}`,
                    overflowWrap: 'anywhere',
                  }}>
                    {customDomainToken}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(customDomainToken)
                        setDomainCopied(true)
                        setTimeout(() => setDomainCopied(false), 1500)
                      } catch {
                        // Clipboard may be blocked. Value is visible on screen.
                      }
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: 2,
                      background: 'transparent', color: textPrimary,
                      border: `1px solid ${border}`,
                      fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      cursor: 'pointer', fontFamily: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    {domainCopied ? 'הועתק' : 'Copy'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={recheckCustomDomain}
                  disabled={domainSaving}
                  style={{
                    padding: '10px 18px', borderRadius: 2,
                    background: textPrimary, color: '#fff',
                    border: `1px solid ${textPrimary}`,
                    fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                    opacity: domainSaving ? 0.6 : 1,
                  }}
                >
                  בדוק שוב עכשיו
                </button>
                <button
                  type="button"
                  onClick={removeCustomDomain}
                  disabled={domainSaving}
                  style={{
                    padding: '10px 18px', borderRadius: 2,
                    background: 'transparent', color: textPrimary,
                    border: `1px solid ${border}`,
                    fontSize: 12, fontWeight: 500, letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: domainSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                    opacity: domainSaving ? 0.6 : 1,
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 14 }}>
                חברו דומיין שבבעלותכם וגלריות יוצגו תחתיו במקום תחת pixflow-ai.com.
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{
                  fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                  color: textMuted, textTransform: 'uppercase',
                  display: 'block', marginBottom: 8,
                }}>הדומיין המותאם שלך</span>
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => { setDomainInput(e.target.value); setDomainError(null) }}
                  placeholder="photos.studio-shem.co.il"
                  dir="ltr"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 2,
                    background: '#fff', border: `1px solid ${domainError ? '#A85B5B' : border}`,
                    color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color .15s',
                    textAlign: 'left',
                  }}
                  onFocus={(e) => { if (!domainError) e.currentTarget.style.borderColor = textPrimary }}
                  onBlur={(e) => { if (!domainError) e.currentTarget.style.borderColor = border }}
                />
              </label>
              {domainError && (
                <div style={{ fontSize: 12, color: '#A85B5B', marginBottom: 12, lineHeight: 1.5 }}>
                  {domainError}
                </div>
              )}
              <button
                type="button"
                onClick={submitCustomDomain}
                disabled={domainSaving || !domainInput.trim()}
                style={{
                  padding: '10px 18px', borderRadius: 2,
                  background: textPrimary, color: '#fff',
                  border: `1px solid ${textPrimary}`,
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  cursor: (domainSaving || !domainInput.trim()) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: (domainSaving || !domainInput.trim()) ? 0.5 : 1,
                }}
              >
                {domainSaving ? 'שומר...' : 'בדוק זמינות ושמור'}
              </button>
            </div>
          )}
        </Section>

        {/* ── Studio Identity ───────────────────────────────────────────────
            Studio-level defaults: name, website, logo, footer credit. These
            are persisted locally for now and don't write to existing
            galleries — the cross-gallery apply is a follow-up PR. We surface
            this caveat in the eyebrow copy so photographers aren't surprised
            when their changes don't appear inside a published gallery yet. */}
        <Section eyebrow="זהות הסטודיו">
          <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.6, marginBottom: 18 }}>
            הגדרות אלו ישמשו כברירת מחדל לגלריות חדשות (החלה על גלריות קיימות תגיע בקרוב).
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Studio name */}
            <label style={{ display: 'block' }}>
              <span style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase',
                display: 'block', marginBottom: 8,
              }}>שם הסטודיו</span>
              <input
                type="text"
                value={identity.studioName}
                onChange={e => updateIdentity('studioName', e.target.value)}
                placeholder="לדוגמה: סטודיו שם"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 2,
                  background: '#fff', border: `1px solid ${border}`,
                  color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s', textAlign: 'right',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                onBlur={e => { e.currentTarget.style.borderColor = border }}
              />
            </label>

            {/* Studio website */}
            <label style={{ display: 'block' }}>
              <span style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase',
                display: 'block', marginBottom: 8,
              }}>אתר הסטודיו</span>
              <input
                type="url"
                value={identity.studioWebsite}
                onChange={e => updateIdentity('studioWebsite', e.target.value)}
                placeholder="https://studio-shem.co.il"
                dir="ltr"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 2,
                  background: '#fff', border: `1px solid ${border}`,
                  color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s', textAlign: 'left',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                onBlur={e => { e.currentTarget.style.borderColor = border }}
              />
            </label>

            {/* Logo URL */}
            <label style={{ display: 'block' }}>
              <span style={{
                fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase',
                display: 'block', marginBottom: 8,
              }}>קישור ללוגו</span>
              <input
                type="url"
                value={identity.logoUrl}
                onChange={e => updateIdentity('logoUrl', e.target.value)}
                placeholder="https://…/logo.png"
                dir="ltr"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 2,
                  background: '#fff', border: `1px solid ${border}`,
                  color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s', textAlign: 'left',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                onBlur={e => { e.currentTarget.style.borderColor = border }}
              />
              {identity.logoUrl && (
                <div style={{
                  marginTop: 10, padding: 12,
                  background: '#fff', border: `1px solid ${border}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <img
                    src={identity.logoUrl}
                    alt="תצוגת לוגו"
                    style={{ height: 36, width: 'auto', objectFit: 'contain' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  <span style={{ fontSize: 11, color: textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Preview
                  </span>
                </div>
              )}
            </label>

            {/* Footer credit toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 0', borderTop: `1px solid ${border}`,
            }}>
              <div style={{ flex: 1, paddingInlineEnd: 16 }}>
                <div style={{ fontSize: 13, color: textPrimary, fontWeight: 500, marginBottom: 4 }}>
                  הצג קרדיט בתחתית הגלריה
                </div>
                <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                  הוספת "Powered by Pixflow" בפוטר. ניתן לכבות בתכניות העסקיות.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={identity.showFooterCredit}
                onClick={() => updateIdentity('showFooterCredit', !identity.showFooterCredit)}
                className={`dash-toggle ${identity.showFooterCredit ? 'dash-toggle-on' : 'dash-toggle-off'}`}
              >
                <span className="dash-toggle-knob" />
              </button>
            </div>
          </div>

          {/* "Saved" pill — small visual confirmation that local writes stuck. */}
          <div style={{ minHeight: 18, marginTop: 12, display: 'flex', justifyContent: 'flex-start' }}>
            {identitySavedAt && (
              <span style={{
                fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
                color: statusLive, textTransform: 'uppercase',
              }}>
                נשמר
              </span>
            )}
          </div>
        </Section>

        {/* ── Tokens ────────────────────────────────────────────────────────
            Lifted from the dashboard sidebar — balance card + Buy More CTA.
            Photographers were having to back out to the dashboard to see
            their balance; surfacing it on Studio Settings keeps the
            account-level concerns in one place. */}
        <Section eyebrow="טוקנים">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontSize: 10, color: textMuted, marginBottom: 6,
                fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                Balance
              </div>
              <div style={{
                fontSize: 36, fontWeight: 500, color: textPrimary,
                letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {tokenBalance.toLocaleString('he-IL')}
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 6 }}>
                טוקן אחד = העלאת תמונה אחת
              </div>
            </div>
            {TOKEN_BILLING_ON && (
              <button
                type="button"
                onClick={() => setShowBuyTokens(true)}
                style={{
                  padding: '12px 22px', borderRadius: 2,
                  background: textPrimary, color: '#fff',
                  border: `1px solid ${textPrimary}`,
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
                  textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                קנו עוד
              </button>
            )}
          </div>
        </Section>
      </div>

      {/* ── Buy Tokens Modal — same UI as Dashboard ─────────────────────── */}
      {TOKEN_BILLING_ON && showBuyTokens && (
        <div
          onClick={() => setShowBuyTokens(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            ref={buyTokensRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-buy-tokens-heading"
            onClick={e => e.stopPropagation()}
            style={{
              background: bg, width: '100%', maxWidth: 920,
              borderRadius: 24, padding: 36,
              border: `1px solid ${border}`,
              boxShadow: '0 30px 100px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h2 id="studio-buy-tokens-heading" style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                קנה טוקנים
              </h2>
              <button
                onClick={() => setShowBuyTokens(false)}
                aria-label="סגירה"
                style={{
                  background: 'transparent', border: 'none', color: textMuted, fontSize: 22,
                  cursor: 'pointer', lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>
            <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 24px', lineHeight: 1.5 }}>
              טוקן אחד = העלאת תמונה אחת. יתרה נוכחית: <strong style={{ color: tokenBalance < 50 ? '#A67C52' : statusLive }}>{tokenBalance.toLocaleString('he-IL')}</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {TOKEN_PACKAGES.map(pkg => (
                <button
                  key={pkg.planId}
                  onClick={async () => {
                    const url = await startCheckout(pkg.planId)
                    if (url) { window.location.href = url }
                    else { alert('שגיאה בפתיחת תשלום. נסה שוב.') }
                  }}
                  style={{
                    position: 'relative',
                    background: pkg.highlight
                      ? `linear-gradient(135deg, rgba(123,143,110,.14), rgba(123,143,110,.04))`
                      : card,
                    border: `1px solid ${pkg.highlight ? 'rgba(123,143,110,.45)' : border}`,
                    borderRadius: 18, padding: 24, textAlign: 'right' as const,
                    cursor: 'pointer', transition: 'all .2s',
                    color: textPrimary, fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${accentGlow}` }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                >
                  {pkg.highlight && (
                    <div style={{
                      position: 'absolute', top: -10, right: 16,
                      padding: '4px 12px', borderRadius: 10,
                      background: `linear-gradient(135deg, ${accent}, ${accentLight})`,
                      fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
                      color: '#fff',
                    }}>
                      {pkg.highlight}
                    </div>
                  )}
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{pkg.name}</div>
                  <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>
                    {pkg.tokens.toLocaleString('he-IL')}
                  </div>
                  <div style={{ fontSize: 12, color: textMuted, marginBottom: 12 }}>טוקנים בחודש</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: statusLive }}>
                    ${pkg.pricePerMonthIls}
                    <span style={{ fontSize: 12, fontWeight: 500, color: textMuted }}> / חודש</span>
                  </div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 11, color: textMuted, margin: '20px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
              חיוב חודשי דרך LemonSqueezy. אפשר לבטל בכל זמן.<br />
              המכסה מתחדשת בתחילת כל חודש (טוקנים שלא נוצלו אינם מצטברים).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
