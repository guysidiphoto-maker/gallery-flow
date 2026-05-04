# Pixflow — ארכיטקטורה לפלטפורמה

> מסמך תכנון מערכת ברמת CTO. מתעד את כל ההחלטות לפני שמתחילים לקודד את שלב A.

---

## 1. החזון

**Pixflow = Pixieset בעברית** עם:

1. **זיהוי פנים כ-toggle** — כל גלריה יכולה להפעיל/לכבות זיהוי פנים אופציונלית (כמו Pixshare, אבל לא חובה).
2. **תמחור טוקנים = תמונה** — שקוף, פשוט, פעולתי. 1 טוקן = העלאת תמונה אחת.
3. **חוויית משתמש מלוטשת** — אנימציות, ויז'ואל מיוחד, RTL מקורי, בלי שיחת מכירות.
4. **מהירות וזרימה** — צלם נכנס וכבר עובד.

---

## 2. עקרונות מנחים

1. **Single source of truth** — לכל מצב יש מקום אחד שמחזיק את האמת. למשל "האם המקור בענן?" — האמת בענן עצמו, לא בפלאג ב-DB.
2. **Idempotency** — כל פעולה ניתנת להרצה מחדש בלי נזק. מחיקת גלריה, אינדוקס פנים, העלאת תמונה — כולם idempotent.
3. **Async by default** — כל מה שלוקח יותר מ-2 שניות עובר לרקע. הצלם לא מחכה.
4. **Cost-traceable** — כל פעולה שעולה לנו כסף (AWS, S3, Twilio) נספרת ומחויבת בטוקנים.
5. **Defensive multi-tenancy** — RLS היא הקו הראשון, לא התראה. שום business לא יכול לקרוא נתונים של business אחר גם אם הקליינט פגום.

---

## 3. מודל הנתונים (Domain Model)

```
auth.users (Supabase Auth)
    └── businesses (1:1)
          ├── business_tokens          (יתרה + ledger)
          ├── business_settings         (branding, default presets)
          ├── clients                   (1:N, אופציונלי לארגון גלריות)
          │     └── (galleries optionally linked)
          └── galleries (1:N)
                ├── gallery_sections           (1:N — "Day 1", "Day 2"...)
                ├── images (1:N) ─── face_index entries (AWS Rekognition)
                ├── stories (1:N — סטוריז וידאו קצרים)
                ├── gallery_unlock_tokens      (1:N — שער חתום)
                ├── gallery_password_attempts  (1:1 — rate-limit)
                ├── gallery_favorites          (1:N — אורחים מסמנים תמונות)
                ├── gallery_favorite_notes     (1:N — הערה ליד favorite)
                ├── gallery_hidden_images      (1:N — צלם/לקוח מסתיר)
                ├── gallery_email_log          (1:N — שיתופי מייל)
                ├── gallery_download_log       (1:N — מי הוריד מה ומתי)
                └── token_consumption_log      (1:N — על כל תמונה שהועלתה)
```

---

## 4. שכבות מערכת (System Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  Marketing site + Photographer Dashboard + Client Viewer    │
│  (gallery-web/ — React + Vite, על Vercel)                   │
└─────────────────────────────────────────────────────────────┘
              │                                │
              │ Supabase JS Client             │ Supabase Functions Invoke
              ▼                                ▼
┌─────────────────────────────────┐  ┌─────────────────────────┐
│  Supabase Postgres + RLS        │  │  Edge Functions (Deno)  │
│  - Tables, RPCs, Migrations     │  │  - rekognition          │
│  - SECURITY DEFINER for gates   │  │  - create-checkout      │
│                                 │  │  - lemonsqueezy-webhook │
│                                 │  │  - upload-orchestrator  │
│                                 │  │  - reaper (cron)        │
└─────────────────────────────────┘  └─────────────────────────┘
              │                                │
              │ Storage (S3-compatible)        │
              ▼                                ▼
┌─────────────────────────────────┐  ┌─────────────────────────┐
│  Supabase Storage Buckets       │  │  AWS Rekognition        │
│  - gallery-images   (public)    │  │  + LemonSqueezy         │
│  - gallery-stories  (public)    │  │  + Twilio (SMS)         │
│  - business-assets  (private)   │  │  + Resend (email)       │
└─────────────────────────────────┘  └─────────────────────────┘
```

### החלטות מפתח

- **Edge functions בלבד** לפעולות שמערבות צד-שלישי (AWS, LemonSqueezy, Twilio). אף לקוח לא קורא אליהם ישירות.
- **Browser-side image processing** עם Canvas/WebCodecs לוובפריוויו ותמבנייל. חוסך upload + processing time.
- **TUS resumable upload** לקבצי original > 5MB (כבר קיים בדסקטופ, נשכפל לאתר).
- **Public buckets לעת עתה** — Storage privacy תידחה לסוף (migration גדול בנפרד).

---

## 5. ארכיטקטורת טוקנים (Token Economy)

המנוע הכלכלי. מתוכנן כ-auditable.

```sql
business_tokens (
  business_id        UUID PK,
  balance            INTEGER NOT NULL DEFAULT 0,
  lifetime_purchased INTEGER NOT NULL DEFAULT 0,
  lifetime_consumed  INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ
)

