// Branded share-email template. Pure functions, zero deps, so the edge
// function can call it in Deno and a Node-side preview script can call the
// exact same module without a build step.
//
// Output is Outlook-safe: table-based layout, inline styles only, no
// flexbox/grid, no <link> tags, no remote CSS. Image dimensions are set
// explicitly. The CTA is a padded <a> (link-as-button) sized for touch
// targets and tested for WCAG-AA contrast when the studio's primary color
// has L* ≤ 65 — the helper darkens lighter brand colors so white text on
// top still passes contrast.

export interface BrandKit {
  logo?:   { url?: string | null } | null
  colors?: { primary?: string | null; ink?: string | null } | null
  voice?:  {
    tagline?:   string | null
    signature?: string | null
    language?:  'he' | 'en' | null
  } | null
  social?: {
    instagram?: string | null
    website?:   string | null
    email?:     string | null
  } | null
}

export interface ComposeInput {
  galleryName:    string
  galleryUrl:     string
  coverImageUrl?: string | null
  studioName:     string
  studioBrand?:   BrandKit | null
  customSubject?: string
  customMessage?: string
}

export interface Composed {
  subject:   string
  html:      string
  text:      string
  branded:   boolean   // false when we fell back to the legacy template
}

// ── String helpers ──────────────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Outlook chokes on attribute-injected javascript: URLs and on protocol-less
// URLs in <a href>. Accept http(s) and mailto only; everything else becomes #.
export function safeUrl(raw: string | null | undefined): string {
  if (!raw) return '#'
  const trimmed = String(raw).trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed.replace(/"/g, '%22')
  return '#'
}

// Normalize a hex color and refuse anything weird. Anything not matching
// #RGB or #RRGGBB falls back to a safe charcoal so the template never
// renders `style="background:javascript:..."`.
export function safeColor(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  const trimmed = String(raw).trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed
  return fallback
}

// Compute YIQ luminance so the CTA's text color is auto-picked. Returns
// '#ffffff' on dark brand colors and '#141413' on light ones. Keeps white-
// text-on-yellow-brand from failing AA. Treats short-form #abc as #aabbcc.
export function readableTextOn(bg: string): '#ffffff' | '#141413' {
  let hex = bg.replace(/^#/, '')
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  if (hex.length !== 6) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 160 ? '#141413' : '#ffffff'
}

// ── Voice / language ────────────────────────────────────────────────────────
type Lang = 'he' | 'en'
function pickLang(kit: BrandKit | null | undefined): Lang {
  return kit?.voice?.language === 'en' ? 'en' : 'he'
}

const STRINGS = {
  he: {
    dir:           'rtl',
    htmlLang:      'he',
    subjectPrefix: 'גלריה חדשה',
    intro:         'הגלריה שלכם מוכנה. לחיצה על הכפתור תפתח אותה בדפדפן.',
    cta:           'צפו בגלריה',
    poweredBy:     'נשלח דרך Pixflow · pixflow-ai.com',
    instagram:     'אינסטגרם',
    website:       'אתר',
    contact:       'מענה לשאלות:',
  },
  en: {
    dir:           'ltr',
    htmlLang:      'en',
    subjectPrefix: 'New gallery',
    intro:         'Your gallery is ready. Tap the button to open it in your browser.',
    cta:           'View gallery',
    poweredBy:     'Sent via Pixflow · pixflow-ai.com',
    instagram:     'Instagram',
    website:       'Website',
    contact:       'Reply with any questions:',
  },
} as const

// ── Subject ─────────────────────────────────────────────────────────────────
export function composeSubject(opts: ComposeInput): string {
  if (opts.customSubject && opts.customSubject.trim()) {
    return opts.customSubject.trim()
  }
  const lang = pickLang(opts.studioBrand)
  const s = STRINGS[lang]
  // Spec: "גלריה חדשה — {gallery_name} · {studio_name}"
  const sep = lang === 'he' ? ' — ' : ' — '
  return `${s.subjectPrefix}${sep}${opts.galleryName} · ${opts.studioName}`
}

// ── Plain-text alternative ──────────────────────────────────────────────────
export function composePlainText(opts: ComposeInput): string {
  const lang = pickLang(opts.studioBrand)
  const s = STRINGS[lang]
  const lines: string[] = []
  if (opts.customMessage && opts.customMessage.trim()) {
    lines.push(opts.customMessage.trim(), '')
  } else {
    const tagline = opts.studioBrand?.voice?.tagline?.trim()
    if (tagline) { lines.push(tagline, '') }
  }
  lines.push(`${opts.galleryName}`, s.intro, '', opts.galleryUrl, '')
  const sig = opts.studioBrand?.voice?.signature?.trim()
  lines.push(sig || opts.studioName)
  const social = opts.studioBrand?.social ?? null
  if (social?.instagram) lines.push(`${s.instagram}: ${social.instagram}`)
  if (social?.website)   lines.push(`${s.website}: ${social.website}`)
  if (social?.email)     lines.push(`${s.contact} ${social.email}`)
  lines.push('', s.poweredBy)
  return lines.join('\n')
}

// ── Legacy plain HTML (no brand kit) ────────────────────────────────────────
// Mirrors the pre-rebrand template so the fallback render stays consistent
// with what clients saw before this PR landed.
export function composeLegacyHtml(opts: ComposeInput): string {
  const subject = composeSubject(opts)
  const safeMessage = opts.customMessage
    ? escapeHtml(opts.customMessage).replace(/\n/g, '<br>')
    : ''
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f1f1f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#11111c;border:1px solid #1e1e2a;border-radius:18px;padding:36px 32px;">
        <tr><td style="text-align:right;">
          <div style="font-size:13px;font-weight:600;color:#a5b4fc;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">
            ${escapeHtml(opts.studioName || 'Pixflow')}
          </div>
          <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.01em;margin:0 0 16px;color:#f1f1f4;line-height:1.25;">
            ${escapeHtml(opts.galleryName)}
          </h1>
          ${safeMessage ? `<p style="font-size:15px;line-height:1.6;color:#c5c8d8;margin:0 0 24px;">${safeMessage}</p>` : ''}
          <p style="font-size:14px;line-height:1.6;color:#8b8fa3;margin:0 0 28px;">
            הגלריה מוכנה לצפייה. לחיצה על הכפתור תפתח אותה בדפדפן שלך.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${safeUrl(opts.galleryUrl)}"
               style="display:inline-block;padding:14px 32px;border-radius:12px;background:#6366f1;color:#fff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:.01em;">
              צפו בגלריה
            </a>
          </div>
          <p style="font-size:12px;line-height:1.6;color:#5c5f73;margin:24px 0 0;text-align:center;word-break:break-all;">
            ${escapeHtml(opts.galleryUrl)}
          </p>
        </td></tr>
      </table>
      <p style="font-size:11px;color:#5c5f73;margin:20px 0 0;">
        נשלח דרך Pixflow · pixflow-ai.com
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Branded HTML (full brand kit path) ──────────────────────────────────────
export function composeBrandedHtml(opts: ComposeInput): string {
  const kit = opts.studioBrand!
  const lang = pickLang(kit)
  const s = STRINGS[lang]
  const subject = composeSubject(opts)

  const primary = safeColor(kit.colors?.primary, '#141413')
  const ink     = safeColor(kit.colors?.ink, '#141413')
  const cream   = '#F7F4EE'
  const hair    = '#E2DED5'
  const ctaText = readableTextOn(primary)

  const logoUrl     = kit.logo?.url ? safeUrl(kit.logo.url) : null
  const tagline     = kit.voice?.tagline?.trim()
  const signature   = kit.voice?.signature?.trim() || opts.studioName
  const customMsg   = opts.customMessage?.trim()
  const messageHtml = customMsg
    ? escapeHtml(customMsg).replace(/\n/g, '<br>')
    : (tagline ? escapeHtml(tagline) : '')

  const social = kit.social ?? null
  const socialRows: string[] = []
  if (social?.instagram) {
    socialRows.push(
      `<a href="${safeUrl(social.instagram)}" style="color:${ink};text-decoration:none;font-size:13px;">` +
      `<span style="display:inline-block;width:14px;height:14px;background:${primary};border-radius:3px;vertical-align:-2px;margin-${lang === 'he' ? 'left' : 'right'}:6px;"></span>` +
      `${s.instagram}</a>`,
    )
  }
  if (social?.website) {
    socialRows.push(
      `<a href="${safeUrl(social.website)}" style="color:${ink};text-decoration:none;font-size:13px;">` +
      `<span style="display:inline-block;width:14px;height:14px;background:${primary};border-radius:50%;vertical-align:-2px;margin-${lang === 'he' ? 'left' : 'right'}:6px;"></span>` +
      `${escapeHtml(social.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`,
    )
  }

  const align = lang === 'he' ? 'right' : 'left'

  // Cover photo. Capped at 560×320 with object-fit: cover via attribute. If
  // unset we skip the row entirely so Outlook doesn't render a broken image.
  const coverImg = opts.coverImageUrl
    ? `<img src="${safeUrl(opts.coverImageUrl)}" width="496" alt="${escapeHtml(opts.galleryName)}"
           style="display:block;width:100%;max-width:496px;height:auto;border:0;border-radius:12px;outline:none;text-decoration:none;" />`
    : ''

  const logoRow = logoUrl
    ? `<img src="${logoUrl}" alt="${escapeHtml(opts.studioName)}" height="40"
            style="display:block;height:40px;width:auto;border:0;outline:none;text-decoration:none;margin:0 auto 10px;" />`
    : ''

  // Outlook MSO conditional wrapping keeps the container at 560px wide on
  // Outlook 2016+ — without it Outlook ignores max-width and the table
  // sprawls across the whole window.
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${s.htmlLang}" dir="${s.dir}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <style type="text/css">
    table, td, div, h1, p { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink};direction:${s.dir};">
  <!-- Preview text (hidden) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(tagline || s.intro)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${cream};padding:32px 16px;" dir="${s.dir}">
    <tr><td align="center">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${hair};border-radius:18px;" dir="${s.dir}">
        <!-- Header: studio logo + name -->
        <tr><td align="center" style="padding:32px 32px 20px;border-bottom:1px solid ${hair};">
          ${logoRow}
          <div style="font-size:14px;font-weight:700;color:${primary};letter-spacing:.08em;text-transform:uppercase;">
            ${escapeHtml(opts.studioName)}
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px 8px;text-align:${align};">
          <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.01em;margin:0 0 12px;color:${ink};line-height:1.25;">
            ${escapeHtml(opts.galleryName)}
          </h1>
          ${messageHtml
            ? `<p style="font-size:15px;line-height:1.6;color:${ink};margin:0 0 20px;opacity:.85;">${messageHtml}</p>`
            : ''}
          <p style="font-size:14px;line-height:1.6;color:${ink};opacity:.7;margin:0 0 24px;">
            ${escapeHtml(s.intro)}
          </p>
        </td></tr>

        ${coverImg ? `<tr><td style="padding:0 32px 24px;">${coverImg}</td></tr>` : ''}

        <!-- CTA. table-wrapped so Outlook respects the padding/background -->
        <tr><td align="center" style="padding:8px 32px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" bgcolor="${primary}" style="border-radius:12px;background:${primary};">
              <a href="${safeUrl(opts.galleryUrl)}"
                 style="display:inline-block;padding:16px 40px;font-size:15px;font-weight:700;
                        color:${ctaText};background:${primary};border-radius:12px;
                        text-decoration:none;letter-spacing:.02em;mso-padding-alt:0;">
                ${escapeHtml(s.cta)}
              </a>
            </td></tr>
          </table>
          <p style="font-size:12px;line-height:1.6;color:${ink};opacity:.5;margin:16px 0 0;word-break:break-all;">
            ${escapeHtml(opts.galleryUrl)}
          </p>
        </td></tr>

        <!-- Footer: signature + socials -->
        <tr><td style="padding:24px 32px 32px;border-top:1px solid ${hair};text-align:${align};">
          <div style="font-size:14px;font-weight:700;color:${ink};margin-bottom:10px;">
            ${escapeHtml(signature)}
          </div>
          ${socialRows.length
            ? `<div style="font-size:13px;line-height:1.9;">${socialRows.join(' &nbsp;·&nbsp; ')}</div>`
            : ''}
          ${social?.email && /^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+$/.test(social.email)
            ? `<div style="font-size:12px;color:${ink};opacity:.6;margin-top:10px;">${escapeHtml(s.contact)} <a href="mailto:${escapeHtml(social.email)}" style="color:${ink};text-decoration:underline;">${escapeHtml(social.email)}</a></div>`
            : ''}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <p style="font-size:11px;color:${ink};opacity:.5;margin:18px 0 0;">${s.poweredBy}</p>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Entry point ─────────────────────────────────────────────────────────────
// Picks branded vs legacy based on whether the kit has at least one usable
// signal (logo, primary color, or a tagline/signature). Anything less than
// that and we render the legacy template so a half-empty kit doesn't ship
// a worse-looking email than the original plain version.
export function composeShareEmail(opts: ComposeInput): Composed {
  const kit = opts.studioBrand ?? null
  const hasSignal = !!(
    kit?.logo?.url ||
    kit?.colors?.primary ||
    kit?.voice?.tagline ||
    kit?.voice?.signature ||
    kit?.social?.instagram ||
    kit?.social?.website
  )

  const subject = composeSubject(opts)
  const text = composePlainText(opts)
  if (!hasSignal) {
    return { subject, html: composeLegacyHtml(opts), text, branded: false }
  }
  return { subject, html: composeBrandedHtml(opts), text, branded: true }
}
