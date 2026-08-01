# UX + Hebrew Copy Review — Integration Preview Hardening (Agent-E)

Date: 2026-07-24
Scope: string/locale files only. No logic, component, API, or migration changes.
Files reviewed: `src/lib/ownerLocale.ts`, `src/lib/portalLocale.ts`,
`src/components/{overview→ownerLocale, search, tender, importer, assignment}/strings.ts`,
`src/components/social-lock/SocialComingSoon.tsx` (+ its keys in portalLocale).
Tour copy confirmed to live in `ownerLocale.ts` (no inlined Hebrew in `FirstRunTour.tsx`).

Verification: `npx tsc --noEmit -p .` clean. he/en key parity intact (every key appears in
both dictionaries; verified by count — no key added or removed, only values changed).

---

## 1. Strings changed

| # | File | Key | Before | After | Why |
|---|------|-----|--------|-------|-----|
| 1 | importer | `import.subtitle` (he) | `...אל piXflow, צעד...` | `...אל Pixflow, צעד...` | Brand spelling: product name is **Pixflow** (approved), not the lowercase-mixed `piXflow`. |
| 2 | importer | `import.subtitle` (en) | `...into piXflow, step by step.` | `...into Pixflow, step by step.` | Same brand-spelling fix. |
| 3 | importer | `import.step4.intro` (he) | `...דרך מנגנון ההעלאה הרגיל.` | `...כמו בהעלאה רגילה.` | "מנגנון ההעלאה" (upload engine/mechanism) is mild internal jargon; softened to plain language. |
| 4 | importer | `import.step5.title` (en) | `Step 5: Migration report` | `Step 5: Import report` | he says "דוח ייבוא" (import report); "migration" is more technical and mismatched the he. Now aligned. |
| 5 | assignment | `bulk.empty.body` (he) | `צור גלריות במסך «הגלריות שלי»...` | `צרו גלריות במסך "הגלריות שלי"...` | Guillemets `«»` are not standard Hebrew punctuation → regular quotes. Also singular→plural imperative (see note A). |
| 6 | assignment | `bulk.subtitle` (he) | `שייך גלריות ללקוחות כדי שיופיעו בפורטל שלהם...` | `שייכו גלריות ללקוחות כדי שיופיעו באזור האישי שלהם...` | "פורטל" is English-in-Hebrew jargon; app elsewhere uses "האזור האישי" / "אזור הלקוח". Plus plural imperative. |
| 7 | assignment | `assign.field.placeholder` | `בחר לקוח…` | `בחרו לקוח…` | Plural imperative (note A). |
| 8 | assignment | `assign.field.createNew` | `צור לקוח חדש` | `יצירת לקוח חדש` | Noun-form label (note A). |
| 9 | assignment | `assign.field.createSubmit` | `צור ובחר` | `יצירה ובחירה` | Noun-form button (note A). |
| 10 | assignment | `assign.field.retry` | `נסה שוב` | `נסו שוב` | Plural imperative. |
| 11 | assignment | `bulk.selectAll` | `בחר את כל המוצגות` | `בחירת כל המוצגות` | Noun-form. |
| 12 | assignment | `bulk.clearSelection` | `נקה בחירה` | `ניקוי הבחירה` | Noun-form. |
| 13 | assignment | `bulk.assignSelected` | `שייך את הנבחרות` | `שיוך הנבחרות` | Noun-form. |
| 14 | assignment | `bulk.assignedTo` (he) | `משויך ל` | `משויכת ל־` | Dangling preposition before the injected client name; added maqaf (־) and matched feminine gender of "גלריה". |
| 15 | assignment | `bulk.assign` | `שייך ללקוח` | `שיוך ללקוח` | Noun-form button. |
| 16 | assignment | `bulk.reassign` | `שייך מחדש` | `שיוך מחדש` | Noun-form. |
| 17 | assignment | `bulk.unassign` | `בטל שיוך` | `ביטול שיוך` | Noun-form. |
| 18 | assignment | `bulk.modal.submitAssign` | `שייך` | `שיוך` | Noun-form. |
| 19 | assignment | `bulk.modal.submitReassign` | `שייך מחדש` | `שיוך מחדש` | Noun-form. |
| 20 | assignment | `bulk.confirm.reassignOk` | `שייך מחדש` | `שיוך מחדש` | Noun-form. |
| 21 | assignment | `bulk.confirm.unassignOk` | `בטל שיוך` | `ביטול שיוך` | Noun-form. |
| 22 | assignment | `bulk.confirm.bulkOk` | `שייך את כולן` | `שיוך כל הנבחרות` | Noun-form + clearer scope ("all selected"). |
| 23 | assignment | `bulk.confirm.reassignBody` | `...ללקוח החדש והלקוח הקודם...` | `...ללקוח החדש, והלקוח הקודם...` | Added comma for readability. |
| 24 | assignment | `bulk.confirm.unassignBody` | `...מהלקוח והוא יאבד...` | `...מהלקוח, והוא יאבד...` | Comma. |
| 25 | assignment | `bulk.confirm.bulkReassignBody` | `...ללקוח אחר ויעברו...` | `...ללקוח אחר, ויעברו...` | Comma. |
| 26 | assignment | `bulk.tooMany` | `...צמצם את הבחירה.` | `...צמצמו את הבחירה.` | Plural imperative. |
| 27 | assignment | `bulk.hidden.noActiveMembers` (he) | `...ללקוח אין משתמשים פעילים` | `...הלקוח עדיין לא אישר את ההזמנה` | "אין משתמשים פעילים" ("no active users/members") is confusing to the owner; states the real situation (invite not accepted). Avoids "membership" jargon. |
| 28 | assignment | `bulk.hidden.noActiveMembers` (en) | `...the client has no active users` | `...the client has not accepted the invitation yet` | Same clarity fix. |
| 29 | tender | `tender.filters.clear` | `נקה סינון` | `ניקוי סינון` | Noun-form. |
| 30 | tender | `tender.filters.industry` (he) | `תעשייה` | `תחום` | Consistency: Search uses "תחום" for the same concept; "תחום" is more natural for event industries. |
| 31 | tender | `tender.match.industry` (he) | `תעשייה` | `תחום` | Same consistency fix. |
| 32 | tender | `tender.gallery.open` | `פתח גלריה` | `פתיחת גלריה` | Noun-form. |
| 33 | tender | `tender.gallery.pick_images` | `בחר תמונות` | `בחירת תמונות` | Noun-form. |
| 34 | tender | `tender.gallery.close_images` | `סגור תמונות` | `סגירת התמונות` | Noun-form. |
| 35 | tender | `tender.gallery.add_to_collection` | `הוסף לאוסף` | `הוספה לאוסף` | Noun-form. |
| 36 | tender | `tender.gallery.remove_from_collection` | `הסר מהאוסף` | `הסרה מהאוסף` | Noun-form. |
| 37 | tender | `tender.classify` | `סווג אירוע` | `סיווג אירוע` | Noun-form. |
| 38 | tender | `tender.classify.close` | `סגור` | `סגירה` | Noun-form. |
| 39 | tender | `tender.classify.save` | `שמור סיווג` | `שמירת סיווג` | Noun-form. |
| 40 | tender | `tender.collection.create` | `צור` | `יצירה` | Noun-form. |
| 41 | tender | `tender.collection.rename` | `שנה שם` | `שינוי שם` | Noun-form. |
| 42 | tender | `tender.collection.rename.save` | `שמור` | `שמירה` | Noun-form. |
| 43 | tender | `tender.collection.copy` | `העתק רשימה` | `העתקת רשימה` | Noun-form. |
| 44 | tender | `tender.collection.remove` | `הסר` | `הסרה` | Noun-form. |
| 45 | tender | `tender.collection.select` | `בחר אוסף` | `בחירת אוסף` | Noun-form. |
| 46 | tender | `tender.collection.load_failed` (he) | `...ייתכן שהעדכון למסד הנתונים עדיין לא הותקן` | `...נסו לרענן את העמוד, ואם זה נמשך פנו לתמיכה` | "מסד הנתונים / העדכון לא הותקן" (database migration not installed) is raw internal jargon in a user-facing error. |
| 47 | tender | `tender.collection.load_failed` (en) | `...The database update may not be installed yet` | `...Try refreshing the page, and if it persists contact support` | Same jargon-leak fix. |
| 48 | portalLocale | `account.signedInAs` (he) | `מחובר.ת כ` | `מחובר.ת כעת` | Dangling "כ" (rendered as a standalone header line, not concatenated to a name) reads incomplete; "כעת" (currently) completes it. |
| 49 | portalLocale | `gate.restricted.body` (he) | `אזור הלקוח דורש חשבון גישה. פנו לצלם כדי לקבל הזמנה.` | `כדי להיכנס לאזור האישי צריך הזמנה. פנו לצלם כדי לקבל הזמנה.` | "חשבון גישה" (access account) is stiff/technical; warmer, plainer phrasing. |
| 50 | portalLocale | `gate.restricted.body` (en) | `This client area requires an access account...` | `You need an invitation to enter your client area. Contact your photographer to get one.` | Same warmth/plain-language fix. |
| 51 | ownerLocale | `assign.modalLabel` (he) | `שייך ללקוח (לא חובה)` | `שיוך ללקוח (לא חובה)` | Noun-form label (RTL parenthesis was already correct). |

