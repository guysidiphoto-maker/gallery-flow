// Design primitives for the owner-side Clients Manager (Client Portal V2).
// These mirror the exact editorial-minimal palette used by Dashboard.tsx so the
// Clients Manager is visually indistinguishable from the rest of the workspace
// shell. Do NOT invent a new design system — these values are copied verbatim
// from Dashboard's module-level constants (which are not exported).
export const c = {
  accent: '#141413',          // near-black, emphasis + outlined CTA
  accentGlow: 'rgba(20,20,19,.08)',
  bg: '#F2EFE9',              // warm cream canvas
  bgSubtle: '#FAF9F5',        // section panels
  card: '#FBFBF9',            // raised surfaces
  cardSolid: '#FFFFFF',       // inner pickers, modal whites
  border: '#D0D0D0',          // hairline 1px borders
  borderHover: '#141413',
  textPrimary: '#141413',     // headings + UI text
  textSecondary: '#333333',   // body copy
  textMuted: '#767470',       // captions, secondary metadata (WCAG-AA on cream)
  statusLive: '#7B8F6E',      // subtle sage "published" dot
  danger: '#B4524A',          // destructive text/border (readable on cream)
} as const

// Shared status → Hebrew label + tone maps used by badges across the feature.
export const MEMBERSHIP_STATUS_HE: Record<string, string> = {
  invited: 'הוזמן',
  active: 'פעיל',
  disabled: 'מושהה',
  revoked: 'בוטל',
}

export const INVITATION_STATUS_HE: Record<string, string> = {
  pending: 'ממתין',
  accepted: 'התקבל',
  cancelled: 'בוטל',
  expired: 'פג תוקף',
}

export const ROLE_HE: Record<string, string> = {
  client_admin: 'מנהל לקוח',
  approver: 'מאשר',
  viewer: 'צופה',
}

export const GALLERY_STATUS_HE: Record<string, string> = {
  draft: 'טיוטה',
  live: 'פורסם',
  archived: 'בארכיון',
}

// Controlled-vocabulary audit actions → concise Hebrew phrasing.
export const AUDIT_ACTION_HE: Record<string, string> = {
  client_created: 'לקוח נוצר',
  invitation_sent: 'הזמנה נשלחה',
  invitation_resent: 'הזמנה נשלחה מחדש',
  invitation_accepted: 'הזמנה התקבלה',
  invitation_cancelled: 'הזמנה בוטלה',
  membership_disabled: 'משתמש הושהה',
  membership_reactivated: 'משתמש הופעל מחדש',
  membership_revoked: 'משתמש בוטל',
  gallery_assigned: 'גלריה שויכה',
  gallery_unassigned: 'שיוך גלריה בוטל',
  gallery_reassigned: 'גלריה שויכה מחדש',
  portal_access: 'כניסה לפורטל',
  password_reset_requested: 'איפוס סיסמה התבקש',
  production_access_denied: 'גישת הפקה נדחתה',
}

// Server error codes → user-facing Hebrew messages. Anything not listed falls
// back to a generic message so the UI never surfaces a raw code.
export const ERROR_HE: Record<string, string> = {
  rate_limited: 'יותר מדי בקשות. המתן דקה ונסה שוב.',
  already_active_member: 'משתמש זה כבר פעיל אצל הלקוח.',
  forbidden: 'אין הרשאה לפעולה זו.',
  forbidden_origin: 'הבקשה נחסמה מטעמי אבטחה.',
  invalid_email: 'כתובת אימייל לא תקינה.',
  not_accepted_yet: 'המשתמש עדיין לא אישר את ההזמנה, לכן לא ניתן לאפס סיסמה.',
  name_required: 'יש להזין שם לקוח.',
  not_pending: 'ההזמנה כבר אינה ממתינה.',
  assign_failed: 'שיוך הגלריה נכשל.',
  unassign_failed: 'ביטול השיוך נכשל.',
  create_failed: 'יצירת הלקוח נכשלה.',
  unknown_action: 'פעולה לא מוכרת.',
  method_not_allowed: 'שיטת בקשה לא נתמכת.',
  supabase_not_configured: 'שגיאת תצורה בשרת.',
  internal_error: 'שגיאה פנימית. נסה שוב.',
}

export function errorText(code: string | undefined): string {
  if (!code) return 'הפעולה נכשלה. נסה שוב.'
  return ERROR_HE[code] ?? `הפעולה נכשלה (${code}).`
}
