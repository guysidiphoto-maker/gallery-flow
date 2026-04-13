# Pixflow — Retainer Platform Vision Document
## "From Photographer to Full-Service Creative Partner"

**Date:** April 13, 2026  
**Author:** Guy Sidi + Claude  
**Status:** Planning

---

## The Big Idea

A photographer signs a **retainer deal** with a production company. Instead of just delivering photos, the photographer becomes their **full creative partner** — managing their website, social media, content calendar, pitch decks, and analytics. All powered by Pixflow.

**The production company gets:** A premium online presence that updates itself.  
**The photographer gets:** Recurring monthly revenue instead of per-event payments.  
**Pixflow gets:** A platform that's impossible to leave.

---

## Current State (What We Have)

| Feature | Status |
|---------|--------|
| Gallery upload + cloud delivery | ✅ Live |
| Client tagging + event type categorization | ✅ Live |
| Top Picks selection (T key) | ✅ Live |
| Stories generation | ✅ Live |
| Sections (gallery organization) | ✅ Live |
| Client public page (timeline, highlights, stories) | ✅ Live |
| Client dashboard (Content Studio, Calendar, Galleries) | ✅ Live |
| Vendor portal (tagged photos per vendor) | ✅ Live |
| Client proofing (hide/show images) | ✅ Live |
| Event type filtering on client page | ✅ Live |
| Business slug system | ✅ Live |

---

## Phase 1: Auto-Generated Website (No AI)

### What It Is
Every production company gets a **premium portfolio website** that updates automatically when the photographer publishes new galleries.

### URL Structure
```
pixflow-ai.com/{business-slug}
```
Example: `pixflow-ai.com/eclipse-media`

### Page Sections

#### 1. Hero
- Full-viewport background image (best top pick across all galleries)
- Company name (large, elegant typography)
- Tagline (editable by client or auto-generated)
- Subtle scroll indicator

#### 2. Stats Bar
- Total events produced
- Total photos delivered
- Years active (calculated from first gallery date)
- Event types covered

#### 3. Portfolio by Event Type
Each event type gets its own section with:
- Section heading with event type label
- Horizontal scrolling gallery cards
- Top picks mosaic per section
- Click through to individual gallery

```
🎤 Conferences (12 events)
[Card] [Card] [Card] → scroll →

🏢 Corporate Events (8 events)  
[Card] [Card] [Card] → scroll →

✈️ International Retreats (5 events)
[Card] [Card] [Card] → scroll →
```

#### 4. Highlights Reel
- Full-width masonry grid of best top picks across ALL galleries
- Auto-curated: weighted by recency + is_top_pick
- Filterable by event type

#### 5. Stories Showcase
- Instagram-style story circles
- Click to play story videos
- One per gallery that has stories

#### 6. Contact / CTA
- "Let's create your next event"
- Link to company website
- Social links (Instagram, LinkedIn, Facebook)

#### 7. Footer
- Photographer credit (optional, based on showFooterCredit)
- "Powered by Pixflow"

### Auto-Update Flow
```
Photographer publishes gallery →
  Gallery appears in Supabase with status='live' →
    Website automatically shows the new gallery →
      No action needed by production company
```

### Customization (Client Dashboard > My Page tab)
- Edit headline / tagline
- Choose featured galleries (pin to top)
- Hide specific galleries
- Reorder event type sections
- Custom accent color
- Upload company logo

---

## Phase 2: AI Content Engine

### 2A. Auto-Generated Text

**Where:** Supabase Edge Function calling Claude API

| Text | Input | Output |
|------|-------|--------|
| Company About | Business name, event count, event types, years active | "Eclipse Media has produced over 150 events across 3 continents..." |
| Section Description | Event type + gallery count | "Our conference portfolio spans intimate 50-person boardrooms to 5,000-seat arenas..." |
| Gallery Caption | Gallery name, date, location, image count | "IAC 2026 Conference — January 16, Tel Aviv. 380 moments captured." |
| Social Post Caption | Top pick image, gallery name, event type | "Another incredible night at [event]. Full gallery link in bio." |

**Cost:** ~$0.003 per text generation = ~$1/month for active user

**Implementation:**
```
Supabase Edge Function: generate-text
  Input: { type: 'about' | 'section' | 'caption' | 'social', context: {...} }
  Calls: Claude API (claude-haiku for speed/cost)
  Returns: { text: string }
  Caches: result in gallery/business metadata to avoid re-generating
```