**Note A — verb register standardization.** The `assignment` and `tender` modules were written
with masculine-singular imperatives (`שייך`, `בחר`, `פתח`, `נסה`…), while `overview`, `search`,
`importer`, and `portal` use plural imperative (`בחרו`, `פתחו`, `העלו`) or noun-form labels.
Plural imperative / noun-form is the standard warm, gender-neutral register for Israeli SaaS.
Standardizing removes the masculine-only bias and makes the whole owner UI read in one voice.
All such changes are VALUE-only; no keys touched.

Long dashes (—): none found in user-facing copy. The `—` occurrences are only in code comments
and are out of copy scope.

---

## 2. Product-comprehension findings (owner journey)

Walked the new owner journey: Overview → create/invite client → assign gallery → preview as
client → Search → Tender → Social lock.

| Step | Finding | Severity |
|------|---------|----------|
| Overview (first run) | Strong. The first-run checklist (`overview.check.*`) plus the guided tour (`tour.*`) explicitly teaches the whole model: add client → invite → connect gallery → preview → verify access. `tour.preview.body` even spells out the clients↔galleries relationship in one sentence. A brand-new user will understand what to do first. | OK |
| Empty Overview | `overview.empty` points to "create your first gallery," but the checklist's *first* recommended step is "add a client." Two different "first actions" compete. Minor risk of the user creating a gallery with no client, then not knowing it is invisible. Consider making the empty-state CTA mirror the checklist order (client first) or explicitly say a gallery needs a client to be seen. | Medium (copy/flow, needs product call) |
| Create / invite client | The Clients area itself has **no strings in the reviewed files** — `nav.clients` exists but the client-list screen, the "create client" form, and the "send invite" flow strings are not in any of the six wave-1 string modules. If that screen is unlocalized or lives elsewhere, the invite step (the linchpin of the whole model) may lack empty-state guidance. Needs confirmation of where Clients-screen copy lives. | High (coverage gap to verify) |
| Assign gallery | Excellent. `bulk.subtitle` explains the purpose; the `bulk.hidden.*` reasons proactively explain *why* a gallery is invisible (not assigned / not published / invite not accepted). This is the clearest part of the flow. | OK |
| Preview as client | Both entry points exist (`bulk.preview` "תצוגה כלקוח", `overview.check.preview`, `tour.preview`). `bulk.previewTitle` clarifies it opens in a new tab. Clear. | OK |
| Search | `search.idleTitle/idleBody` give a good empty state and explain free-text + filter browsing. Purpose is clear. | OK |
| Tender Search | `tender.subtitle` explains the purpose (filter archive, collect galleries/images, export a list for a proposal). But a first-time user may not know what a "מאגר למכרזים" (tender library) is *for* vs. regular Search — the two look similar (both filter galleries by event traits). The differentiator (Tender = build an export list for a bid/proposal) is only in the subtitle. Consider a one-line "how this differs from Search" hint, or it may confuse. | Medium |
| Why Social is locked | Only the **client-portal** social lock has copy (`socialLock.*`, `nav.comingSoon`, `gate.notAvailable.*`). There is **no owner-side** explanation of why the owner's Social area is locked. If the owner also sees a locked Social nav item, they get no "coming soon" reassurance. Needs product confirmation of whether the owner sees a Social lock and where its copy would live. | Medium (coverage gap) |

