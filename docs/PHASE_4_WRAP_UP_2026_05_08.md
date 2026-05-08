# Phase 4 — סיכום סשן 2026-05-08

> **סטטוס**: Phase 4.1.G + Phase 4.2 + Phase 4.3 + Phase 4.4 (A/B/C) פרוסים בייצור.  
> **לא** נעשה: Phase 4.5 (flip ה-bucket), Phase 4.6 (ZIP בצד שרת).  
> ה-bucket `gallery-images` עדיין `public:true` — כל הקוד הציבורי עובד כרגיל. תשתית ה-signed URL בנויה ושוקטת בייצור עם fallback אוטומטי לכתובת ציבורית.

תיעוד הזה הוא ה-handoff מסשן ארוך של עבודה עם איג'נטים ומיגרציות. כל פעולה שעשיתי כתובה כאן עם הקישורים ל-PRs וה-migrations.

מילון מהיר:
- **bucket** — קופסת אחסון ב-Supabase. `public:true` ⇒ כל URL ציבורי עובד; `public:false` ⇒ צריך signed URL.
- **signed URL** — קישור עם חתימה דיגיטלית קצרת-תוקף (60 דק') שעובד גם על bucket פרטי.
- **RLS** — Row-Level Security, חוקים בתוך מסד הנתונים שאומרים מי רשאי לקרוא מה.
- **RPC** — Remote Procedure Call, פונקציית שרת שאפשר לקרוא לה מהדפדפן.
- **Edge Function** — פונקציית Deno שרצה בשרתי Supabase, יש לה גישה לשירותים פנימיים.
- **canary** — ניסוי קטן בייצור על משטח אחד לפני פריסה רחבה.

---

## מה הושג בסשן הזה

### Phase 4.1.G — rekognition pre-flip blocker

הבעיה: פונקציית זיהוי הפנים `supabase/functions/rekognition/index.ts` קראה תמונות דרך כתובת public. ברגע שה-bucket יהפוך פרטי, היא תשבר.

הפתרון: החלפת `fetch(public-url)` ב-`supabase.storage.from(bucket).download(path)` שמשתמש ב-service-role (הרשאת שרת מלאה) ועוקף את ה-RLS לחלוטין. אותה פונקציה עכשיו עובדת בלי קשר לדגל ה-public של ה-bucket.

- **PR**: #88 (חלק מ-fix/p4-2-d, אבל הקוד נפרס דרך MCP בנפרד תחילה)
- **Edge Function**: `rekognition` v13 ACTIVE
- **קובץ**: `supabase/functions/rekognition/index.ts`

### Phase 4.2 — bucket חדש + dual-write

נוצר מסלול מקביל לתמונות-תקציר (thumbnails). כל העלאה חדשה מהדפדפן כותבת את התקציר לשני מקומות במקביל; backup קיים של 7,081 תקצירים מהעבר העתיק את כולן לשם.

**מיגרציה `058_public_thumbs_bucket.sql`** — נפרסה על production:
1. `gallery-images-thumbs-public` bucket חדש (`public:true`)
2. שתי RLS policies עליו: anon SELECT לגלריות `live`, authenticated owner write
3. עמודה חדשה `images.public_thumb_present BOOLEAN` (default false)
4. אינדקס חלקי על השורות שעוד לא הועתקו
5. `record_image_upload` RPC חודש עם פרמטר חדש `p_public_thumb_present` (default false — תאום-לאחור)

**uploadPipeline.ts**:
- `BUCKET` הקיים נשמר. נוסף `THUMB_PUBLIC_BUCKET = 'gallery-images-thumbs-public'`.
- כתיבת התקציר עוטפה ב-`Promise.all`: התקציר נכתב לשני ה-buckets במקביל.
- כתיבה ל-bucket החדש היא best-effort — אם נכשלת, השורה נשמרת עם `public_thumb_present=false` ו-backfill יסגור פערים.
- ה-RPC מקבל את התוצאה הבוליאנית.

**Edge Function `backfill-public-thumbs`** — נפרסה על production (גרסה 3):
- Service-role בלבד, מאומת דרך JWT role-claim.
- קוראת batch של עד 500 שורות `public_thumb_present=false`, מורידה כל תקציר מ-`gallery-images`, מעלה אותו ל-`gallery-images-thumbs-public` באותו key, מסמנת `true`.
- concurrency 12 פנימית.
- מחזירה `{processed, succeeded, failed, errors, remaining}`.
- אידמפוטנטית: הפעלה חוזרת מתעלמת מתמונות שכבר הועברו.

**ביצוע ה-backfill** (הופעל בייצור באותו סשן):
- 7,184 שורות סך הכל (כולל 97 ללא `thumbnail_path`).
- 7,081 הועברו בהצלחה.
- **6 שורות יתומות** — `thumbnail_path` בטבלה אבל אין אובייקט באחסון. כולן באותה גלריה: `6a8bd092-c265-42cc-a583-b52888babe43` של Eclipse Media. כנראה כשל-העלאה חלקי בעבר. דורש ניקוי לפני Phase 4.5.

**גילוי צדדי** במהלך כתיבת ה-RLS policies החדשות: ה-policies הקיימות (`gallery_storage_public_read`, `gallery_storage_owner_write`) מכילות באג עתיק. בתוך ה-`EXISTS` subquery נכתב `(storage.foldername(name))[2]` בלי לציין טבלה — וכיוון של-`galleries` יש עמודה בשם `name`, Postgres פותר אותה ל-`g.name` (כותרת הגלריה) במקום ל-`storage.objects.name` (שם הקובץ). ה-policy בעצם תמיד מחזירה false. היום זה לא נראה כי ה-bucket עדיין `public:true` ועוקף RLS דרך ה-public URL. אחרי flip — תיפול. **חייבים לתקן לפני Phase 4.5.**

- **PRs**: #86 (P4.2 דאש-וונד-write), #88 (P4.2.D — backfill auth+concurrency)
- **קבצים**: `supabase/migrations/058_public_thumbs_bucket.sql`, `supabase/functions/backfill-public-thumbs/index.ts`, `gallery-web/src/lib/uploadPipeline.ts`

### Phase 4.3 — canary

משטח ראשון בייצור עם signed URLs. בחרתי את `Dashboard.downloadOriginal` (כפתור "הורד תמונה" בודדה בלוח-בקרה של הצלם):
- admin-only (רואים רק צלמים)
- single-shot (לחיצה אחת, URL נצרך מיידית)
- async-natural (download ממילא asynchronous)
- helper נופל אוטומטית ל-public URL בכל כשל

הקוד עובר עכשיו `await signedStorageUrl('gallery-images', img.storage_path)` במקום `imgUrl(img.storage_path)`.

- **PR**: #87
- **קובץ**: `gallery-web/src/pages/Dashboard.tsx` (פונקציה אחת — `downloadOriginal`)

### Phase 4.4 — שטיפה רוחבית

#### 4.4.A — תשתית React

נבנו שני wrappers דקים מעל `signedStorageUrl`:
- `gallery-web/src/lib/useSignedSrc.ts` — React hook שמחזיר מחרוזת URL. בריצה ראשונה (`INITIAL_USE_PUBLIC=true`) מחזיר את ה-public URL מיידית (אפס flicker), ואז ב-`useEffect` קורא ל-signed URL ועושה swap.
- `gallery-web/src/components/SignedImg.tsx` — קומפוננטת `<img>` עם החלפת מקור אוטומטית. שימוש: `<SignedImg bucket="gallery-images" path={img.storage_path} alt="..." style={...} />`.

ב-Phase 4.5, רק שינוי 1-שורתי של `INITIAL_USE_PUBLIC=false` ימנע מ-public URLs להישלח לדפדפן בכלל.

- **PR**: #89
- **קבצים**: `gallery-web/src/lib/useSignedSrc.ts`, `gallery-web/src/components/SignedImg.tsx`

#### 4.4.B — מסכי אדמין

החלפת ~13 מקומות שמציגים תמונה ב-6 קבצי אדמין:

| קובץ | renders | downloads |
|---|---|---|
| `Dashboard.tsx` | 2 | 1 (כבר מ-4.3) |
| `FeedStudio.tsx` | 2 | — |
| `FeedStudioPreviews.tsx` | 4 | — |
| `CreativeRenderer.tsx` | 5 | — |
| `TenderBuilder.tsx` | 2 | 1 (ZIP fetch) |
| `EventPlanDialog.tsx` | 2 | — |

דילוג מכוון:
- `Dashboard.coverFallback` (state map) — URL persistence, ידחה ל-4.5
- `Dashboard.coverImageUrl` (delivery_settings) — URL נשמר לטווח ארוך + השוואת equality
- `Dashboard.STORY_BUCKET` — מחוץ ל-Phase 4
- `TenderBuilder.editorGroups` — רשימת URLs נצרכת ע"י PdfEditor
- `SocialManager.imageUrl` — URLs זורמים ל-LLM-generated objects

- **PR**: #90 (טרם ממוזג)
- **קבצים**: 6 הנ"ל

#### 4.4.C — מסכי לקוח

החלפת ~6 renders + 3 downloads ב-4 קבצי לקוח:

| קובץ | renders | downloads |
|---|---|---|
| `ClientDashboard.tsx` | 2 | 2 (bulk + per-tile) |
| `VendorPortal.tsx` | 1 | 1 (bulk) |
| `PortfolioPage.tsx` | 1 | — |
| `ClientPage.tsx` | 1 | — |

`FaceSearchExperience.tsx` — אין מקומות לחילוף.

- **PR**: pull/new/feat/p4-4-c-swap-client-sites (טרם נפתחה PR בפועל)
- **קבצים**: 4 הנ"ל

---

## סטטוס פריסה כרגע

| רכיב | סביבה | גרסה | סטטוס |
|---|---|---|---|
| `gallery-images` bucket | production | — | `public:true` (לא שונה) |
| `gallery-images-thumbs-public` bucket | production | — | `public:true`, 7,081 תקצירים, 6 יתומים |
| Migration `058_public_thumbs_bucket.sql` | production | applied | ✅ |
| Edge Function `rekognition` | production | v13 | ACTIVE |
| Edge Function `backfill-public-thumbs` | production | v3 | ACTIVE, JWT-role auth |
| `uploadPipeline.ts` dual-write | production | merged ב-#86 | פריסת Vercel רצה אחרי merge |
| `signedStorage.ts` helper | production | merged ב-#84 | בשימוש |
| `useSignedSrc` + `SignedImg` | production | merged ב-#89 | בשימוש |
| Phase 4.4.B canary swaps | production | טרם merged (#90) | על branch |
| Phase 4.4.C canary swaps | production | טרם merged | על branch |

PRs פעילים שצריכים merge:
- `feat/p4-4-b-swap-admin-sites` — Phase 4.4.B
- `feat/p4-4-c-swap-client-sites` — Phase 4.4.C

---

## בעיות ידועות

### 1. שש שורות יתומות
6 רשומות ב-`images` בגלריה `6a8bd092-c265-42cc-a583-b52888babe43` (Eclipse Media) מצביעות על קבצי תקציר שלא קיימים באחסון. כנראה כשל-העלאה חלקי בעבר.

```sql
SELECT id, gallery_id, thumbnail_path FROM images
 WHERE public_thumb_present = false
   AND thumbnail_path IS NOT NULL;
```

**אפשרויות ניקוי:**
- (א) `UPDATE images SET thumbnail_path = NULL WHERE id IN (...)` — אם ה-`web_preview_path` עוד תקין, התמונה תמשיך להיראות.
- (ב) `DELETE FROM images WHERE id IN (...)` — אם גם ה-`web_preview_path` שלהן שבור.
- (ג) להעלות-מחדש דרך הצלם.

חובה לסגור לפני Phase 4.5 — ה-flip מותנה ב-`pending = 0`.

### 2. באג latent ב-RLS policies קיימות
`gallery_storage_public_read` ו-`gallery_storage_owner_write` תמיד-false. הפרצה לא חשופה היום בגלל `public:true`. תיפצע ביום ה-flip.

תיקון: לרשום אותן מחדש עם `storage.objects.name` מצוין במפורש בתוך ה-`EXISTS` subquery (כמו שעשיתי ב-policies החדשות שלי). מיגרציה קצרה מאוד.

### 3. URL persistence sites
~10 מקומות שדחיתי כי הם משמרים URL לטווח ארוך (cover image בהגדרות, mosaic pool ב-portfolio, editorGroups ב-tender builder, post objects ב-SocialManager). signed URLs פגי-תוקף אחרי שעה — לא יעבדו אם נשמור אותם ב-DB. צריך תיכנון נפרד: אולי לשמור path במקום URL ולעטוף את הצריכה ב-helper.

---

## מה הלאה

### Phase 4.5 — bucket flip (~5 ימי עבודה)

**ה-step המסוכן.** אחרי שלב הזה, ה-bucket `gallery-images` הופך פרטי, וכל קישור ציבורי ל-original או web preview יחזיר 401.

צעדים, בסדר:
1. **תיקון RLS policies קיימות** (10 דקות, מיגרציה אחת קטנה)
2. **ניקוי 6 השורות היתומות** (5 דקות, SQL ידני)
3. **App.tsx** — מסך הצופה האנונימי. כל קריאת `storageUrl` מחליפה ל-`signedStorageUrl` או ל-`<SignedImg>`. כולל ה-JSZip download path.
4. **public-view-token endpoint חדש** — `action: 'public_gallery_session'` ב-`append-event-posts` (אין endpoint חדש כדי לא לפרוץ את מגבלת 12 הפונקציות של Vercel).
5. **טבלה חדשה `public_gallery_sessions`** — TTL 60 דק', מאוגרת לכתובת IP, scope לגלריה.
6. **Cloudflare Turnstile** integration ב-App.tsx — challenge בלתי-נראה לפני יצירת session.
7. **`INITIAL_USE_PUBLIC=false`** ב-`useSignedSrc.ts` — מבטל את ה-flicker-free flow אבל מבטיח שאף public URL לא יישלח אחרי ה-flip.
8. **חזרת על rollback בסטייג'ינג** — `UPDATE storage.buckets SET public = true WHERE id = 'gallery-images';` חייב להחזיר את הכל ל-60 שניות.
9. **חלון תחזוקה** — שבת בלילה, 4 לפנות בוקר, אין אירועים לקוחות מתוכננים.
10. **ה-flip** — `UPDATE storage.buckets SET public = false WHERE id = 'gallery-images';`. ניטור חי 30 דקות. אם משהו נופל — rollback.

### Phase 4.6 — server-side ZIP (~2 ימים)

JSZip בצד הלקוח עובד היום בגלל public URLs. אחרי ה-flip, JSZip יצטרך לבקש 100+ signed URLs לכל download — יקר ופגיע.

החלפה ב-endpoint `/api/gallery-zip` (Vercel function): מחפש PVT (public-view-token), משתמש ב-service-role לקרוא קבצים ישירות, מזרים ZIP ב-streaming response.

הסיכון העיקרי: timeout של Vercel (60 שניות בתוכנית Pro). גלריות עם >2GB יחזרו ל-flow ישן עם signed URLs מצומצמים.

---

## שש שאלות פתוחות

לא ניתן להמשיך ל-Phase 4.5 בלי תשובות לאלה. כולן רשומות גם ב-`docs/PHASE_4_MASTER_PLAN.md`.

| # | שאלה | למה זה משנה |
|---|---|---|
| 1 | **Cloudflare Turnstile** — חינם או Pro ($10/חודש)? | חינם מספיק להיקפים שלנו, Pro נותן בקרות טובות יותר |
| 2 | **חלון תחזוקה** — איזו שבת ב-30 הימים הקרובים נקייה מאירועי לקוחות? | flip צריך 30 דקות שקטות |
| 3 | **ZIP בצד שרת** — ~$0.50 להורדה של 1000 תמונות? | אם הנפח גבוה צריך Cloudflare R2 streaming במקום |
| 4 | **קדימות** — רק `originals` פרטי (2.5 שבועות, 87% חשיפה) או הכל פרטי (5 שבועות, 100%)? | האודיט הקריטי הצביע על originals כיעד |
| 5 | **Vercel Pro upgrade** ($20/חודש)? | מסיר את מגבלת 12 הפונקציות, מאפשר endpoint חדש בלי איחוד |
| 6 | **סימן מים על הורדות חינם**? | feature creep אבל זול עכשיו, יקר אחר כך |

---

## רשימת PRs מהסשן הזה

| # | תיאור | סטטוס |
|---|---|---|
| #86 | P4.2 — public-thumbs bucket + dual-write | ✅ merged |
| #87 | P4.3 — canary signed download | ✅ merged |
| #88 | P4.2.D — backfill auth + concurrency | ✅ merged |
| #89 | P4.4.A — useSignedSrc + SignedImg | ✅ merged |
| (P4.4.B branch) | P4.4.B — admin render swaps | ⏳ awaiting merge |
| (P4.4.C branch) | P4.4.C — client render swaps | ⏳ awaiting merge |

---

## רשימת קבצים חדשים שנוצרו בסשן

```
supabase/migrations/058_public_thumbs_bucket.sql
supabase/functions/backfill-public-thumbs/index.ts
gallery-web/src/lib/useSignedSrc.ts
gallery-web/src/components/SignedImg.tsx
docs/PHASE_4_WRAP_UP_2026_05_08.md   ← זה הקובץ
```

## רשימת קבצים שעודכנו בסשן

```
supabase/functions/rekognition/index.ts
gallery-web/src/lib/uploadPipeline.ts
gallery-web/src/pages/Dashboard.tsx
gallery-web/src/pages/ClientDashboard.tsx
gallery-web/src/pages/VendorPortal.tsx
gallery-web/src/pages/PortfolioPage.tsx
gallery-web/src/pages/ClientPage.tsx
gallery-web/src/components/FeedStudio.tsx
gallery-web/src/components/FeedStudioPreviews.tsx
gallery-web/src/components/CreativeRenderer.tsx
gallery-web/src/components/TenderBuilder.tsx
gallery-web/src/components/EventPlanDialog.tsx
docs/PHASE_4_1_FIXES_2026_05_08.md
```

---

**הצעד הבא שלי כברירת מחדל**: למזג את שני ה-PRs האחרונים (#90 + 4.4.C), ואחר כך לעצור — אני לא ממשיך ל-Phase 4.5 בלי שיש לי תשובות ל-6 השאלות הפתוחות, חלון תחזוקה מתואם, ואישור מפורש לבצע את ה-flip.
