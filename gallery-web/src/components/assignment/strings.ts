// strings.ts — local he/en strings for the assignment components.
//
// WHY LOCAL: the shared `src/lib/ownerLocale.ts` hook is created concurrently
// by another agent (wave 1) and MUST NOT be imported here yet. Per the sprint
// contract (C8), each wave-1 area ships its own strings module in the shared
// `{he:{},en:{}}` flat-key shape; the wave-2 integrator may merge these keys
// into ownerLocale.ts or keep this module and only swap the `locale` prop to
// come from `useOwnerLocale()`. Either way the keys below are stable.
//
// Copy rules (contract): no internal jargon, no long dashes, every key exists
// in BOTH languages.

export type AssignmentLocale = 'he' | 'en'

const he = {
  // AssignClientField
  'assign.field.label': 'לקוח',
  'assign.field.noClient': 'ללא לקוח עדיין',
  'assign.field.placeholder': 'בחר לקוח…',
  'assign.field.search': 'חיפוש לקוח…',
  'assign.field.noResults': 'לא נמצאו לקוחות תואמים.',
  'assign.field.createNew': 'צור לקוח חדש',
  'assign.field.createName': 'שם הלקוח',
  'assign.field.createSubmit': 'צור ובחר',
  'assign.field.createCancel': 'ביטול',
  'assign.field.creating': 'יוצר…',
  'assign.field.loading': 'טוען לקוחות…',
  'assign.field.loadError': 'טעינת הלקוחות נכשלה.',
  'assign.field.retry': 'נסה שוב',
  'assign.field.nameRequired': 'יש להזין שם לקוח.',
  'assign.field.createFailed': 'יצירת הלקוח נכשלה.',

  // BulkAssignView
  'bulk.back': 'חזרה לרשימת הלקוחות',
  'bulk.kicker': 'ניהול',
  'bulk.title': 'שיוך גלריות',
  'bulk.subtitle': 'שייך גלריות ללקוחות כדי שיופיעו בפורטל שלהם. אפשר לסמן כמה גלריות ולשייך את כולן בפעולה אחת.',
  'bulk.search': 'חיפוש גלריה או לקוח…',
  'bulk.filter.all': 'הכול',
  'bulk.filter.assigned': 'משויכות',
  'bulk.filter.unassigned': 'לא משויכות',
  'bulk.filter.published': 'פורסמו',
  'bulk.filter.draft': 'טיוטות',
  'bulk.empty.title': 'אין גלריות לשיוך',
  'bulk.empty.body': 'צור גלריות במסך «הגלריות שלי» כדי לשייך אותן ללקוחות.',
  'bulk.noResults.title': 'אין תוצאות',
  'bulk.noResults.body': 'לא נמצאו גלריות התואמות את החיפוש או הסינון.',
  'bulk.selectAll': 'בחר את כל המוצגות',
  'bulk.clearSelection': 'נקה בחירה',
  'bulk.selectedCount': 'גלריות נבחרו',
  'bulk.assignSelected': 'שייך את הנבחרות',
  'bulk.assignedTo': 'משויך ל',
  'bulk.unassigned': 'לא משויך',
  'bulk.hidden.unassigned': 'אף לקוח לא רואה את הגלריה: אין לקוח משויך',
  'bulk.hidden.notPublished': 'אף לקוח לא רואה את הגלריה: היא עדיין לא פורסמה',
  'bulk.hidden.noActiveMembers': 'אף לקוח לא רואה את הגלריה: ללקוח אין משתמשים פעילים',
  'bulk.hiddenBadge': 'לא גלוי ללקוח',
  'bulk.assign': 'שייך ללקוח',
  'bulk.reassign': 'שייך מחדש',
  'bulk.unassign': 'בטל שיוך',
  'bulk.preview': 'תצוגה כלקוח',
  'bulk.previewTitle': 'פתיחת עמוד הלקוח בלשונית חדשה',
  'bulk.modal.assignTitle': 'שיוך גלריה ללקוח',
  'bulk.modal.reassignTitle': 'שיוך גלריה מחדש',
  'bulk.modal.gallery': 'גלריה',
  'bulk.modal.submitAssign': 'שייך',
  'bulk.modal.submitReassign': 'שייך מחדש',
  'bulk.modal.cancel': 'ביטול',
  'bulk.modal.clientRequired': 'יש לבחור לקוח.',
  'bulk.confirm.reassignTitle': 'שיוך מחדש',
  'bulk.confirm.reassignBody': 'הגלריה תעבור ללקוח החדש והלקוח הקודם יאבד את הגישה אליה. להמשיך?',
  'bulk.confirm.reassignOk': 'שייך מחדש',
  'bulk.confirm.back': 'חזרה',
  'bulk.confirm.unassignTitle': 'ביטול שיוך',
  'bulk.confirm.unassignBody': 'הגלריה תנותק מהלקוח והוא יאבד את הגישה אליה. להמשיך?',
  'bulk.confirm.unassignOk': 'בטל שיוך',
  'bulk.confirm.bulkTitle': 'שיוך מרובה',
  'bulk.confirm.bulkReassignBody': 'חלק מהגלריות שנבחרו כבר משויכות ללקוח אחר ויעברו ללקוח החדש. הלקוחות הקודמים יאבדו גישה אליהן. להמשיך?',
  'bulk.confirm.bulkOk': 'שייך את כולן',
  'bulk.toast.assigned': 'הגלריה שויכה.',
  'bulk.toast.reassigned': 'הגלריה שויכה מחדש.',
  'bulk.toast.unassigned': 'השיוך בוטל.',
  'bulk.toast.bulkDone': 'השיוך הושלם',
  'bulk.toast.bulkPartial': 'חלק מהשיוכים נכשלו',
  'bulk.summary.assigned': 'שויכו',
  'bulk.summary.reassigned': 'שויכו מחדש',
  'bulk.summary.unchanged': 'ללא שינוי',
  'bulk.summary.failed': 'נכשלו',
  'bulk.tooMany': 'ניתן לשייך עד 200 גלריות בפעולה אחת. צמצם את הבחירה.',
  'bulk.loadError': 'טעינת הגלריות נכשלה.',
} as const