---

## 3. Items needing product-owner decision

1. **Empty-Overview first action.** Checklist says "add a client first"; the empty-state CTA says
   "create a gallery first." Which should be the canonical first step? (Recommend: client first,
   or explicitly warn that a gallery needs a client to become visible.)

2. **Clients-screen copy location.** The create-client and send-invite screens have no strings in
   the reviewed wave-1 modules. Confirm they are localized (he/en) with proper empty-state guidance
   — this is the single most important step in the owner model and must not be an unlocalized gap.

3. **Owner-side Social lock copy.** Confirm whether the owner dashboard shows a locked Social item.
   If so, it needs its own "coming soon" copy (the existing `socialLock.*` keys are client-portal only).

4. **Tender vs Search differentiation.** Decide whether to add a short in-context hint clarifying that
   Tender is for assembling an export list for a proposal/bid, vs. Search for everyday finding.

5. **Import: en "Collection" vs "Gallery".** In the importer, en uses "Collection" (Pixieset's own
   term) while he resolves to "גלריה". Left as-is because the import context is literally Pixieset
   Collections, but confirm whether you want en unified to "Gallery" for app consistency.

6. **Out-of-scope glyph (documented, not changed).** `src/components/portal/AccountMenu.tsx:108`
   uses an em-dash `'—'` as the empty-email fallback. It is a placeholder glyph in a component file
   (outside string-file scope), but per the no-long-dash preference consider changing it to a period
   or a neutral placeholder in a future code pass.
