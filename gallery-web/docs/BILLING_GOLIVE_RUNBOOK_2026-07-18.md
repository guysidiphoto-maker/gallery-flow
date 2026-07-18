# מדריך הפעלת תשלומים (Billing Go-Live Runbook)

**תאריך:** 2026-07-18
**מטרה:** להפעיל מכירות מנויים בפרודקשן, במחירים **Solo ₪99 / Pro ₪199 / Studio ₪449**.
**סטטוס נוכחי:** התשלומים **כבויים** — אף אחד לא מחויב, אין סיכון. צריך להשלים את הרצף למטה כדי לפתוח מכירות.

> **מילון מונחים קצר:**
> - **LemonSqueezy** = ספק הסליקה (מי שמחייב את כרטיס האשראי). קיצור בהמשך: **LS**.
> - **Variant** = "וריאנט" = גרסת מוצר ב‑LS עם מחיר. לכל מסלול יש Variant משלו, ולכל אחד יש **Variant ID** (מזהה מספרי).
> - **Edge Function** = פונקציית שרת קטנה שרצה ב‑Supabase. שתי רלוונטיות: `create-checkout` (פותחת עמוד תשלום) ו‑`lemonsqueezy-webhook` (מקבלת אישור תשלום).
> - **Secret / משתנה סביבה** = ערך מוסתר (כמו סיסמה) שהשרת קורא. מגדירים בלוח הבקרה, לא בקוד.
> - **Vercel** = מי שמארח את האתר.

---

## מה כבר מוכן ✅ ומה חסר 🔧

| רכיב | סטטוס |
|---|---|
| קוד המחירים (Solo/Pro/Studio, 99/199/449) | ✅ מוכן ב‑PR `feat/pricing-solo-pro-studio-99-199-449` — צריך למזג |
| `lemonsqueezy-webhook` (מקבל אישורי תשלום) | ✅ פרוס בפרודקשן (גרסה 6) |
| `create-checkout` (פותח עמוד תשלום) | 🔧 **לא פרוס** — זו הסיבה שאי אפשר לרכוש כרגע |
| וריאנטים ב‑LemonSqueezy במחירים החדשים | 🔧 צריך להגדיר |
| Secrets ב‑Supabase (מפתחות + Variant IDs) | 🔧 צריך להגדיר |
| דגל `VITE_FEATURE_GALLERY_BILLING` ב‑Vercel | 🔧 כבוי — להדליק בסוף |

---

## טבלת המיפוי הקריטית 🔑 (העתק/הדבק)

⚠️ **הכי חשוב במסמך.** שמרנו את המזהים הפנימיים (`pro/business/agency`) כדי לא לגעת במסד הנתונים. לכן **המיפוי הוא לפי דרג (זול→יקר), לא לפי השם.** אל תלך לפי השם "Pro" — לך לפי הטבלה:

| הלקוח רואה | מחיר חודשי | תמונות/חודש | ה‑Variant ID נכנס למשתנה |
|---|---|---|---|
| **Solo** | ₪99 | 2,000 | `LEMONSQUEEZY_VARIANT_PRO` |
| **Pro** | ₪199 | 10,000 | `LEMONSQUEEZY_VARIANT_BUSINESS` |
| **Studio** | ₪449 | 30,000 | `LEMONSQUEEZY_VARIANT_AGENCY` |
| גלריה (חד־פעמי) | ₪590 | — | `LEMONSQUEEZY_VARIANT_GALLERY` |

> דוגמה: הווריאנט "Pro ₪199" שתיצור ב‑LS — את ה‑ID שלו מכניסים ל‑`LEMONSQUEEZY_VARIANT_BUSINESS` (לא ל‑PRO!).

---

## הרצף — שלב אחר שלב

### ☐ שלב 1 — מזג את PR המחירים
מזג את `feat/pricing-solo-pro-studio-99-199-449` ל‑main. זה יעדכן את האתר להציג Solo/Pro/Studio ב‑99/199/449. (main מתפרסם אוטומטית ל‑Vercel, אז המחירים החדשים יעלו לאתר. עדיין אין כפתור תשלום פעיל — הדגל כבוי.)

### ☐ שלב 2 — הגדר מוצרים ב‑LemonSqueezy
בלוח הבקרה של LS:
- ☐ ודא שמטבע החנות = **ILS (₪)**.
- ☐ צור/עדכן 3 מוצרי מנוי חודשי: **Solo ₪99**, **Pro ₪199**, **Studio ₪449**.
- ☐ ודא שקיים מוצר **גלריה חד־פעמי ₪590**.
- ☐ העתק את ה‑**Variant ID** של כל אחד (4 מספרים).
- ☐ העתק גם: **Store ID**, **API Key**, ו‑**Webhook Signing Secret** (מ‑Settings → Webhooks).
- ☐ ודא שכתובת ה‑Webhook ב‑LS מצביעה ל:
  `https://vlyiqfawkrjvqcmkpfvs.supabase.co/functions/v1/lemonsqueezy-webhook`

