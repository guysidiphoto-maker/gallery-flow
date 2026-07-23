# Client Portal V2 — דוח יישום סופי

Branch: `feat/client-portal-v2` · מקומי בלבד · שום דבר לא נדחף/נפרס/הוחל · תאריך: 2026-07-23

> טכני באנגלית, הסבר בעברית. כל הבדיקות רצו והמספרים אמיתיים.

## 1. מה נבנה
מערכת אזור-לקוח מאומתת מקצה-לקצה: הצלם/חברת ההפקה יוצר לקוחות, מזמין משתמשים מאומתים (Supabase Auth), משייך גלריות, ושולט בגישה; הלקוח מקבל הזמנה, קובע סיסמה, מתחבר מכל מחשב, ורואה רק את הגלריות ה-published ששויכו אליו. בנוסף: שכבת הרשאה `production_suite` שמגדרת את המודולים המתקדמים (Feed Studio / Social / Content / Calendar / Tender / Creative) גם ב-UI וגם ב-API. הכל על שכבת אבטחה fail-closed.

## 2. איזה קוד קיים נעשה בו שימוש חוזר
- `server/ownerAuth.ts` (`requireBusinessOwnerOfClient`, `requireAuthedUser`) — הבסיס לשערי הבעלות.
- `ClientDashboard.tsx` — הותאם (additive), לא נבנה מחדש.
- מודל 057 client-auth (PIN, session tokens, rate-limit) — נשמר כ-legacy fallback.
- `authedFetch`, `supabase` client, `useAuth`, `withSentry`, ה-primitives העיצוביים של `Dashboard.tsx`, ותבנית ה-multi-action endpoint של `append-event-posts.ts`.
- טבלאות קיימות: `businesses`, `clients`, `galleries.client_id`, `plans`, `subscriptions`.

## 3. מה הושאר ללא שינוי בכוונה
Public gallery viewer, gallery URLs, downloads/favorites/lightbox/face-search/uploads/publishing, tokens, watermark, storage buckets, signed URLs, checkout/billing/LemonSqueezy, homepage/SEO/marketing, ה-Desktop App, Brand Kit (מחוץ ל-scope), ו-migration `082` (לא קשור, נשאר לא מוחל). 7 מסמכי שיווק untracked של המשתמש — לא נגעתי, לא נכללו באף commit.

## 4. שינויי מסד נתונים שהוכנו (additive, הפיכים, לא הוחלו)
`088` client_memberships + client_invitations · `089` business_entitlements + resolvers · `090` client_access_audit · `091` bootstrap + service-role primitives · `092` owner read RPCs · `093` auth-user-by-email · `094` bootstrap+entitlement flag. כולם + `_rollback`. אף עמודה/policy קיימת לא שונתה.

## 5. מודל RLS ו-Authentication
- **Auth:** Supabase email+password. הבעל שולט במחזור-החיים אך לא רואה/קובע סיסמת לקוח. הזמנה = טוקן אקראי; ב-DB נשמר **רק sha256 hash**.
- **RLS:** owner קורא רק לקוחות/חברויות/הזמנות/audit של ה-business שלו (`business_id IN (SELECT id FROM businesses WHERE user_id=auth.uid())`); member קורא רק שורות שלו (`auth_user_id=auth.uid()`); anon — כלום. כל ה-mutations דרך `SECURITY DEFINER` RPCs עם `search_path` נעול ו-least-privilege grants (service_role בלבד היכן שרלוונטי). `has_business_entitlement` — service_role בלבד. נתיב הנתונים של הפורטל: `client_portal_bootstrap()` self-scoped ל-`auth.uid()`, בלי לקבל id מהדפדפן.

## 6. תהליך הבעל (Owner)
/dashboard → "לקוחות" (הופעל בברانch) → ClientsManager: רשימה (חיפוש/סינון, תגי Legacy-PIN + Production), יצירת לקוח (+הזמנה, copy-link, בלי אימייל), פרטי לקוח, שיוך גלריות (assign/unassign/reassign עם אישור), ניהול משתמשים (invite/resend/cancel/reset/disable/reactivate/revoke), Preview as Client (עמוד ציבורי בטאב חדש, בלי impersonation). כתיבות דרך `/api/client-admin` (ownerAuth, audited, rate-limited).

## 7. תהליך הלקוח (Client)
הזמנה → `/client-invite/accept?token=` → אימות + קביעת סיסמה (או ניתוב ל-login אם קיים חשבון, בלי שינוי סיסמה) → `/client-login` → `client_portal_bootstrap` → רואה את כל הגלריות ה-published ששויכו → פתיחה/הורדה לפי הרשאות הגלריה הקיימות → Account + Logout. Disabled/revoked → אובדן גישה מיידי (נבדק בכל בקשה).

## 8. סנכרון גלריות
שיוך = `galleries.client_id` דרך `cpv2_assign_gallery` (מוודא שגם הגלריה וגם הלקוח שייכים ל-business של הקורא; cross-business → שגיאה). בלי שכפול גלריה/תמונות. unassign → `client_id=NULL` → אובדן גישה מיידי בפורטל. reassign דורש אישור מפורש ב-UI ומתועד. הפורטל מציג רק `status='live'`; drafts לעולם לא.