export type AssignmentStringKey = keyof typeof he

const en: Record<AssignmentStringKey, string> = {
  'assign.field.label': 'Client',
  'assign.field.noClient': 'No client yet',
  'assign.field.placeholder': 'Choose a client…',
  'assign.field.search': 'Search clients…',
  'assign.field.noResults': 'No matching clients.',
  'assign.field.createNew': 'Create new client',
  'assign.field.createName': 'Client name',
  'assign.field.createSubmit': 'Create and select',
  'assign.field.createCancel': 'Cancel',
  'assign.field.creating': 'Creating…',
  'assign.field.loading': 'Loading clients…',
  'assign.field.loadError': 'Could not load clients.',
  'assign.field.retry': 'Retry',
  'assign.field.nameRequired': 'Enter a client name.',
  'assign.field.createFailed': 'Creating the client failed.',

  'bulk.back': 'Back to clients',
  'bulk.kicker': 'Manage',
  'bulk.title': 'Gallery assignment',
  'bulk.subtitle': 'Assign galleries to clients so they appear in their portal. Select multiple galleries to assign them in one action.',
  'bulk.search': 'Search gallery or client…',
  'bulk.filter.all': 'All',
  'bulk.filter.assigned': 'Assigned',
  'bulk.filter.unassigned': 'Unassigned',
  'bulk.filter.published': 'Published',
  'bulk.filter.draft': 'Drafts',
  'bulk.empty.title': 'No galleries to assign',
  'bulk.empty.body': 'Create galleries in "My galleries" to assign them to clients.',
  'bulk.noResults.title': 'No results',
  'bulk.noResults.body': 'No galleries match the search or filter.',
  'bulk.selectAll': 'Select all shown',
  'bulk.clearSelection': 'Clear selection',
  'bulk.selectedCount': 'galleries selected',
  'bulk.assignSelected': 'Assign selected',
  'bulk.assignedTo': 'Assigned to',
  'bulk.unassigned': 'Unassigned',
  'bulk.hidden.unassigned': 'No client can see this gallery: no client assigned',
  'bulk.hidden.notPublished': 'No client can see this gallery: it is not published yet',
  'bulk.hidden.noActiveMembers': 'No client can see this gallery: the client has no active users',
  'bulk.hiddenBadge': 'Not visible to client',
  'bulk.assign': 'Assign to client',
  'bulk.reassign': 'Reassign',
  'bulk.unassign': 'Unassign',
  'bulk.preview': 'Preview as client',
  'bulk.previewTitle': 'Opens the client page in a new tab',
  'bulk.modal.assignTitle': 'Assign gallery to client',
  'bulk.modal.reassignTitle': 'Reassign gallery',
  'bulk.modal.gallery': 'Gallery',
  'bulk.modal.submitAssign': 'Assign',
  'bulk.modal.submitReassign': 'Reassign',
  'bulk.modal.cancel': 'Cancel',
  'bulk.modal.clientRequired': 'Choose a client.',
  'bulk.confirm.reassignTitle': 'Reassign',
  'bulk.confirm.reassignBody': 'The gallery will move to the new client and the previous client will lose access. Continue?',
  'bulk.confirm.reassignOk': 'Reassign',
  'bulk.confirm.back': 'Back',
  'bulk.confirm.unassignTitle': 'Unassign',
  'bulk.confirm.unassignBody': 'The gallery will be detached from the client and they will lose access. Continue?',
  'bulk.confirm.unassignOk': 'Unassign',
  'bulk.confirm.bulkTitle': 'Bulk assignment',
  'bulk.confirm.bulkReassignBody': 'Some selected galleries are already assigned to another client and will move to the new client. The previous clients will lose access. Continue?',
  'bulk.confirm.bulkOk': 'Assign all',
  'bulk.toast.assigned': 'Gallery assigned.',
  'bulk.toast.reassigned': 'Gallery reassigned.',
  'bulk.toast.unassigned': 'Assignment removed.',
  'bulk.toast.bulkDone': 'Assignment completed',
  'bulk.toast.bulkPartial': 'Some assignments failed',
  'bulk.summary.assigned': 'assigned',
  'bulk.summary.reassigned': 'reassigned',
  'bulk.summary.unchanged': 'unchanged',
  'bulk.summary.failed': 'failed',
  'bulk.tooMany': 'Up to 200 galleries can be assigned per action. Reduce the selection.',
  'bulk.loadError': 'Could not load galleries.',
}

const TABLES: Record<AssignmentLocale, Record<AssignmentStringKey, string>> = { he, en }

/** Flat-key lookup, same contract as portalLocale/ownerLocale. */
export function t(locale: AssignmentLocale, key: AssignmentStringKey): string {
  return TABLES[locale][key] ?? TABLES.he[key] ?? key
}

/** Text direction for the given locale (he is RTL). */
export function dirFor(locale: AssignmentLocale): 'rtl' | 'ltr' {
  return locale === 'he' ? 'rtl' : 'ltr'
}