### 2B. Pitch Builder (Tender Response Generator)

**Flow:**
```
1. Client pastes tender text into Pitch Builder
2. AI analyzes: event type, size, vibe, requirements
3. System queries galleries matching criteria
4. AI selects best 20-30 photos from matching galleries
5. Presents 3 layout options (grid, timeline, magazine)
6. Client adjusts selection
7. Output: PDF download / shareable link / image folder
```

**Technical:**
- Claude API analyzes tender text → extracts structured criteria
- SQL query filters galleries by event_type, date range, image_count
- Top picks from matching galleries ranked by relevance
- PDF generation via html2pdf or Puppeteer
- Shareable link = a new page type in gallery-web

### 2C. Smart Photo Selection

**Beyond manual Top Picks:**
- AI suggests top picks based on composition, faces, lighting
- "Auto-curate" button: AI selects the best 20% of photos
- Duplicate/similar detection (already partially built)
- Face grouping: "Show all photos of [person]"

---

## Phase 3: Social Media Management

### 3A. Content Calendar (Enhanced)

**Current:** Basic weekly spread of top picks  
**Enhanced:**

```
Production Company Dashboard > Content Calendar

Mon Apr 14  │ Instagram Post    │ [photo] │ "Amazing night at..."  │ [Download] [Schedule]
            │ LinkedIn Post     │ [photo] │ "We produced..."       │ [Download] [Schedule]
Wed Apr 16  │ Instagram Carousel│ [3 photos] │ "Conference highlights" │ [Download]
            │ Facebook Post     │ [photo] │ "Throwback to..."      │ [Download]
Fri Apr 18  │ Instagram Story   │ [story video] │ auto                │ [Download]
            │ Instagram Post    │ [photo] │ "Weekend vibes..."     │ [Download]
```

**Features:**
- AI generates captions per platform (Instagram vs LinkedIn tone)
- Different aspect ratios per platform (1:1 IG, 16:9 LinkedIn, 9:16 Story)
- Auto-spread across weeks for consistent posting
- Download per-day or per-week bundles
- "Approve" workflow: photographer creates, client approves

### 3B. Platform-Specific Content

| Platform | Format | Content |
|----------|--------|---------|
| **Instagram Feed** | 1:1 square | Top picks with captions |
| **Instagram Stories** | 9:16 vertical | Story videos + individual photos |
| **Instagram Carousel** | 1:1 x 10 | Themed photo sets from events |
| **LinkedIn** | 16:9 landscape | Professional event highlights |
| **Facebook** | Mixed | Event albums + cover photos |
| **Website** | Auto | Portfolio updates |

### 3C. Scheduling Integration (Future)

- Connect to Buffer / Later / Hootsuite API
- Or build native scheduling: "Post this on Monday at 10am"
- Instagram Business API for direct posting
- Auto-post stories from gallery stories

---

## Phase 4: Analytics & Insights

### 4A. Gallery Analytics (Track in gallery-web)

```javascript
// On every gallery page view, log to Supabase
INSERT INTO gallery_views (gallery_id, viewer_ip_hash, referrer, device, timestamp)
```

**Dashboard shows:**
- Views per gallery (total + daily chart)
- Most viewed photos
- Download counts
- Geographic distribution (IP → country)
- Device breakdown (mobile vs desktop)
- Referrer sources (Instagram, LinkedIn, direct)

### 4B. Content Performance

- Which photos get the most views?
- Which event types are most popular?
- Best time to post (based on view patterns)
- Client engagement score

### 4C. Reports for Production Company

**Monthly PDF report:**
- Total views across all galleries
- Top performing content
- Growth trends
- Recommendations for next month

---

## Phase 5: Notifications & Reminders

### 5A. Push for Content

```
Weekly: "You have 12 new photos ready to post. View your Content Calendar →"
Monthly: "Your monthly analytics report is ready →"
After event: "Gallery [name] is live! Share it with your network →"
Milestone: "Congratulations! You've reached 10,000 gallery views 🎉"
```

**Channels:**
- Email (via Supabase email or Resend)
- In-dashboard notifications
- Optional: WhatsApp Business API

### 5B. Reminders to Post

```
"You haven't posted in 5 days. Here are 3 ready-to-post photos →"
"[Event name] anniversary is next week. Great time for a throwback post →"
"New photos from your latest event are ready. Generate social content? →"
```