token_ledger (
  id            UUID PK,
  business_id   UUID NOT NULL,
  delta         INTEGER NOT NULL,        -- +X לרכישה, -1 לתמונה
  reason        TEXT NOT NULL,           -- 'purchase' / 'image_upload' / 'refund' / 'admin_grant'
  ref_id        UUID,                    -- gallery_id / image_id / order_id
  metadata      JSONB,                   -- בילינג, מקור, כל מה שצריך לאודיט
  created_at    TIMESTAMPTZ
)
```

**RPC יחיד שמדבר עם הטבלאות:**

- `consume_token(business_id, reason, ref_id)` — atomic transaction, מחזיר balance חדש
- `add_tokens(business_id, count, reason, ref_id)` — לאחר תשלום
- `get_balance(business_id)` — מהיר, מקרא בלבד

**אכיפה:**

- כל insert ל-`images` מטריגר `consume_token('image_upload', image_id)` באותה טרנזקציה
- אם balance=0 → trigger זורק שגיאה → upload נכשל בצד הלקוח
- צלם רואה Toast: "אין מספיק טוקנים. רכוש כדי להמשיך"

**חבילות מומלצות:**

| חבילה | טוקנים | מחיר |
|---|---|---|
| חינם להרשמה (דמו) | 100 | 0 ₪ |
| בייסיק | 500 | 99 ₪ |
| מקצועי | 2,000 | 299 ₪ |
| עסקי | 10,000 | 999 ₪ |

---

## 6. Pipeline העלאה (Upload Pipeline)

זה החסם הקריטי כיום באתר. הזרימה החדשה:

```
1. Browser: drag&drop של תמונות
2. Pre-flight: שולח רשימה + size לאדג'-פונקציה upload-orchestrator
3. Orchestrator: בודק יתרת טוקנים, מאשר/דוחה, מחזיר manifest
4. Browser: לכל תמונה במקביל (4 בו-זמנית):
   a. Compress to web preview (Canvas, ~1080px wide, 80% jpeg)
   b. Generate thumbnail (Canvas, ~360px wide)
   c. Upload thumbnail (small, fast)
   d. Upload web preview (medium)
   e. Upload original (TUS resumable, large)
   f. Insert images row + consume_token() באותה RPC
5. כל הצלחה מעדכנת UI בזמן אמת
6. אם דף נסגר באמצע: TUS resume בכניסה הבאה
```

### למה לא Edge function גדול שעושה הכל?

- Edge function timeout 60s — לא מתאים ל-2000 תמונות
- צריך feedback בזמן אמת על כל תמונה
- Browser כבר מבצע ייעול תמונות מצוין דרך Canvas

---

## 7. Pipeline זיהוי פנים (Face Recognition)

```
1. Publish gallery (status=live) → אם face_index_enabled → invoke('rekognition', {action: 'index_gallery'})

2. Edge function:
   a. CreateCollection אם אין
   b. שולף את כל images עם web_preview_path ובלי face_indexed_at
   c. עובד במקביל (6 בכל פעם), IndexFaces על כל תמונה
   d. מסמן face_indexed_at + face_count
   e. אם הופסק (timeout) — auto-resume בקריאה הבאה

3. Guest opens gallery + presses face search:
   a. Camera selfie
   b. Upload to rekognition function (search action)
   c. SearchFacesByImage על ה-collection
   d. מחזיר רשימת image_ids matched
   e. Frontend מציג רק את התמונות האלה