## 9. התנהגות ה-Production entitlement
מקור אמת יחיד: `business_entitlements` + `has_business_entitlement()`. ברירת מחדל = **חסום**. שייך ל-business האב. אכיפה בשלוש שכבות: (א) UI — טאבים מוסתרים אם `production_suite=false` (מתוך bootstrap); (ב) route/tab — בחירה כפויה מציגה "מודול לא זמין", לא את המודול; (ג) API — `generate-feed/campaign/plan-event/score-images` מחזירים 403 `entitlement_required` ל-business לא-מורשה, גם בקריאה ישירה. אין hardcode של Eclipse. אין נגיעה בחיוב.

## 10. מעבר מ-Legacy PIN
ה-PIN הישן נשמר ועובד. תוקן fail-open: `clientCode` ריק כבר לא עוקף (frontend + server `access_not_configured`). לקוחות חדשים = חשבון מאומת (בלי PIN). ניתן לשדרג לקוח PIN לחשבון ע"י הזמנת member. תג "Legacy PIN" ב-UI של הבעל. מסלול פרישה עתידי מתועד (architecture doc §6). ה-PIN לא נמחק.

## 11. בדיקות שרצו — תוצאות מדויקות
- `cpv2-entitlements` — **13/13** · `cpv2-membership` — **9/9** · `cpv2-clientadmin` — **18/18** · `cpv2-adversarial` — **5/5**. סה"כ **45/45**.
- `npx tsc --noEmit` — **0 שגיאות**. `npm run build` — **ירוק** (רק אזהרת chunk-size קיימת מראש).

## 12. תוצאות רגרסיה
בדיקות offline קיימות עברו ללא שינוי: `blocker2-ownerAuth` 13/13, `cover-image` 16/16, `dedupe-upload` 9/9, `upload-count` 15/15. הנתיבים היחידים ששונו: `append-event-posts` verify_code (הקשחה fail-closed) וארבעת ה-Production endpoints (הוספת entitlement gate) — לא ברשימת הרגרסיה של flows קיימים.

## 13. סיכונים שנותרו
1. **בדיקות תלויות-DB לא רצו** — ה-migrations לא הוחלו (בכוונה). 14 תרחישי adversarial (cross-client URL, disabled reuse, expired invite וכו') דורשים החלה ל-test project והרצה ידנית (QA doc §E).
2. **גיוס Production ברירת-מחדל חסום** — לאחר החלה, כל business ללא grant יאבד גישה ל-Feed/Campaign/Plan generation. זו ההתנהגות המכוונת, אבל דורשת grant מודע לעסקים שאמורים לקבל.
3. **bootstrap galleries כרגע משמש לאוטוריזציה, לא כרשימת-render מדויקת** — ה-render עדיין מ-query מסונן (`client_id`+live). שקול לצמצם ל-intersection עם bootstrap gallery IDs (hardening קל).
4. **אימיילים לא נשלחים** — קישורי הזמנה/reset מוחזרים לבעל. שילוב SMTP/email אמיתי = שלב עתידי.
5. Instagram — לא קיים, לא הועמד פנים שקיים.

## 14. צעדים ידניים שנדרשים
(א) החלת 088→094 ל-test/staging. (ב) grant `production_suite` לעסקי-בדיקה. (ג) הרצת QA doc §E/§F. (ד) הגדרת SMTP ב-Supabase Auth אם רוצים אימיילים אמיתיים. (ה) אישור לפני כל נגיעה בפרוד.

## 15. Migrations שדורשים אישור
`088,089,090,091,092,093,094` (+ rollbacks) — לפי הסדר. ראה QA doc §A. אף אחד לא הוחל.

## 16. משתני סביבה שדורשים אישור
`SUPABASE_URL`/`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (כבר קיימים לשרת). אופציונלי: הגדרות SMTP ב-Supabase Auth (לא נדרש לליבה). אין secret חדש.

## 17. רצף פריסה מומלץ
staging: apply 088→094 → grant entitlements → הרצת §E/§F → Vercel **preview** של הבranch → §E/§F שוב → רק אז prod: apply → grant → promote. פרישת ה-PIN = שלב נפרד מאוחר.

## 18. Branch ורשימת commits מקומיים
`feat/client-portal-v2` (מ-`03390a85`):
- `449640c` Phase 0-1 security foundation
- `7b8e30c` Phase 2 backend — owner + portal APIs
- `85c18ab` Phase 2 UI — owner Clients Manager
- `bc58e75` Phase 3 — authenticated client portal
- `ee18176` Phase 4-5 — Production API gating + adversarial tests
- `3f055a3` Phase 6 — QA/deploy docs
(דוח זה = commit נוסף.)

## 19. אישור: שום דבר לא נדחף/נפרס
לא בוצע `git push`, אין upstream ל-branch. לא הופעל deploy ל-Vercel, לא deploy ל-Edge Functions, לא הוחל אף migration (אומת: היסטוריית הפרוד עדיין נגמרת ב-`087`). לא שונו נתוני פרוד. לא נשלחו אימיילים. 7 מסמכי השיווק untracked לא נכללו באף commit.

## 20. המלצה סופית — GO / NO-GO
**Conditional GO** ל-Preview deployment בלבד, מותנה ב: (1) החלת 088→094 ל-non-prod והצלחת QA doc §E/§F שם, (2) `SUPABASE_SERVICE_ROLE_KEY` קיים ב-preview env. **NO-GO ישיר לפרוד** ללא מעבר staging/preview מלא ואישורך המפורש.
