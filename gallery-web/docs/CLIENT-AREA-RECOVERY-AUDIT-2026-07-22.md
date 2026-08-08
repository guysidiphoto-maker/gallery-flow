# Pixflow — Client Area Recovery & Web Integration Audit

תאריך: 2026-07-22 · אופי: READ-ONLY (לא שונה שום קוד, לא נוצרו migrations, לא נגעתי ב-Supabase/פרודקשן) · Repo: `/Users/guysidi/gallery-flow`

> הדוח נכתב בעברית; שמות קבצים, routes, components, tables ומזהים טכניים נשארו באנגלית. כל טענה נתמכת ב-`file:line` שאומת בקוד ע"י 6 סוכני חקירה מקבילים + typecheck.

---

## 1. Executive Summary (תקציר מנהלים)

**מה קורה בפועל:** יש כבר אזור לקוח עובד בצד ה-Web (`ClientDashboard`), מחובר לנתונים אמיתיים ב-Supabase, עם PIN gate ופרסום פוסטים אמיתי (`feed_plans`), ומנוע AI אמיתי (Anthropic Claude). זה לא mock. במקביל קיים אזור לקוח שני בצד ה-Desktop (Electron) שהוא **local-first** — הנתונים שלו יושבים בקובץ `preferences.json` על המחשב, לא בענן, ולכן אינו ניתן להעברה ישירה ל-Web.

**המסקנה המרכזית:** אין צורך לבנות מחדש. האזור הלקוח ב-Web כבר קיים, רץ, ועובר typecheck. הפער אינו "בנייה מאפס" אלא **השלמה והקשחה**: (1) חסר מסך ניהול לקוחות בצד הצלם (ה-nav item "לקוחות" מסומן "Soon" ומושבת), (2) חלק מהפיצ'רים שומרים ל-localStorage בלבד ולא ל-DB, (3) באג ה-Brand Kit אמיתי ומבני, (4) אין הפרדת הרשאות בין photographer ל-Production — הכל פתוח לכל משתמש מחובר, (5) יש דליפות קריאה חוצות-tenant ב-RLS שחלקן תוקנו ב-migration שלא הוחל בפרוד.

**מה אין בכלל:** אין אינטגרציית Instagram/Meta Graph API בשום מקום — "published" הוא רק מחרוזת סטטוס ב-UI. אין `tenant_type`, אין roles, אין `business_members`. אין טבלת `brand_kits` (זה JSONB על `businesses`). אין טבלאות campaigns/calendar/approvals/tender.

**המלצה סופית (סעיף 20):** **Adapt / Reuse** — לאמץ ולהקשיח את אזור הלקוח הקיים ב-Web, לא לבנות מחדש.

---

## 2. Repository & Application Map

Monorepo יחיד ב-`/Users/guysidi/gallery-flow`:

| Surface | נתיב | מה זה | Router |
|---|---|---|---|
| Desktop App (Electron) | `src/main`, `src/preload`, `src/renderer/src` | כלי הפקה פנימי של Eclipse. local-first. | view-state ב-`src/renderer/src/App.tsx` |
| Web SaaS (Vite SPA) | `gallery-web/src` | מוצר הצלמים: galleries, uploads, client area, social/AI | `gallery-web/src/main.tsx` — שרשרת `if` על `window.location.pathname` (אין react-router) |
| API (serverless) | `gallery-web/api/*.ts` | Vercel functions: generate-feed, plan-event, generate-campaign, score-images, append-event-posts, generate-captions, watermark, gallery-zip, stories/* | — |
| Server guards | `gallery-web/server/` | `ownerAuth.ts`, `publicEndpointGuards.ts`, `sentryServer.ts` | — |
| Database | `supabase/migrations/` (78 קבצים, ממוספרים 002–087 עם חורים), `supabase/schema.sql` | Postgres/Supabase — מקור האמת לענן | — |
| Edge Functions | `supabase/functions/` | `admin`, `create-checkout`, `lemonsqueezy-webhook`, `rekognition`, `share-gallery`, `backfill-public-thumbs` | — |

הערה: קיימת תיקייה נפרדת `/Users/guysidi/eclipse-ai-app` — אפליקציית Electron זעירה ונפרדת (index.html+main.js), **לא** חלק ממונו-רפו זה ולא רלוונטית לאזור הלקוח.

Git: branch פעיל `fix/private-entry-cover-text`. Typecheck של gallery-web עובר נקי (exit 0).

---

## 3. Inventory — כל פיצ'רי אזור-הלקוח שנמצאו

### Web (client-facing)
- `pages/VendorPortal.tsx` — פורטל ספק לפי קוד ב-URL.
- `pages/ClientDashboard.tsx` — לוח לקוח מלא (7 טאבים): home, feed-studio, content, calendar, galleries, stories, page, tender.
- `components/ClientHome.tsx` — מסך פתיחה של הלקוח (scaffolding).
- `pages/PortfolioPage.tsx` — אתר לקוח ציבורי (auto-generated).
- `pages/ClientPage.tsx` — **קוד מת** (לא מיובא בשום מקום, לא ב-router).

### Web (social/content/AI suite)
`FeedStudio.tsx`(+Controls/Previews), `SocialManager.tsx`, `CreativeEngineDialog.tsx`(+`CreativeRenderer.tsx`), `CreativeBriefWizard.tsx`, `PostEditor.tsx`, `EventPlanDialog.tsx`, `StoryGenerator.tsx`(מת), `StoryPlayer/Preview.tsx`, `TenderBuilder.tsx`, `PortfolioEditor.tsx`.

### Desktop (client-area)
`ClientsDashboard.tsx`, `ClientDetail.tsx`, `ClientGalleryPage.tsx`, `WorkspaceDashboard.tsx`, `SocialMode.tsx`, `VendorsPanel.tsx`, `PublishModal.tsx`(מקומי), `PublishPanel.tsx`(ענן), `BusinessSettingsModal.tsx`, `BrandingStep.tsx`, `OnboardingFlow.tsx`, `QuestionnaireBuilder.tsx`, `StoryModal.tsx`.

### Photographer surface
`pages/Dashboard.tsx` — nav item "לקוחות" (`disabled:true`, badge "Soon").

---

## 4. Built vs Partial vs Mock

| קטגוריה | פיצ'רים |
|---|---|
| **Working + real data** | VendorPortal, PortfolioPage (ציבורי), FeedStudio (→`feed_plans`), EventPlanDialog (→`feed_plans` דרך append-event-posts), Stories (Remotion pipeline→`story_renders`/`stories`), StoryPlayer, image scoring (→`image_ai_scores`), QuestionnaireBuilder (desktop, fully cloud), Auth/Onboarding |
| **Partial** (עובד אבל בלי persistence/publishing) | ClientDashboard (data אמיתי, אבל selections/settings ב-sessionStorage/localStorage), SocialManager (captions אמיתיים מ-Claude, אבל calendar ב-localStorage בלבד, אין DB, אין publishing), CreativeEngineDialog (AI+render אמיתי, אין persistence, export מושבת "בקרוב"), PortfolioEditor (localStorage בלבד), TenderBuilder (ephemeral, PDF בלבד, אין DB) |
| **UI-mock only** | ClientHome (מספרים אמיתיים לחלק, אבל cadence=3 קשיח, pending approvals=0 קשיח, קטגוריות קשיחות), FeedStudioControls (לא מיובא; קורא ל-`/api/regenerate-feed-with-tweak` שלא קיים) |
| **Dead / unreachable** | ClientPage.tsx (קוד מת), StoryGenerator.tsx (הוחלף ב-Remotion) |
| **Planned / disabled stub** | "לקוחות" nav ב-Dashboard, פאנל "מעקב הורדות" (badge "בקרוב") |

**AI provider:** הכל Anthropic Claude — `claude-sonnet-4-6` ל-feed/campaign/plan, `claude-haiku-4-5[-20251001]` ל-captions ו-vision scoring. מפתח `ANTHROPIC_API_KEY`. אין OpenAI, אין mock fallbacks (כשל = HTTP 5xx).

**Instagram:** אין שום אינטגרציה. אין Graph API, אין OAuth, אין scheduler. הצלם מעתיק caption ומוריד תמונה ידנית.

---

## 5. Routes & Access Methods (Web)

Router = שרשרת `if` על `pathname` ב-`main.tsx:261-308`, first-match-wins.

| Route (כפי שכתוב בקוד) | Component | גישה / Auth | Tenant isolation | סטטוס |
|---|---|---|---|---|
| `/vendor/...`, `/<biz>/vendor/...` | VendorPortal | קוד אטום ב-URL, ללא PIN/session; `get_vendor_by_code` RPC | scoped ל-`vendor_id`; נשען על סודיות הקוד | Working |
| `/<biz>/c/<slug>`, `.../client/<uuid>/dashboard` | ClientDashboard | PIN (bcrypt `clients.access_code_hash`) → `verify_code` ב-`/api/append-event-posts`, rate-limited, token ל-sessionStorage; **fallback plaintext** ללקוחות לא-migrated | queries עם `.eq('client_id', clientId)` | Partial |
| `/client/...`, `/<biz>/client/...` | PortfolioPage | **ציבורי, ללא auth** (clientId ב-URL הוא הסוד היחיד) | scoped ל-clientId; ציבורי by design | Working |
| `/<biz>/g/<slug>`, `/<biz>/<slug>/<section>` | App (gallery viewer) | ציבורי / password / signed session | per-gallery | Working |
| Dashboard sidebar "לקוחות" | — | `disabled:true`, אין route | — | Stub |

**חולשות גישה שאותרו:**
1. **ה-PIN gate של ClientDashboard יכול להיעלם בשקט**: ה-gate מוצג רק `if (!authenticated && clientCode)` (`ClientDashboard.tsx:432`), ו-`clientCode` נקרא מ-`delivery_settings.clientCode` של הגלריה הראשונה. אם השדה ריק → הדשבורד נטען **ללא gate**, וההגנה מסתכמת בידיעת ה-slug.
2. **אכיפת ה-session token היא advisory** בצד השרת (`REQUIRE_CLIENT_SESSION_TOKEN` כבוי כברירת מחדל, `append-event-posts.ts:284-312`), וקריאות ה-read רצות תחת ה-anon client ללא קשר ל-token. ה-PIN שומר על ה-UI, לא על הנתונים.
3. **ClientPage.tsx קוד מת** — נכתב במלואו אך `/client/` מפנה ל-PortfolioPage.

---

## 6. Database Structure

מודל **business-centric star**, לא שרשרת ליניארית. הכל בענן (Supabase); אין טבלאות local-only.

```
auth.users
  └─ businesses (user_id 1:1)              ← brand_kit JSONB יושב כאן (לא טבלה!)
       ├─ subscriptions → plans            (starter/pro/business/agency; token_count, feature flags)
       ├─ business_tokens / token_ledger / monthly_usage
       ├─ clients (business_id NOT NULL)
       │     ├─ client_page_settings (1:1) ← custom_logo_url/custom_accent_color (לא מחוברים!)
       │     ├─ client_session_tokens / client_code_attempts (PIN auth)
       │     └─ feed_plans (client_id)      ← ה-"Content" היחיד
       ├─ galleries (business_id NOT NULL, client_id ── NULLABLE ──► clients)
       │     ├─ gallery_sections ─► images (section_id NOT NULL)
       │     ├─ stories / story_renders
       │     ├─ gallery_favorites/_download_log/_hidden_images/_email_log
       │     └─ public_gallery_sessions / gallery_unlock_tokens
       ├─ vendors → image_vendor_tags
       ├─ questionnaires → questionnaire_responses
       └─ events → event_leads

feed_plans.source_gallery_ids : UUID[]  ← מערך, ללא FK לגלריות
```

**מה קיים:** clients, galleries, brand_kit (כ-JSONB), feed_plans, image_ai_scores, client_page_settings, PIN auth, tokens/plans.

**מה חסר לחלוטין (אין טבלה):** `business_members`/roles, `tenant_type`, `brand_kits` (per-client), `instagram_connections`/social OAuth, `campaigns`, `calendar_entries`, `approvals`, `content_plans`, tender tables.

**Gap analysis — Business → Client → BrandKit → Gallery → Content:**
- Business → Client: ✅ (`clients.business_id`).
- Client → Gallery: ⚠️ קיים אבל `galleries.client_id` **nullable** — גלריה יכולה לצוף בלי לקוח; העוגן האמיתי הוא `business_id`.
- BrandKit: ❌ אינו entity נפרד ואינו שייך ללקוח. זה `businesses.brand_kit` JSONB אחד לכל studio. הדבר היחיד per-client הוא `client_page_settings` (logo/accent) — ולא מחובר בקוד.
- Gallery → Content: ⚠️ `feed_plans` מקשר ל-`client_id`+`business_id` אבל לגלריות רק דרך מערך UUID ללא FK.

`clients.local_id` / `galleries.local_id` (TEXT) = גשר בין ה-UUID המקומי של הדסקטופ ל-row בענן.

---

## 7. Brand Kit ↔ Gallery Integration (הבאג)

**הבאג אמיתי ומבני.** עורך ה-Brand Kit ב-Web (`/brand-kit`) שומר ל-`businesses.brand_kit` JSONB, אבל **ה-gallery viewer לעולם לא קורא את העמודה הזאת**.

Trace:
- שמירה: `brandKit.ts:203-217` `saveBrandKit()` → `UPDATE businesses SET brand_kit`. לוגו → bucket `business-brand` (public), תומך light/dark/square (`brandKit.ts:30-34`).
- ה-viewer (`App.tsx`, `Viewer.tsx`): **0 אזכורים** ל-`brand_kit`/`getBrandKit`/`businesses`. כל ה-branding נקרא מ-`gallery.delivery_settings` (studioName, fonts, themeColor, watermark), או מ-snapshot קפוא ב-`gallery_revisions` לגלריות published (`App.tsx:1310-1346`).
- הקישור היחיד Brand Kit → gallery: `applyBrandKitToGalleryDefaults()` (`brandKit.ts:258-273`) שרץ **רק בזמן יצירת גלריה**, **רק אם** `apply_to_galleries === true` (כבוי כברירת מחדל), ומעתיק **3 שדות טקסט בלבד** (studioName, logoUrl, welcomeMessage) — **ללא** צבעים/פונטים/watermark.

**Root cause:** Brand Kit הוא מערכת snapshot-at-creation, לא live reference. עריכה מאוחרת לא כותבת מחדש גלריות קיימות (ה-UI עצמו אומר "לא משכתב גלריות קיימות", `BrandKit.tsx:626-628`). התוצאה: OG cards, מיילים, stories, watermark endpoint **כן** קוראים `brand_kit` בזמן אמת ומתעדכנים — אבל הגלריה שהלקוח פותח לא, כי היא נשענת על `delivery_settings` נפרד לגמרי.

**שתי מערכות branding מנותקות:** (א) Web `businesses.brand_kit`, (ב) Desktop per-gallery `delivery_settings` (נכתב ב-`cloudUpload.ts:169-271` בזמן publish, לא קורא brand_kit). ה-viewer מכבד רק את (ב).

**Support matrix:**
| רמה | נתמך? |
|---|---|
| Workspace/studio branding | חלקית — קיים ב-brand_kit, מגיע ל-OG/מייל/stories, **לא** ל-viewer |
| Client-level branding | סכמה בלבד, מת — `client_page_settings.custom_logo_url/accent` קיימים, **0 קריאות** בקוד |
| Gallery-level overrides | ✅ הכל ב-`delivery_settings` |
| Multiple brand kits | ❌ אחד ל-business |
| Light/dark/square logo | ✅ נשמר (אבל רק light מוקרן) |
| Custom fonts | ❌ 5 FONT_PAIRS קשיחים |

---

## 8. Desktop ↔ Web Synchronization

**Desktop = local-first.** מקור האמת: `preferences.json` ב-Electron userData (IPC `get-pref`/`set-pref`). Supabase הוא **publish target** בלבד (`cloudUpload.ts`). תמונות = paths מוחלטים במערכת הקבצים, מוצגות דרך פרוטוקול `localfile://`.

**מזהים — לא תואמים ישירות, מגושרים ע"י `local_id`:**
| Entity | Desktop ID | Cloud ID | גשר |
|---|---|---|---|
| Client | `client_…` מקומי | `clients.id` UUID | `clients.local_id` |
| Gallery | מקומי | `galleries.id` UUID (נוצר ב-publish) | `galleries.local_id` |
| Image | path מוחלט | `images.id` UUID | filename/hash |

גלריה שלא פורסמה מעולם **אין לה זהות בענן**.

**תלויות Electron-only (לא עוברות ל-Web ללא כתיבה מחדש):** סריקת תיקיות, rename engine על הדיסק, native image compression (`nativeImage`), story video render (offscreen BrowserWindow+ffmpeg), social export package (native canvas), folder "publish" (`sections`), HTML export, native dialogs/Finder, `localfile://`, prefs persistence.

**כבר Supabase (ניתן לחשוף ב-Web):** Auth, Onboarding (`createBusiness`+slug RPC), **QuestionnaireBuilder (fully web-ready, 0 תלויות Electron)**, cloud publish logic (`cloudUpload.ts` — הלוגיקה/SQL ניתנים לשימוש חוזר; רק מקור ה-bytes דסקטופי), plan limits/usage.

**ClientGalleryPage הוא mock דסקטופי** של ה-viewer הענני האמיתי (favorites לא נשמרים, download no-op) — לא מקור אמת.

---

## 9. Permissions & Tenant Isolation

- **אין `tenant_type`, אין roles, אין `business_members`.** business אחד = user אחד. "Eclipse" הוא סתם slug `eclipse-media` — tenant רגיל. **האפליקציה לא יכולה להבחין בין משתמש Eclipse-פנימי למשתמש SaaS רגיל.** לכן אין פיצ'ר Eclipse-only שיכול "לדלוף" — כי אין gating כזה בכלל.
- **`/admin` בטוח בצד השרת.** ה-route בפרונט לא מוגן (`main.tsx:282`), אבל כל הפעולות עוברות דרך Edge Function `admin` שדורש JWT + `user.id ∈ ADMIN_USER_IDS` (secret), וה-RPCs מוענקים ל-`service_role` בלבד. משתמש רגיל מקבל 403.
- **הסוויטה החברתית/הפקתית לא מוגנת ב-plan כלל** — כל משתמש מחובר (או כל לקוח עם PIN) מקבל Feed Studio / Social Manager / Creative Engine / Tender Builder במלואם. אם אלה אמורים להיות Production-only או premium → **דליפת entitlement**.
- **Feature flags** כולם `VITE_FEATURE_*` build-time (לא runtime per-user). `VITE_FEATURE_NEW_IA` (`SOCIAL_OS`) רק משנה layout של ה-nav, לא חוסם גישה.

**User-type matrix (מה הקוד באמת מבחין):**
| סוג | ניתן להבחנה? |
|---|---|
| Photographer (owner) | ✅ JWT→`businesses.user_id` |
| Production / Eclipse-internal | ❌ אין flag |
| Team member / multi-seat | ❌ אין members table |
| External client | ✅ PIN→token, scoped ל-client_id |
| Client approver / read-only client | ❌ אין רמות הרשאה |
| Public guest | ✅ anon + gallery password/session |
| Platform admin | ✅ server-only (ADMIN_USER_IDS) |

**דליפות קריאה חוצות-tenant (anon) שאותרו:** `vendors` (`USING(true)`), `image_ai_scores` (`USING(true)`), `gallery_get_meta` (קורא draft ע"י ניחוש UUID), `feed_plans` (status-only, לא client-scoped), `questionnaires`/`events` (`is_active=true`), `get_vendor_by_code`. Migration `082` מתקן 3 מהם אבל **לא הוחל בפרוד**; ל-feed_plans/questionnaires/events **אין תיקון מתוכנן**.

---

## 10. Reusable Components & Logic

| רכיב | שימוש חוזר | הערה |
|---|---|---|
| `ClientDashboard` + PIN flow + `feed_plans` persistence | ✅ גבוה | הבסיס של אזור הלקוח — כבר עובד |
| Claude APIs (generate-feed/campaign/plan, score-images, append-event-posts) | ✅ גבוה | production-real |
| Remotion story pipeline (`api/stories/*`) | ✅ | video אמיתי |
| `FeedStudioPreviews`, `CreativeRenderer`, `StoryPlayer` | ✅ | view layers טהורים |
| QuestionnaireBuilder (desktop) | ✅ | fully cloud, 0 Electron deps |
| `cloudUpload.ts` orchestration/SQL | ✅ חלקי | להחליף מקור bytes |
| Auth/Onboarding/planGuard | ✅ | Supabase-backed |
| `client_page_settings` schema | ✅ פוטנציאל | קיים, לא מחובר — בסיס ל-client branding |

---

## 11. מה **לא** לעשות בו שימוש חוזר

- `ClientPage.tsx` — קוד מת, מוחלף ע"י PortfolioPage.
- `StoryGenerator.tsx` — dead POC, מוחלף ע"י Remotion.
- `FeedStudioControls.tsx` — קורא ל-endpoint לא קיים.
- `ClientGalleryPage.tsx` (desktop) — mock מקומי של ה-viewer.
- Desktop local-only surfaces (folder scan, rename, native render, folder publish, `localfile://`) — לא לנסות להעביר ל-Web; לבנות מחדש היכן שצריך.
- ה-mock numbers של `ClientHome` (cadence/pending/categories קשיחים).

---

## 12. Integration Options

**Option A — Reuse & Adapt (מינימלי).**
- שימוש חוזר: ClientDashboard הקיים, ה-routes, PIN auth, feed_plans, Claude APIs, stories.
- לבנות: מסך ניהול לקוחות בצד הצלם (create/assign/PIN/brand), חיווט ה-nav "לקוחות", persistence ל-localStorage-only, תיקון Brand Kit, plan gating.
- סיכון טכני: נמוך (הבסיס עובר typecheck ורץ). סיכון אבטחה: בינוני (חייבים plan gating + 082). מורכבות: בינונית-נמוכה. UX: המשכיות. שימוש מומלץ: **זה המצב שלנו.**

**Option B — Reuse logic, rebuild Web UI.**
- מיותר: ה-Web UI כבר קיים ותקין. תשקיע מחדש בבנייה שכבר יש. סיכון בינוני, מורכבות גבוהה יותר מ-A ללא תועלת. מומלץ רק אם רוצים ריידיזיין ויזואלי מלא בו-זמנית.

**Option C — New Web client area + migrate.**
- הכי יקר. מוצדק רק אם היינו מגלים שהקוד הקיים שבור/mock — וזה **לא** המצב. לא מומלץ.

---

## 13. Recommended Integration Architecture

**Option A — Adapt.** להשאיר את הדסקטופ ככלי Eclipse פנימי; ה-Web הוא היעד הלקוחי היחיד. לבנות מעל התשתית הקיימת:

```
Web SaaS (gallery-web)
 ├─ Photographer surface (Dashboard) → להפעיל "לקוחות" → ClientsManager (חדש)
 │     create/select client · assign galleries (set galleries.client_id) · set PIN · set client brand
 └─ Client-facing (ClientDashboard, קיים) → להקשיח gate + persistence
Data: להשתמש ב-clients/galleries/feed_plans הקיימים; להוסיף client-level branding (או לחבר client_page_settings)
```

---

## 14. Proposed Clients-Area Information Architecture

```
Pixflow Workspace
  └─ Clients (חדש — מסך ניהול לצלם)
       └─ Client Profile        → clients (קיים) + client_page_settings
           ├─ Client Brand Kit  → חדש: client-level branding (החלטה 2)
           ├─ Client Portal     → ClientDashboard (קיים)
           ├─ Galleries/Events  → galleries.client_id (קיים, לחבר)
           ├─ Content Library   → feed_plans (קיים, חלקי)
           ├─ Social Studio     → FeedStudio/SocialManager (קיים, צריך persistence)
           ├─ Content Calendar  → SocialManager (localStorage → DB)
           ├─ Approvals         → אין backing (מחוץ ל-MVP)
           └─ Team Access       → אין (דורש business_members — עתידי)
```

Branding inheritance רצוי:
```
Pixflow defaults → Workspace Brand Kit (businesses.brand_kit) → Client Brand Kit → Gallery overrides (delivery_settings)
```
**האם הארכיטקטורה תומכת?** חלקית: Workspace + Gallery קיימים; Client-level דורש טבלה/עמודות חדשות (או חיווט `client_page_settings`); התורשה עצמה דורשת שה-viewer יקרא שכבות (כרגע קורא רק `delivery_settings`).

---

## 15. Safe MVP Scope

מטרה: לאפשר ל-Production company לנהל לקוח אחד end-to-end, מבלי לגעת ב-AI/Instagram הלא-גמורים.

| יכולת MVP | מצב קיים | עבודה נדרשת |
|---|---|---|
| Create/select client | `clients` קיים | UI ניהול (ClientsManager) |
| Assign galleries to client | `galleries.client_id` קיים (nullable) | UI לשיוך + set client_id |
| Secure client access | PIN (`access_code_hash`) קיים | לאכוף gate (לסגור את חור ה-clientCode הריק) |
| כל הגלריות במקום אחד | ClientDashboard כבר עושה `.eq(client_id)` | — |
| Client-specific Brand Kit | `client_page_settings` קיים לא מחובר | לחבר קריאה ב-viewer (החלטה 2) |
| View + download | עובד | — |
| Approvals | אין backing | **מחוץ ל-MVP** |

**מחוץ ל-MVP:** Instagram publishing (אין אינטגרציה), Creative Engine export (מושבת), Team Access (אין members), approvals.

---

## 16. Implementation Phases (הצעה, לאישור)

- **Phase 0 — Security preflight (לפני חשיפה רחבה):** להחיל migration `082`; להוסיף client/business scoping ל-`feed_plans`/`questionnaires`/`events`; לסגור את חור ה-PIN gate הריק. (לא הרסני, PR נפרד, לא לפרוס אוטומטית.)
- **Phase 1 — Clients management surface:** להפעיל "לקוחות" ב-Dashboard; ClientsManager (create/select/assign galleries/set PIN).
- **Phase 2 — Brand Kit fix:** viewer יקרא `businesses.brand_kit` כ-fallback חי מתחת ל-`delivery_settings` (מיישר את ה-doc-comment שכבר מבטיח זאת). אופציונלי: client-level branding.
- **Phase 3 — Persistence:** SocialManager calendar + PortfolioEditor + Creative directions → Supabase (במקום localStorage).
- **Phase 4 (עתידי):** plan/entitlement gating, Instagram Graph API, approvals, team access.

לפי פרוטוקול ה-repair sprint: PR אחד לכל surface, עצירה+דיווח אחרי כל phase, בלי SQL הרסני בלי preview, בלי deploy אוטומטי.

---

## 17. Risks & Blockers

1. **Brand Kit** — שתי מערכות branding מנותקות; תיקון ה-viewer עלול לשנות מראה של גלריות קיימות. צריך fallback עדין + בדיקה.
2. **אין הפרדת הרשאות** — הסוויטה החברתית פתוחה לכולם. חשיפת אזור לקוח בלי plan gating = הכל זמין לכל plan.
3. **דליפות RLS חוצות-tenant** — `082` לא בפרוד; feed_plans/questionnaires/events פתוחים ל-anon enumeration.
4. **PIN gate שביר** — נעלם אם `clientCode` ריק; אכיפת token היא advisory.
5. **מזהי Desktop↔Web** — `local_id` bridge; גלריות לא-מפורסמות אין להן זהות ענן.
6. **Persistence חסר** — בחירות לקוח/הגדרות ב-localStorage לא שורדות מכשיר.
7. **Instagram** — אין כלום; אסור להבטיח פרסום אוטומטי.

---

## 18. Decisions Requiring Your Approval

1. **מודל tenant/plan:** להוסיף `tenant_type`/entitlement כדי לגדר פיצ'רי Production, או להשאיר פתוח בינתיים?
2. **גישת תיקון Brand Kit:** (א) live read ב-viewer, או (ב) snapshot-copy מלא (צבעים/פונטים/watermark) ביצירה+publish? והאם להכניס client-level brand kit אמיתי (טבלה חדשה) או לחבר את `client_page_settings` הקיים?
3. **מסך ניהול לקוחות:** לאשר בניית ClientsManager בצד הצלם (create/assign/PIN/brand) כ-MVP?
4. **אבטחה לפני חשיפה:** להחיל `082` + scoping ל-feed_plans/questionnaires/events כ-Phase 0?
5. **Desktop:** לאשר שהוא נשאר כלי Eclipse פנימי וה-Web הוא היעד הלקוחי?
6. **Instagram:** לאשר שהוא מחוץ ל-MVP?

---

## 19. Files Likely to Change (בעת implementation — לא עכשיו)

- `gallery-web/src/main.tsx` — route ל-ClientsManager.
- `gallery-web/src/pages/Dashboard.tsx` — הפעלת nav "לקוחות".
- חדש: `gallery-web/src/pages/ClientsManager.tsx` (או components).
- `gallery-web/src/pages/ClientDashboard.tsx` — הקשחת gate.
- `gallery-web/src/lib/brandKit.ts` + `gallery-web/src/App.tsx` — תיקון branding.
- `gallery-web/src/components/SocialManager.tsx` + `PortfolioEditor.tsx` — persistence ל-DB.
- `gallery-web/api/append-event-posts.ts` — אכיפת token.
- migrations חדשים (בנפרד, לאישור): client branding, plan gating, feed_plans scoping, apply `082`.

---

## 20. Final Recommendation

**Adapt / Reuse — לא לבנות מחדש.**

מה שכבר קיים וצריך לשמר: `ClientDashboard` + PIN auth + `feed_plans` + Claude APIs + Remotion stories + QuestionnaireBuilder + מודל `clients`/`galleries`/`brand_kit`.

מה שבור וצריך תיקון: Brand Kit→gallery (ה-viewer לא קורא brand_kit), PIN gate שביר, דליפות RLS (082 לא בפרוד), persistence ב-localStorage.

מה שחסר וצריך בנייה: מסך ניהול לקוחות בצד הצלם, plan/tenant gating, client-level branding, (עתידי) Instagram + approvals + team access.

**הצעד הבטוח הבא:** Phase 0 (security preflight, לא הרסני) + Phase 1 (ClientsManager) — אחרי אישורך על ההחלטות בסעיף 18.

---

### Master Inventory Table

| Feature | Surface | Status | Route | Main Files | Data Source | Auth | Permissions | Reusable | Missing Work | Risk |
|---|---|---|---|---|---|---|---|---|---|---|
| Vendor Portal | Web | Working+real | `/vendor/...` | `pages/VendorPortal.tsx` | Supabase (`get_vendor_by_code`, image_vendor_tags) | קוד ב-URL | scoped vendor_id | ✅ | — | קוד ניתן לניחוש |
| Client Dashboard | Web | Partial | `/<biz>/c/<slug>`, `.../client/<uuid>/dashboard` | `pages/ClientDashboard.tsx` | Supabase (galleries/images/stories) + sessionStorage | PIN→token | client_id scope | ✅ | persistence, gate hardening | gate נעלם אם clientCode ריק |
| Client Home | Web | UI-mock | tab | `components/ClientHome.tsx` | props (חלק mock) | ירושה | — | ✅ (shell) | חיבור מנוע | mock numbers |
| Public Portfolio | Web | Working+real | `/client/...` | `pages/PortfolioPage.tsx` | Supabase (galleries live) | ציבורי | clientId | ✅ | settings ב-localStorage | ציבורי by design |
| Client Page | Web | Dead | — | `pages/ClientPage.tsx` | — | — | — | ❌ | — | קוד מת |
| Feed Studio | Web | Working+real | tab | `FeedStudio.tsx`, `api/generate-feed.ts` | Supabase `feed_plans`, Claude Sonnet | ירושה | לא מגודר | ✅ | publishing | אין plan gate |
| Event Plan | Web | Working+real | dialog | `EventPlanDialog.tsx`, `api/plan-event.ts` | `feed_plans`, Claude | ירושה | לא מגודר | ✅ | — | — |
| Social Manager / Calendar | Web | Partial | tab | `SocialManager.tsx`, `api/generate-captions.ts` | **localStorage** + Claude Haiku | ירושה | לא מגודר | ⚠️ | DB persistence, publishing | אין DB |
| Creative Engine | Web | Partial | dialog | `CreativeEngineDialog.tsx`, `api/generate-campaign.ts` | Supabase read + Claude; **ephemeral** | ירושה | לא מגודר | ✅ | persistence, export | export מושבת |
| Tender Builder | Web | Partial | tab | `TenderBuilder.tsx` | Supabase read; PDF; ephemeral | ירושה | לא מגודר | ✅ | DB persistence | אין טבלה |
| Portfolio Editor | Web | Partial | tab | `PortfolioEditor.tsx` | **localStorage** | ירושה | — | ✅ | DB persistence | לא שורד מכשיר |
| Stories (render) | Web | Working+real | Dashboard | `api/stories/*`, `StoryPlayer.tsx` | Remotion + `story_renders`/`stories` | photographer | owner | ✅ | — | — |
| Brand Kit editor | Web | Working (מנותק) | `/brand-kit` | `pages/BrandKit.tsx`, `lib/brandKit.ts` | `businesses.brand_kit`, bucket `business-brand` | photographer | owner (RLS) | ✅ | חיבור ל-viewer | viewer לא קורא |
| Questionnaire Builder | Desktop | Working+real | — | `QuestionnaireBuilder.tsx` | Supabase (fully) | photographer | owner | ✅ web-ready | — | — |
| Clients Dashboard | Desktop | Local-only | view | `ClientsDashboard.tsx` | prefs.json | auth | — | ⚠️ rewrite | cloud data | local-only |
| Client Detail | Desktop | Partial | view | `ClientDetail.tsx` | local + partial cloud | auth | — | ⚠️ | — | pixflow:// links |
| Client Gallery Page | Desktop | Mock | view | `ClientGalleryPage.tsx` | local | auth | — | ❌ | — | mock של viewer |
| Workspace Dashboard | Desktop | Local-only | view | `WorkspaceDashboard.tsx` | prefs.json | auth | — | ⚠️ rewrite | cloud rehydrate | local-only |
| Social Mode (grid) | Desktop | Local-only | mode | `SocialMode.tsx` | local + native export | auth | — | ❌ | native render | Electron-only |
| Story Modal | Desktop | Local-only | modal | `StoryModal.tsx` | local + native ffmpeg | auth | — | ❌ | server render | Electron-only |
| Vendors Panel | Desktop | UI-mock/Partial | panel | `VendorsPanel.tsx` | in-memory store | auth | — | ⚠️ | cloud write | portal link מת |
| Business Settings | Desktop | Local-only | modal | `BusinessSettingsModal.tsx` | prefs.json | **auth only** | **אין ownership check** | ⚠️ | ownership check | edits business-wide |
| Admin | Web | Working+real | `/admin` | `pages/AdminPage.tsx`, `functions/admin` | Edge Fn + service_role | JWT+ADMIN_USER_IDS | owner allowlist | ✅ | — | route גלוי (server בטוח) |
| "לקוחות" nav | Web | Stub | — | `pages/Dashboard.tsx` | — | — | — | N/A | הכל | disabled |
