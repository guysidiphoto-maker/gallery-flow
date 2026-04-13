# Pixflow — Implementation Plan: Auto-Website + AI Engine
## מסמך טכני מפורט — מה בונים ואיך

**Date:** April 13, 2026

---

## מה אנחנו בונים?

**אתר אוטומטי לכל חברת הפקה** שמתעדכן לבד ברגע שצלם מעלה גלריה. 
חברת ההפקה לא צריכה לגעת בכלום — האתר מתעדכן, התוכן נכתב, הסושיאל מוכן.

---

## 1. האתר האוטומטי

### מה הלקוח (חברת ההפקה) רואה:

```
pixflow-ai.com/eclipse-media
```

#### מסך פתיחה (Hero)
- רקע: התמונה הכי חזקה מכל הגלריות (אוטומטי — הכי הרבה Top Picks)
- שם החברה גדול ומרכזי
- שורת תיאור שנכתבת ע"י AI: "חברת הפקות אירועים מובילה. 150+ אירועים. תל אביב."
- כפתור "Explore Our Work"
- אנימציית parallax עדינה בגלילה

#### סקשן מספרים (Stats)
- מחושב אוטומטית מהדאטה:
  - "156 Events Produced"
  - "47,000+ Photos Delivered"  
  - "12 Countries"
  - "Since 2019"
- אנימציית ספירה כשהסקשן נכנס למסך

#### פורטפוליו לפי סוג אירוע
- כל סוג אירוע מקבל סקשן נפרד
- הסקשנים נוצרים אוטומטית לפי הגלריות שקיימות
- לכל סקשן:
  - כותרת + תיאור שנכתב ע"י AI
  - רשת תמונות (Top Picks מכל הגלריות מאותו סוג)
  - קרוסלת גלריות (כרטיסים עם שם + תאריך + כאבר)
  - כפתור "View All Conferences" שמסנן

דוגמה:
```
━━━ Conferences ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"From intimate boardrooms to 5,000-seat arenas, 
 our conferences are produced to perfection."        ← AI כתב את זה

[תמונה] [תמונה] [תמונה] [תמונה]                     ← Top Picks
[תמונה] [תמונה] [תמונה] [תמונה]

IAC 2026          │  Tech Summit     │  Annual Gala
Tel Aviv · Jan    │  NYC · Mar       │  London · Feb
380 photos        │  220 photos      │  190 photos
[View Gallery →]  │  [View Gallery →]│  [View Gallery →]

━━━ Corporate Events ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Team building, product launches, and celebrations 
 that bring companies together."                     ← AI כתב את זה

...
```

#### Highlight Reel (הכי טוב מהכל)
- Masonry grid ענק של ה-Top Picks הכי טובים מכל הגלריות
- פילטור לפי סוג אירוע
- Lightbox בלחיצה
- אפקט hover עם שם האירוע

#### Stories Showcase
- שורת עיגולים כמו אינסטגרם
- לחיצה פותחת נגן וידאו fullscreen
- סקרול אופקי

#### Contact & CTA
- "Ready to create something amazing?"
- לינקים: אתר, אינסטגרם, לינקדאין, פייסבוק
- טופס יצירת קשר פשוט (שם + מייל + הודעה)
  - ההודעה נשלחת למייל של חברת ההפקה

#### Footer
- לוגו חברת ההפקה
- לינקים חברתיים
- "Powered by Pixflow" (או בלי — לפי הגדרה)

---

## 2. AI Content Engine — מה הוא עושה בדיוק

### 2A. יצירת טקסטים אוטומטית

**מתי זה קורה:**
- ברגע שגלריה חדשה עולה לענן
- כשהאתר נטען בפעם הראשונה
- כשמשתמש לוחץ "Regenerate" על טקסט

**מה AI יוצר:**

| טקסט | מה הוא מקבל | מה הוא מחזיר |
|------|-------------|-------------|
| About Company | שם חברה, מספר אירועים, סוגי אירועים, שנים | פסקה של 2-3 משפטים שמתארת את החברה |
| Section Intro | סוג אירוע, כמה גלריות, שמות אירועים | משפט שמתאר את הסקשן |
| Gallery Caption | שם גלריה, תאריך, מיקום, כמות תמונות | שורה קצרה ומגניבה |
| Social Caption | תמונה, שם אירוע, סוג אירוע, פלטפורמה | caption מותאם לפלטפורמה |
| Pitch Intro | טקסט מכרז, סוגי אירועים שהתאימו | פסקת פתיחה למצגת |

**דוגמה טכנית:**