```

### Cost optimization

- Cache תוצאות חיפוש לפי SHA256 של הסלפי (כבר קיים)
- Rate limit לפי IP+gallery (כבר קיים)
- Pre-flight: דוחה selfie > 5MB לפני שמגיע ל-AWS (חסר, צריך להוסיף)

---

## 8. שכבות אבטחה

מודל הגנה רב-שכבתי:

| שכבה | מה היא מגינה | סטטוס |
|---|---|---|
| Supabase Auth | זהות משתמש | ✅ |
| RLS על galleries | business_id matches | ✅ |
| Signed gate (mig 041) | Token חתום במקום sessionStorage | ⏳ ב-PR |
| Rate limit על passwords | 5 ניסיונות + cooldown | ✅ |
| Rate limit על face search | 500/שעה לכל IP+gallery | ✅ |
| Pre-flight selfie size | דוחה > 5MB לפני AWS | ❌ |
| Private buckets + signed URLs | מי שלא חתום לא קורא | 🔮 עתיד |

---

## 9. ארכיטקטורת Frontend

```
gallery-web/
├── src/
│   ├── pages/
│   │   ├── LandingPageHe.tsx       (שיווק עברית)
│   │   ├── Dashboard.tsx           (צלם — היום הכל בקובץ אחד)
│   │   ├── Editor/                 ← פיצול עתידי
│   │   │   ├── PhotosTab.tsx
│   │   │   ├── DesignTab.tsx
│   │   │   ├── SettingsTab.tsx
│   │   │   └── ActivitiesTab.tsx
│   │   ├── ClientPage.tsx          (לקוח רואה גלריות)
│   │   └── DemoPage.tsx
│   ├── App.tsx                     (הצופה הציבורי — המוצר העיקרי)
│   ├── components/
│   │   ├── viewer/                 (Modal, Mosaic, FaceSearch)
│   │   └── editor/                 ← חדש
│   │       ├── BulkActionBar.tsx
│   │       ├── DesignPreview.tsx
│   │       └── TokenBadge.tsx
│   └── lib/
│       ├── galleryClient.ts        (RPCs)
│       ├── tokenClient.ts          ← חדש
│       ├── uploadPipeline.ts       ← חדש (browser-side compression + TUS)
│       └── auth.ts
```

**עקרון:** קומפוננטות ברמה גבוהה לא יודעות אם המשתמש משלם או לא, רק קוראות `tokenClient.getBalance()`. זה מאפשר A/B testing על תמחור.

---

## 10. Migration Path

הכל חייב להיות בלי לפגוע באלמה ו-lsports שמשרתים עכשיו.

### שבוע 1: שלב A — תשתית

- **A1.** Pipeline העלאה תלת-שכבתי בדפדפן
- **A2.** מערכת טוקנים (טבלה, RPC, ledger)
- **A3.** חיווי יתרה + חסימת העלאה

### שבוע 2-3: שלב B — מבנה Pixieset

- **B1.** פיצול Editor ל-4 טאבים
- **B2.** Activities tab עם logging events
- **B3.** Design tab עם Live Preview
- **B4.** Bulk actions

### שבוע 4: שלב C — חוויית לקוח

- **C1.** Email share flow
- **C2.** Favorites + Notes
- **C3.** Watermarks
- **C4.** Presets

### שבוע 5: שלב D — ויז'ואל וואו

- Framer Motion, מיקרו-אנימציות, onboarding מסיפור, gradients/glow/depth

---

## 11. החלטות שצריך לקבל עכשיו

לפני שמתחילים לקודד:

1. **Hosting**: Vercel נשאר. צריך לוודא custom domain (`pixflow-ai.com`) מצביע נכון.
2. **Payment provider**: LemonSqueezy או Stripe? יש `create-checkout` ו-`lemonsqueezy-webhook` קיימים → ממשיכים עם LemonSqueezy.
3. **Default token grant**: כמה טוקנים חינם להרשמה? המלצה: **100**.
4. **Token = תמונה גולמית או תמונה שעלתה בהצלחה?** — חיוב רק על **הצלחה** (אם upload נכשל → לא מחויב).
5. **Face recognition cost**: כל תמונה = 1 טוקן בלי קשר אם פעיל face index? או +1 אם פעיל? המלצה: **+1 אם face_index פעיל בגלריה**.
6. **Branding/Domain**: pixflow-ai.com משמש לאפליקציה. האם דומיין שיווקי שונה (pixflow.app) או הכל באותו מקום? המלצה: **הכל באותו מקום** — Pixshare טעו בזה.
7. **Free tier vs paid tier features**: כל הפיצ'רים זמינים לכולם, רק מוגבל בטוקנים? או חבילה חינם עם פיצ'רים מוגבלים? המלצה: **כל הפיצ'רים פתוחים, רק טוקנים מגבילים**.

---

## 12. ההמלצה הסופית

מתחילים מ-**A1 (העלאה תלת-שכבתית)** במקביל ל-**A2 (מערכת טוקנים)**. שניהם בלי-להם-אין-מוצר. לוקח שבוע. אחרי זה כבר אפשר להזמין צלמים ראשונים.
