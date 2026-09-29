// Status/role → Hebrew labels shared by the Clients Manager badges.
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

// Server error codes → Hebrew. Unlisted codes fall back to a generic message
// so the UI never shows a raw code alone.
const ERROR_HE: Record<string, string> = {
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
  clientId_required: 'יש לבחור לקוח.',
  galleryIds_required: 'יש לבחור לפחות גלריה אחת.',
  invalid_galleryIds: 'רשימת הגלריות אינה תקינה.',
  too_many_galleries: 'ניתן לשייך עד 200 גלריות בפעולה אחת.',
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