```
Input לAI:
{
  "type": "about",
  "business_name": "Eclipse Media",
  "event_count": 156,
  "event_types": ["conference", "corporate-event", "retreat-abroad"],
  "years_active": 7,
  "top_clients": ["IAC", "Microsoft", "Google"]
}

Output:
"Eclipse Media is a premier event production company with over 150 
events across three continents. Specializing in high-profile 
conferences, corporate celebrations, and international retreats, 
we bring every vision to life with precision and creativity."
```

**עלות:** $0.003 ליצירת טקסט (Claude Haiku). 100 טקסטים = $0.30.

### 2B. עיצוב האתר ע"י טקסט (AI Design Assistant)

**הרעיון:** הלקוח כותב בצ'אט מה הוא רוצה, והאתר משתנה.

```
לקוח: "אני רוצה שהאתר יהיה יותר כהה עם אקסנט זהב"
  → AI משנה: accent_color: '#D4AF37', background_variant: 'ultra-dark'

לקוח: "תחליף את הכותרת ל-We Create Unforgettable Moments"  
  → AI משנה: headline: 'We Create Unforgettable Moments'

לקוח: "תסתיר את הסקשן של הנופשים"
  → AI משנה: hidden_sections: ['retreat-abroad', 'retreat-local']

לקוח: "תשים את הכנסים ראשונים"
  → AI משנה: section_order: ['conference', 'corporate-event', ...]
```

**איך זה עובד טכנית:**
1. לקוח כותב בצ'אט (בדשבורד שלו)
2. AI מנתח את הבקשה ומזהה מה לשנות
3. AI מחזיר JSON עם השינויים
4. המערכת מעדכנת את `business_website_settings`
5. האתר מתעדכן מיידית

**דוגמה טכנית:**
```
User message: "אני רוצה שהצבע הראשי יהיה זהב ושהכותרת תהיה באנגלית"

AI call:
{
  "model": "claude-haiku",
  "prompt": "You are a website design assistant. The user wants to modify their portfolio website settings. Parse their request and return a JSON object with the changes...",
  "user_message": "אני רוצה שהצבע הראשי יהיה זהב ושהכותרת תהיה באנגלית"
}

AI response:
{
  "changes": {
    "accent_color": "#D4AF37",
    "language": "en"
  },
  "confirmation": "I've changed your accent color to gold and set the language to English."
}
```

### 2C. Pitch Builder עם AI

**Flow מלא:**

```
שלב 1: לקוח מדביק טקסט מכרז
┌─────────────────────────────────────────────┐
│  Paste your tender requirements below:       │
│  ┌─────────────────────────────────────────┐ │
│  │ "מחפשים חברת הפקה לכנס שנתי של 800     │ │
│  │  משתתפים. נדרשים: צילום, סטילס, וידאו.  │ │
│  │  האירוע יתקיים בספטמבר 2026 בתל אביב.  │ │
│  │  יש להציג 3 אירועים דומים מהעבר."       │ │
│  └─────────────────────────────────────────┘ │
│  [Analyze & Generate →]                      │
└─────────────────────────────────────────────┘

שלב 2: AI מנתח ומציג תוצאות
┌─────────────────────────────────────────────┐
│  ✓ Identified: Conference, 800+ people       │
│  ✓ Found: 4 matching conferences             │
│  ✓ Selected: 24 best photos                  │
│                                              │
│  Matching Events:                            │
│  ├── IAC 2026 (Tel Aviv, Jan) — 380 photos  │
│  ├── Tech Summit 2025 (NYC) — 220 photos    │
│  ├── Annual Gala 2025 (London) — 190 photos │
│  └── DevCon 2024 (Berlin) — 150 photos      │
│                                              │
│  [Preview Pitch Deck →]                      │
└─────────────────────────────────────────────┘

שלב 3: לקוח רואה מצגת ויכול לערוך
┌─────────────────────────────────────────────┐
│  ┌─ Page 1 ─────────────────────────────┐   │
│  │    ECLIPSE MEDIA                      │   │
│  │    Conference Portfolio                │   │
│  │    ┌────┐ ┌────┐ ┌────┐              │   │
│  │    │    │ │    │ │    │              │   │
│  │    └────┘ └────┘ └────┘              │   │
│  └───────────────────────────────────────┘   │
│                                              │
│  [← Remove] [Swap Photo] [Add Photo →]       │
│                                              │
│  Layout: [Grid] [Timeline] [Magazine]        │
│                                              │
│  [Download PDF]  [Share Link]  [Send Email]  │
└─────────────────────────────────────────────┘
```

---

## 3. Social Media Management — מה בדיוק

### 3A. Content Calendar מתקדם

**מה קיים עכשיו:** פיזור בסיסי של Top Picks על פני שבועות

**מה נוסיף:**

