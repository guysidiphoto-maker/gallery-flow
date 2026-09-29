// Client-side pre-check for obvious bad input (scheme, slashes, single-label
// hosts). The set_business_custom_domain RPC remains the source of truth.
export const VALID_DOMAIN = /^(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/

export function domainErrorToHebrew(code: string | undefined): string {
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