---

## Phase 6: White-Label & Custom Domains

### 6A. Subdomain System
```
eclipse-media.pixflow-ai.com  →  Production company's website
```
Requires: Wildcard DNS (A record *.pixflow-ai.com → 76.76.21.21)

### 6B. Custom Domain (Premium)
```
photos.eclipse-media.com  →  CNAME to pixflow-ai.com
```
- Company adds CNAME record
- Vercel auto-provisions SSL
- Complete white-label: no Pixflow branding visible

### 6C. Branding
- Custom accent color
- Company logo throughout
- Custom fonts (select from curated list)
- Remove "Powered by Pixflow" (premium tier)

---

## Pricing Model

| Tier | Monthly | What They Get |
|------|---------|---------------|
| **Starter** | Free | 3 galleries, basic delivery |
| **Pro** | $19/mo | Unlimited galleries, client pages, stories |
| **Business** | $39/mo | Everything + vendor portal, content calendar, AI text |
| **Retainer** | $79/mo | Everything + auto-website, social content, analytics, pitch builder, scheduling, custom domain |

**The key insight:** The photographer charges the production company $500-2000/month retainer. Pixflow costs them $79. The margin is massive, and Pixflow does 80% of the work automatically.

---

## Technical Architecture

### Data Flow
```
Photographer (Electron App)
  ↓ publishes gallery
Supabase (Database + Storage)
  ↓ data available via API
Gallery-Web (Vercel)
  ↓ renders pages
  ├── /gallery/{id} — Individual gallery
  ├── /{slug}/client/{id} — Client portal
  ├── /{slug}/client/{id}/dashboard — Client dashboard
  ├── /{slug} — Auto-generated website ← NEW
  ├── /vendor/{code} — Vendor portal
  └── /{slug}/pitch/{id} — Pitch deck page ← NEW

AI Layer (Supabase Edge Functions)
  ├── generate-text — Claude API for captions/descriptions
  ├── analyze-tender — Parse tender requirements
  └── suggest-picks — AI photo selection

Analytics (Supabase)
  ├── gallery_views table
  ├── download_events table
  └── Monthly aggregation cron
```

### New Tables Needed
```sql
-- Website customization
business_website_settings (business_id, headline, tagline, about_text,
  accent_color, featured_gallery_ids, hidden_gallery_ids, social_links JSONB)

-- Analytics
gallery_views (id, gallery_id, timestamp, referrer, device, country)
download_events (id, image_id, gallery_id, timestamp, source)

-- AI generated content
ai_content_cache (id, business_id, content_type, context_hash, 
  generated_text, created_at, expires_at)

-- Pitch decks
pitch_decks (id, client_id, title, tender_text, selected_image_ids UUID[],
  layout, generated_at, pdf_url)

-- Social content queue
social_posts (id, business_id, client_id, platform, content_type,
  image_ids UUID[], caption, scheduled_for, posted_at, status)
```

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Auto-generated website (Phase 1) | Medium | 🔥🔥🔥🔥🔥 |
| 2 | Gallery analytics | Small | 🔥🔥🔥🔥 |
| 3 | AI text generation | Small | 🔥🔥🔥🔥 |
| 4 | Enhanced content calendar | Medium | 🔥🔥🔥🔥 |
| 5 | Pitch builder | Medium | 🔥🔥🔥 |
| 6 | Social post formatting | Medium | 🔥🔥🔥 |
| 7 | Notifications/reminders | Small | 🔥🔥🔥 |
| 8 | Custom domains | Small | 🔥🔥 |
| 9 | Scheduling integration | Large | 🔥🔥 |
| 10 | AI photo selection | Large | 🔥🔥 |

---

## The Retainer Pitch (What the Photographer Tells the Production Company)

> "I'll handle everything. After every event, your website updates automatically 
> with the best photos. Your social media content is generated weekly — you just 
> approve and post. Your vendors get their photos automatically. When you have a 
> tender, I'll generate a pitch deck from your portfolio in minutes. 
>
> All you need to do is focus on producing great events. I'll make sure the 
> world sees them.
>
> $1,500/month. Everything included."

---

## Summary

Pixflow transforms from a **photo delivery tool** into a **creative operations platform**. 

The photographer becomes indispensable — not because they take good photos (anyone can do that), but because they provide a complete creative infrastructure that the production company can't live without.

**That's the retainer.**