### ☐ שלב 3 — הגדר Secrets ב‑Supabase
Supabase → Project Settings → **Edge Functions → Secrets**. הגדר את כל אלה (השמות בדיוק כך):

```
LEMONSQUEEZY_API_KEY        = <API Key מ-LS>
LEMONSQUEEZY_STORE_ID       = <Store ID מ-LS>
LEMONSQUEEZY_WEBHOOK_SECRET = <Webhook Signing Secret מ-LS>
LEMONSQUEEZY_VARIANT_PRO      = <Variant ID של Solo ₪99>
LEMONSQUEEZY_VARIANT_BUSINESS = <Variant ID של Pro ₪199>
LEMONSQUEEZY_VARIANT_AGENCY   = <Variant ID של Studio ₪449>
LEMONSQUEEZY_VARIANT_GALLERY  = <Variant ID של גלריה ₪590>
PUBLIC_SITE_URL             = https://pixflow-ai.com
```

> שוב — שים לב ל‑2 השורות המודגשות: Solo→PRO, Pro→BUSINESS. לפי הטבלה למעלה.

### ☐ שלב 4 — פריסת `create-checkout` (אני עושה)
כשסיימת שלב 3, **תגיד לי** — אני פורס את פונקציית `create-checkout` לפרודקשן (באישורך). בלי זה, כפתור הרכישה יחזיר שגיאה 404.

### ☐ שלב 5 — הדלק את דגל התשלומים ב‑Vercel
Vercel → Project → Settings → Environment Variables:
```
VITE_FEATURE_GALLERY_BILLING = 1
```
ואז Redeploy (בנייה מחדש, כי זה משתנה של צד־לקוח). זה מה שמראה את כפתורי הרכישה בדשבורד.

### ☐ שלב 6 — בדיקה מקצה לקצה (Test Mode)
הפעל **Test Mode** ב‑LS, ובצע רכישת ניסיון עם כרטיס בדיקה:
- ☐ הרשמה → לחיצה על "התחל עם Pro" → נפתח עמוד תשלום עם **₪199** (המחיר הנכון).
- ☐ תשלום ניסיון עובר.
- ☐ ה‑webhook יוצר שורת מנוי עם המסלול **הנכון** (Pro→business, 10,000 טוקנים).
- ☐ הדשבורד מציג את המסלול + יתרת הטוקנים.
- ☐ ביטול → יורד חזרה ל‑starter (חינם).
- ☐ רכישת גלריה ₪590 → הגלריה נפתחת ל‑12 חודשים.

---

## בדיקות שאני יכול לעשות (וכבר עשיתי חלק)
- ✅ אימתתי חי שההגנות של הטפסים עובדות בפרודקשן (Turnstile אכיף, ולידציה) — בלי לשלוח SMS.
- ✅ אימתתי ש‑`create-checkout` לא פרוס (מקור הבעיה).
- ☐ **אחרי שתגדיר Secrets** — אני יכול לבדוק (בבטחה, בלי ליצור תשלום אמיתי) שכל 4 הווריאנטים מוגדרים נכון בשרת, לפני שמדליקים.

---

## בטיחות ונסיגה (Rollback)
- שום דבר לא מחייב עד שמדליקים את הדגל בשלב 5. אפשר לעצור בכל שלב.
- **כיבוי מיידי** אם משהו משתבש אחרי ההדלקה: קבע `VITE_FEATURE_GALLERY_BILLING=0` ב‑Vercel + Redeploy → כפתורי הרכישה נעלמים מיד.
- מחירים לא נכונים בעמוד: מבטלים את מיזוג PR המחירים (revert) — אבל עדיף פשוט לתקן את המספרים ב‑3 הקבצים.

---

## תזכורת
- ה‑**stash** שלך (`stash@{0}`, "WIP pricing page storage framing") עדיין שמור ולא נגעתי בו. אם היו שם שינויים למחירים — ייתכן שהם מתנגשים עם PR המחירים החדש; נבדוק כשתרצה.
- הערך `plans.price_monthly_cents` במסד הנתונים ($19/$39/$94) הוא **מת** (לא נקרא בשום מקום). לא נגעתי בו לפי בקשתך. אפשר לתקן בעתיד כדי לא לבלבל.