```
Dashboard > Content Calendar

┌─ Week of April 14, 2026 ────────────────────────────────────────┐
│                                                                  │
│  MON    Instagram Post                                           │
│  14     [תמונה 1:1]  "Another incredible conference brought     │
│         to life by our team. 800 attendees, 3 stages,            │
│         one unforgettable experience. #eventproduction"          │
│         [Download] [Edit Caption] [Approve ✓]                    │
│                                                                  │
│  WED    LinkedIn Post                                            │
│  16     [תמונה 16:9] "We're proud to have produced the IAC      │
│         2026 Conference in Tel Aviv. Over 800 industry leaders   │
│         gathered for 3 days of innovation and networking."        │
│         [Download] [Edit Caption] [Approve ✓]                    │
│                                                                  │
│         Instagram Carousel                                       │
│         [1:1] [1:1] [1:1] [1:1] [1:1]  "Conference highlights   │
│         that speak louder than words ✨"                          │
│         [Download All] [Edit] [Approve ✓]                        │
│                                                                  │
│  FRI    Instagram Story                                          │
│  18     [9:16 story video]  Auto-generated from gallery stories  │
│         [Download] [Approve ✓]                                   │
│                                                                  │
│         Facebook Album                                           │
│         [16 photos] "IAC 2026 Conference — Full Gallery"         │
│         [Download ZIP] [Approve ✓]                               │
│                                                                  │
│  [Approve All This Week ✓✓]  [Download Week Bundle]             │
└──────────────────────────────────────────────────────────────────┘
```

**כל תוכן כולל:**
- תמונה בפורמט הנכון לפלטפורמה
- Caption שנכתב ע"י AI ומותאם לטון של הפלטפורמה
- כפתור Edit — הלקוח יכול לערוך את הטקסט
- כפתור Approve — מסמן שזה מוכן לפרסום
- כפתור Download — מוריד תמונה + טקסט

**AI מתאים את הטון:**
- **Instagram:** קצר, עם אימוג'ים, hashtags
- **LinkedIn:** מקצועי, פורמלי יותר, בלי אימוג'ים
- **Facebook:** שיחתי, מזמין תגובות
- **Stories:** טקסט מינימלי, call-to-action

### 3B. פורמטים אוטומטיים

כשצלם מעלה גלריה, המערכת מייצרת אוטומטית:

| פורמט | מה נוצר | איך |
|-------|---------|-----|
| IG Post (1:1) | חיתוך מרכזי של Top Picks | Canvas API / CSS crop |
| IG Story (9:16) | Story video מהגלריה | כבר קיים |
| IG Carousel | 5-10 תמונות מסודרות | בחירה אוטומטית |
| LinkedIn (16:9) | חיתוך רחב של Top Picks | Canvas API |
| Facebook Cover | 820x312 מהתמונה הכי טובה | Canvas API |
| Profile Collage | 4 תמונות בגריד 2x2 | Canvas API |

### 3C. Insights & Data

```
Dashboard > Insights

┌─ This Month ──────────────────────────────┐
│                                            │
│  Gallery Views     12,450  ↑ 23%          │
│  Photo Downloads      890  ↑ 15%          │
│  Most Viewed       IAC 2026 (4,200 views) │
│  Best Day          Tuesday (avg 1,800)     │
│  Top Referrer      Instagram (62%)         │
│                                            │
│  Recommendations:                          │
│  • "Post more on Tuesdays — your best     │
│     engagement day"                        │
│  • "Conference content gets 3x more views  │
│     than retreats — focus there"           │
│  • "You haven't posted in 4 days —         │
│     3 ready-to-post photos waiting"        │
│                                            │
└────────────────────────────────────────────┘
```

---

## 4. טכנית — מה צריך לבנות

### 4A. קבצים חדשים

```
gallery-web/src/pages/
  ├── PortfolioPage.tsx      ← האתר האוטומטי
  ├── PitchDeckPage.tsx      ← דף מצגת שיתוף
  └── (existing files)

supabase/functions/
  ├── generate-text/         ← Edge Function ליצירת טקסט
  ├── analyze-tender/        ← Edge Function לניתוח מכרז
  └── generate-social/       ← Edge Function ליצירת caption

supabase/migrations/
  ├── 020_website_settings.sql
  ├── 021_analytics.sql
  ├── 022_ai_cache.sql
  ├── 023_pitch_decks.sql
  └── 024_social_content.sql
```

### 4B. Supabase Edge Function — דוגמה

