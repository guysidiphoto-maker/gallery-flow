# Pixflow — מפת מערכת מלאה

עודכן: 2026-05-06

מסמך הייחוס המרכזי. כל פעם שאתה לא בטוח "מה יש לנו" — תקרא כאן.

---

## סקירה במשפט אחד

Pixflow היא פלטפורמת משלוח גלריות לצלמי אירועים: **דסקטופ Mac** לעיבוד הכבד, **אתר עברית** ללקוח/אורח (זיהוי פנים → התמונות שלי), **דשבורד צלם** לניהול עסק, ו-**SaaS** שמוכר את הכל לצלמים אחרים.

---

## גרסאות נוכחיות

| רכיב | גרסה | טכנולוגיה | מיקום |
|---|---|---|---|
| Desktop app | `1.0.5` | Electron + React + Vite | `src/renderer/` |
| Web platform | `1.0.0` | Vite + React | `gallery-web/` |
| Backend | — | Supabase (Postgres + Auth + Storage + Edge Fns) | `supabase/` |
| Migrations applied | 050 | SQL | `supabase/migrations/` |

URL ייצור: **https://pixflow-ai.com**
Supabase project ref: `vlyiqfawkrjvqcmkpfvs`
Vercel project: `prj_ZItyMnCwuMVQgPYEX7qcKSY4XwMH` (team eclipse media)

---

## 1. אפליקציית Desktop (Mac)

**מי משתמש?** הצלם בסטודיו. כלי עבודה יומיומי לעיבוד אירוע אחרי צילום.

### מה היא יודעת לעשות

| יכולת | קומפוננטה ראשית |
|---|---|
| תצוגת המרכז של כל האירועים | `WorkspaceDashboard.tsx` |
| גריד תמונות + lightbox | `GalleryGrid` + `ImageCard` + `ImageViewer` |
| סקשנים (חופה / ריקודים / ארוחה) | `SectionsPanel` |
| Top picks (כוכב על תמונה) | `TopPicksTray` |
| סינון וחיפוש | `Toolbar` + `FilterBar` |
| שינוי שמות בבת אחת | `RenameFab` + `RenamePreviewModal` |
| זיהוי כפילויות | `DuplicatesPanel` |
| **סטוריז MP4 לאינסטגרם** | `StoryModal` (5 פריסטים: Clean / Cinematic / Fast Social / Elegant / Vintage) |
| **גריד אינסטגרם** | `SocialMode` |
| ייצוא ZIP / לקוח / Instagram | `ExportPanel` |
| העלאה לענן + פרסום | `PublishPanel` + `PublishModal` |
| חיווי העלאה | `UploadFloater` |
| ניהול לקוחות | `ClientsDashboard` + `ClientDetail` + `ClientGalleryPage` |
| ספקים (קייטרינג, עוגייה) ותיוג בתמונות | `VendorsPanel` |
| בניית שאלונים | `QuestionnaireBuilder` |
| הגדרות עסק | `BusinessSettingsModal` |

### מודל איזון Desktop ↔ Web

הדסקטופ עושה את העיבוד הכבד (1000+ תמונות, יצירת thumbs/web/originals, סטוריז MP4, פרצופים). ה-web מקבל את התוצאה המוכנה ומציג אותה.

מבנה Storage קבוע: `{slug}/{galleryId}/{thumbs|web|originals}/{hash8}_{filename}` — שניהם מצייתים לסכמה הזו.

---

## 2. Web Platform

### א. דשבורד צלם — `Dashboard.tsx`

**URL**: `pixflow-ai.com/dashboard` (אחרי login)

טאבים בעורך גלריה:

| טאב | מה זה | סטטוס |
|---|---|---|
| **Photos** | גריד תמונות, drag-reorder, top-picks, bulk actions, מחיקה, ניהול סטים | ✅ |
| **Stories** | העלאת MP4, מחיקה | ✅ חדש (#53) |
| **Activity** | לוגים של downloads/favorites/emails | ✅ |
| **Design — Cover** | סגנון מסך פתיחה, תמונת cover, כותרת, שם לקוח | ✅ |
| **Design — Typography** | הגדרת גופנים | ✅ |
| **Design — Color** | accent color | ✅ |
| **Design — Grid** | מספר עמודות | ✅ |
| **Design — Navigation** | Watermark, theme | ✅ |
| **Settings** | הורדות, password gate, custom domain, face recognition opt-in | ✅ חלקי |

### ב. צופה גלריה — `App.tsx`

**URL**: `pixflow-ai.com/<business>/<gallery>` או `/gallery/<id>` (או דומיין מותאם של הצלם)

| יכולת | סטטוס |
|---|---|
| Welcome screen — Mosaic / Cinematic / Minimal | ✅ |
| Top picks → אם אין, 30 ראשונות | ✅ (#54) |
| Photo grid עם sections | ✅ |
| Lightbox (`Viewer.tsx`) | ✅ |
| ❤️ Heart על תמונה (favorites) | ✅ |
| Download single + batch ZIP | ✅ |
| **FaceSearchExperience** — סלפי → התמונות שלי | ✅ |
| **StoryPlayer** — נגן 9:16 מלא-מסך עם swipe + מקלדת | ✅ חדש (#53) |
| Email-share modal — שולח קישור במייל | ✅ |
| Hebrew/English לפי `delivery_settings.language` | ✅ |
| RTL/LTR auto | ✅ |

### ג. דשבורד לקוח — `ClientDashboard.tsx`

**URL**: `pixflow-ai.com/<biz>/client/<clientId>/dashboard`

ללקוח קוד אישי. מסך אחד שמרכז את כל מה שהצלם עשה עבורו:

| טאב | תוכן |
|---|---|
| **Content** | כל ה-top picks מכל האירועים שלו |
| **Calendar** | `SocialManager` — תזמון פוסטים אינסטגרם (3 טוני קופי) |
| **Galleries** | רשימת אירועים, masonry / grid / list, hover preview |
| **Stories** | סטוריז שהצלם הכין מאירועיו |
| **My Page** | `PortfolioEditor` — עריכת אתר אישי |
| **Tender** | `TenderBuilder` — חיפוש לתקציר/הצעה |

### ד. עמוד פורטפוליו לקוח — `PortfolioPage.tsx`

**URL**: `pixflow-ai.com/<biz>/client/<clientId>` (ציבורי)

האתר האישי שהלקוח עיצב ב-`PortfolioEditor`. כולל לוגו, טאגליין, accent color, סגנון hero, רקע, גופן, גלריות, איש קשר.

### ה. דפי שיווק

- `LandingPageHe.tsx` — דף נחיתה ראשי (עברית)
- `LandingPage.tsx` — אנגלית
- `DemoPage.tsx` — דמו לצלמים פוטנציאליים
- `TermsPage` + `PrivacyPage` — משפטיים

### ו. מסלולים נוספים

- `EventCapturePage` — QR באירוע → SMS עם קישור (Twilio)
- `QuestionnairePage` — שאלון אחרי אירוע
- `VendorPortal` — תיוג ספקים בתמונות

---

## 3. Backend — Supabase

### 3.1 טבלאות (26)

| קבוצה | טבלאות |
|---|---|
| **חשבונות** | `businesses`, `subscriptions`, `plans`, `business_tokens`, `token_ledger` |
| **גלריות** | `galleries`, `images`, `gallery_sections`, `stories` |
| **לקוחות** | `clients`, `client_page_settings`, `gallery_hidden_images` |
| **אבטחה** | `gallery_unlock_tokens`, `gallery_password_attempts` |
| **פעילות** | `gallery_download_log`, `gallery_favorites`, `gallery_email_log` |
| **זיהוי פנים** | `image_faces`, `face_search_cache`, `rekognition_search_log` |
| **ספקים** | `vendors`, `image_vendor_tags` |
| **אירועים QR** | `events`, `event_leads` |
| **שאלונים** | `questionnaires`, `questionnaire_responses` |

### 3.2 Edge Functions

| פונקציה | תפקיד | גרסה |
|---|---|---|
| `rekognition` | זיהוי פנים מול AWS | v12 |
| `lemonsqueezy-webhook` | חיוב + הענקת tokens | v6 |
| `share-gallery` | שליחת מייל לאורח (Resend), rate-limit 20/h | v2 |
| `verify-custom-domain` | אימות DNS TXT + רישום ב-Vercel | v1 |

### 3.3 Migrations applied (50)

| טווח | מה |
|---|---|
| 002-025 | בסיס המערכת — businesses, galleries, images, plans, RLS |
| 027-040 | password security, face recognition, demo galleries, slug routing |
| **041** | password gate שרת-צד + signed unlock tokens |
| **042** | gallery delete לא מקריס FKs (questionnaires + events) |
| **043-044** | token economy (business_tokens, token_ledger, plans.token_count) |
| **045** | activity logs (downloads, favorites, emails) |
| **046** | counters denormalized (gallery.download_count, favorite_count) |
| **047** | favorites unique fix (NULLS NOT DISTINCT באמצעות COALESCE) |
| **048** | hardening — search_path על trigger functions |
| **049** | custom domain schema + `set_business_custom_domain` RPC |
| **050** | hotfix — `gallery_get_images` ORDER BY שבר את אלמא |

### 3.4 Storage Buckets

- `gallery-images` — תמונות (thumbs/web/originals)
- `gallery-stories` — וידאו MP4
- `demo-uploads` — גלריות דמו

---

## 4. אינטגרציות חיצוניות

| שירות | תפקיד | env var עיקרי |
|---|---|---|
| **Vercel** | host של web | (project linked) |
| **Resend** | שליחת מיילים | `RESEND_API_KEY` |
| **LemonSqueezy** | חיוב + ניהול subscriptions | `LEMONSQUEEZY_WEBHOOK_SECRET` |
| **AWS Rekognition** | זיהוי פנים | `AWS_*` |
| **Cloudflare DoH** | אימות DNS TXT | (ללא API key) |
| **Sentry** | ניטור שגיאות | `VITE_SENTRY_DSN` |
| **Twilio** | SMS לאירועים QR | `TWILIO_*` |

---

## 5. תמחור — `plans` table

| | Starter | Pro | Business |
|---|---|---|---|
| Tokens חודשי | 100 (חינם בהרשמה) | 2,000 | 10,000 |
| מחיר | חינם | 79 ₪ | 159 ₪ |
| Custom domain | ❌ | ❌ | ✅ |
| Face recognition | בתוספת | בתוספת | בתוספת |

הגדרת LemonSqueezy variant ids ב-`supabase/functions/lemonsqueezy-webhook/index.ts:VARIANT_TO_PLAN`.

---

## 6. URL Routing

### בדומיין הראשי `pixflow-ai.com`

| נתיב | רכיב |
|---|---|
| `/` | `LandingPageHe` |
| `/dashboard` | דשבורד צלם |
| `/demo` | `DemoPage` |
| `/q/<id>` | שאלון |
| `/event/<id>` | QR landing |
| `/<biz>/<gallery>` | צופה גלריה (clean URL) |
| `/<biz>/gallery/<id>` או `/gallery/<id>` | צופה גלריה (id) |
| `/<biz>/client/<clientId>` | פורטפוליו לקוח |
| `/<biz>/client/<clientId>/dashboard` | דשבורד לקוח |

### בדומיין מותאם של הצלם (e.g., `photos.studio-alma.co.il`)

| נתיב | רכיב |
|---|---|
| `/` | פורטפוליו של הצלם |
| `/<gallery-slug>` | צופה גלריה (תחת העסק שמוצמד לדומיין) |
| `/dashboard` | דשבורד צלם (משותף לכולם) |

---

## 7. Recent Activity (PRs #21-#54+)

- **#21**: Production rollup — token economy, activities, password gate, watermark, sidebar, demo onboarding
- **#48**: bundle-split — חוסך ~684KB מבילד ראשוני (lazy load)
- **#49**: security fixes — מפתחות API ל-env, timing-safe webhook, SHA-256 idempotency, rate-limit מיילים
- **#50**: sync migrations + harden search_path
- **#51-#54**: photo menu popup fix, custom domain foundation, stories upload+player, welcome screen top-picks
- **`hotfix/gallery-get-images-order-by`**: תיקון RPC ששבר את אלמא + תיקון עברית מקודדת בקשיח (טרם מוזג בזמן כתיבת מסמך זה)
- **`feat/custom-domain-routing`**: routing + DNS verification + Vercel attach (טרם מוזג)

---

## 8. פערים ידועים (Known gaps)

### גדול
- **Vercel API auto-attach** דורש env vars (`VERCEL_API_TOKEN/PROJECT_ID/TEAM_ID`) על Supabase function. בלעדיהם הסטטוס מתעדכן ל-verified אבל הדומיין לא נרשם אוטומטית
- **Custom domain UI**: עדיין לא הוסקרה ע"י לקוח אמיתי בייצור

### קטן
- 4 שגיאות TypeScript קיימות ב-`Dashboard.tsx` (סביב line 3739) ו-`LandingPage.tsx` — קוסמטיות, לא חוסמות בילד
- Pre-existing RLS warnings על `galleries`/`images` עם "Full access" policies — קיימות מהבסיס
- `ip_hash` בטבלת `gallery_download_log` קיימת אבל לא ממולאת מהקליינט

### תיקונים בנגישות שעשינו
- WCAG focus trap בכל המודלים (#45)
- WCAG dialog roles + aria-labels (#43)
- WCAG contrast על textMuted (#41)
- WCAG touch targets + drag-handle (#46)

---

## 9. נהלי תפעול

### לפני merge ל-main
- ה-main מוגן ב-GitHub — דרוש PR
- ה-build חייב לעבור (`npx vite build` ב-gallery-web/)
- TypeScript strict (`npx tsc --noEmit`) — מותר רק שגיאות קיימות מקודם

### אחרי merge ל-main
- Vercel עושה auto-deploy
- migrations: להחיל ידנית דרך Supabase MCP (`apply_migration`)
- Edge functions: להחיל ידנית דרך Supabase MCP (`deploy_edge_function`)

### Production URLs
- App: https://pixflow-ai.com
- Supabase Dashboard: https://supabase.com/dashboard/project/vlyiqfawkrjvqcmkpfvs
- Vercel: https://vercel.com/eclipse-media/gallery-web