```typescript
// supabase/functions/generate-text/index.ts
import { serve } from 'https://deno.land/std/http/server.ts'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

serve(async (req) => {
  const { type, context } = await req.json()
  
  const prompts = {
    about: `Write a 2-sentence company description for ${context.business_name}. 
            They've produced ${context.event_count} events including 
            ${context.event_types.join(', ')}. Professional, confident tone.`,
    
    section: `Write one sentence describing a ${context.event_type} portfolio section.
              The company has done ${context.gallery_count} such events. 
              Elegant, minimal.`,
    
    social_instagram: `Write an Instagram caption for a ${context.event_type} photo.
                       Event: ${context.event_name}. Include 3-5 hashtags. 
                       Short, punchy, with one emoji.`,
    
    social_linkedin: `Write a LinkedIn post about producing ${context.event_name}.
                      ${context.image_count} photos. Professional tone, no emojis.
                      2-3 sentences.`,
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompts[type] }],
  })

  return new Response(JSON.stringify({ 
    text: response.content[0].text 
  }))
})
```

**עלות:** Claude Haiku = ~$0.001 per call. 1000 calls/month = $1.

### 4C. Analytics — Tracking Code

```typescript
// In gallery-web App.tsx — add to loadGallery():
async function trackView(galleryId: string) {
  await supabase.from('gallery_views').insert({
    gallery_id: galleryId,
    referrer: document.referrer || null,
    device: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
  })
}
```

---

## 5. סדר בנייה מומלץ

### Sprint 1 (עכשיו): אתר אוטומטי בסיסי
- [ ] PortfolioPage.tsx — דף פורטפוליו שקורא גלריות לפי business slug
- [ ] קיבוץ אוטומטי לפי סוג אירוע
- [ ] Hero + Stats + Sections + Highlights + Stories + Contact
- [ ] עיצוב premium עם scroll animations
- [ ] Route חדש ב-main.tsx

### Sprint 2: AI Text Generation
- [ ] Supabase Edge Function: generate-text
- [ ] ANTHROPIC_API_KEY ב-Supabase secrets
- [ ] About text auto-generation
- [ ] Section descriptions
- [ ] Gallery captions
- [ ] Cache layer (don't regenerate every page load)

### Sprint 3: Analytics
- [ ] gallery_views table + migration
- [ ] Track view on gallery load + portfolio load
- [ ] Analytics tab in client dashboard
- [ ] View counts, popular photos, referrers

### Sprint 4: Enhanced Content Calendar
- [ ] AI-generated captions per platform
- [ ] Platform-specific image formats (1:1, 16:9, 9:16)
- [ ] Approve/Edit workflow
- [ ] Download bundles per day/week

### Sprint 5: Pitch Builder
- [ ] Tender text input UI
- [ ] AI analysis → match to event types
- [ ] Photo selection from matching galleries
- [ ] PDF generation
- [ ] Shareable link

### Sprint 6: AI Design Assistant
- [ ] Chat interface in client dashboard
- [ ] AI parses design requests → updates settings
- [ ] Real-time preview
- [ ] Color themes, layouts, section ordering

### Sprint 7: Notifications
- [ ] Email system (Resend API)
- [ ] Weekly content reminder
- [ ] Monthly analytics report
- [ ] Post-event notification

---

## 6. מה הלקוח (חברת ההפקה) מרגיש

**לפני Pixflow:**
```
אירוע → צלם שולח תמונות → תמונות יושבות בתיקייה → 
אף אחד לא רואה אותן → מעלים 3 תמונות לאינסטגרם חודש אחרי → 
מכרז → מחפשים שעות תמונות ישנות → שולחים PDF גרוע
```

**אחרי Pixflow:**
```
אירוע → צלם מעלה → 
  האתר מתעדכן מיד ✓
  3 פוסטים לאינסטגרם מוכנים ✓
  2 פוסטים ללינקדאין מוכנים ✓
  סטורי מוכן ✓
  ספקים קיבלו תמונות ✓
  
מכרז → 
  מדביקים טקסט → 
  מצגת מוכנה ב-2 דקות ✓
  PDF נשלח במייל ✓
```

**זה ההבדל בין $200 לאירוע ל-$2,000 ריטיינר חודשי.**

---

## 7. סיכום טכני

| Component | Technology | Effort |
|-----------|-----------|--------|
| Portfolio page | React + Supabase query | 1 day |
| AI text | Claude Haiku + Edge Function | Half day |
| Analytics | Supabase table + insert | Half day |
| Content Calendar v2 | React + AI captions | 1-2 days |
| Pitch Builder | AI + PDF generation | 2-3 days |
| Design Chat | AI + settings update | 1-2 days |
| Notifications | Resend API + cron | 1 day |
| Image formatting | Canvas API crop | 1 day |

**Total estimated: ~8-10 days of development**

**AI cost per month per active user: ~$1-5**

---

*"The best platform is one where the user's content creates itself."*
