# Feed Studio Deep — Architecture & Contracts

**Status**: living spec for the multi-format Feed Studio rebuild. All parallel work
must conform to the type signatures and API contracts here. If you need to change
a shape, update this file first.

**Hard constraint** (founder, 2026-05-06):
> "בסוף לכל גלריה יש תמונות טופ אז רק אותם אני רוצה שהמערכת תציע לעלות לאינסטגרם"

The AI may **only** propose images where `images.is_top_pick = true`. Non-top-picks
are invisible to every Feed-Studio code path. No exceptions.

---

## 1. The 8-step user flow

```
1. Choose galleries        (default: all live galleries; user can deselect)
2. Creative Brief Wizard   (10 questions; saved per generation)
3. AI analyzes top picks   (Claude vision per image, cached in image_ai_scores)
4. AI proposes plan        (3 variants, multi-format: single/carousel/story/reel/text)
5. User edits plan         (advanced settings + AI direction buttons)
6. AI generates assets     (captions, slide copy, suggested crops)
7. User approves           (per-post status flips to 'accepted')
8. Workspace               (calendar of approved posts, edit/replace/schedule)
```

---

## 2. Data shapes (frozen contracts)

### 2.1 Brief

```ts
type ImageCountPreset = '1' | '3-5' | '6-10' | 'ai_decides' | 'custom'
type CarouselPreset   = 'every_gallery' | 'strong_only' | 'mix' | 'none'
type SpreadPreset     = 'one_per_post' | 'split_2_3' | 'full_block' | 'ai_decides'
type FeedGoal         = 'premium_clean' | 'show_many_events' | 'sell_quality'
                      | 'atmosphere_emotion' | 'active_successful' | 'portfolio'
type ContentMix       = '70_people_30_atmo' | '50_50' | '30_people_70_design'
                      | 'more_wide' | 'more_closeup' | 'more_branding' | 'ai_balance'
type GridFeel         = 'editorial' | 'luxury_corporate' | 'energetic' | 'bold_campaign'
                      | 'minimal_dark' | 'colorful_loud' | 'magazine_collage'
type TextSlidePolicy  = 'between_images' | 'titles_only' | 'campaign_openers'
                      | 'no_text' | 'ai_decides'
type PostTypeSet      = Array<'feed' | 'carousel' | 'story' | 'reel_cover'
                            | 'highlight_cover' | 'campaign_title'>
type TotalPosts       = '3' | '6' | '9' | '12' | 'monthly_plan' | 'custom'
type Continuity       = 'strict_continue' | 'continue_refresh' | 'new_campaign'
                      | 'ai_suggests_3'

interface Brief {
  imageCount:       ImageCountPreset
  imageCountCustom?:number       // when imageCount === 'custom'
  carousels:        CarouselPreset
  spread:           SpreadPreset
  goal:             FeedGoal
  contentMix:       ContentMix
  feel:             GridFeel
  textSlides:       TextSlidePolicy
  postTypes:        PostTypeSet   // multi-select
  totalPosts:       TotalPosts
  totalPostsCustom?:number
  continuity:       Continuity

  // Advanced settings (collapsible — defaults are sensible)
  advanced?: {
    maxImagesPerGallery?:    number     // default: derived from imageCount
    minImagesPerGallery?:    number     // default: 1
    allowGalleryReuse?:      boolean    // default: true
    allowMultiSlot?:         boolean    // default: derived from spread
    carouselLength?:         number     // default: 3-5
    storyCount?:             number     // default: 5
    textSlideFrequency?:     'low' | 'med' | 'high'
    peopleAtmoRatio?:        number     // 0..1, 1=all people; default from contentMix
    brandLogoUsage?:         'never' | 'sparingly' | 'often'
    typographyDensity?:      'minimal' | 'balanced' | 'dense'
    colorConsistency?:       number     // 0..10
    gridSymmetry?:           number     // 0..10
    creativeFreedom?:        number     // 0..10 (low = stick to safe; high = experimental)
  }
}
```

### 2.2 Image AI score (per top-pick, cached)

```ts
type SuggestedUsage = 'hero' | 'support' | 'carousel_anchor'
                   | 'story_only' | 'background' | 'ignore'

interface ImageScore {
  image_id:          string
  hero_score:        number    // 0..10 — works alone as a feed post
  carousel_score:    number    // 0..10 — works in a swipeable set
  story_score:       number    // 0..10 — works as a vertical 9:16 story
  atmosphere_score:  number    // 0..10 — captures vibe vs. just data
  people_density:    number    // 0..10 — 0=no people, 10=crowd
  brand_fit:         number    // 0..10
  social_potential:  number    // 0..10 — likely to perform on IG
  suggested_usage:   SuggestedUsage
  suggested_crop_focal_x: number  // 0..1
  suggested_crop_focal_y: number  // 0..1
  rationale_he:      string    // one Hebrew sentence
  scored_at:         string    // ISO
}
```

### 2.3 Post (multi-format)

```ts
type PostFormat = 'single' | 'carousel' | 'story' | 'reel_cover' | 'text_slide'
type PostStatus = 'draft' | 'scheduled' | 'published'

interface Crop { aspect: '1:1' | '4:5' | '9:16'; focalX: number; focalY: number }

interface BasePost {
  id:                string          // uuid for client-side keys
  position:          number | null   // 1..N for grid posts; null for stories/reels not on grid
  format:            PostFormat
  source_gallery_id: string | null   // which event this draws from (null for text_slide)
  reasoning:         string          // why this post, this format, this gallery
  scheduled_at?:     string
  status?:           PostStatus
}

interface SinglePost extends BasePost {
  format:    'single'
  image_id:  string
  caption:   string
  crop?:     Crop
}

interface CarouselPost extends BasePost {
  format:           'carousel'
  image_ids:        string[]                                    // 2..10
  opening_caption:  string                                       // first slide / IG caption
  slide_captions:   Array<{ image_id: string; caption: string }> // 1:1 with image_ids
  crops?:           Record<string, Crop>                         // image_id → crop
}

interface StoryPost extends BasePost {
  format:        'story'
  image_ids:     string[]
  slide_meta:    Array<{ image_id: string; overlay_text?: string; sticker?: string }>
  crops?:        Record<string, Crop>
}

interface ReelCoverPost extends BasePost {
  format:    'reel_cover'
  image_id:  string
  hook_text: string
  caption:   string
  crop?:     Crop
}

interface TextSlidePost extends BasePost {
  format:           'text_slide'
  image_id:         null
  headline:         string
  sub:              string
  background_color: string  // hex
  text_color:       string  // hex
}

type Post = SinglePost | CarouselPost | StoryPost | ReelCoverPost | TextSlidePost
```

### 2.4 Variant (multi-format)

```ts
interface Variant {
  id:        'rhythm' | 'symphony' | 'continuity'
  label:     string          // Hebrew
  tagline:   string
  rationale: string
  posts:     Post[]
}
```

### 2.5 feed_plans.posts JSONB

```ts
interface FeedPlanPosts {
  brief?:               Brief
  variants?:            Variant[]
  chosen_variant_id?:   string
}
```

---

## 3. Database schema

### 3.1 New table — `image_ai_scores`

```sql
CREATE TABLE image_ai_scores (
  image_id          UUID PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  hero_score        NUMERIC(3,1) NOT NULL,
  carousel_score    NUMERIC(3,1) NOT NULL,
  story_score       NUMERIC(3,1) NOT NULL,
  atmosphere_score  NUMERIC(3,1) NOT NULL,
  people_density    NUMERIC(3,1) NOT NULL,
  brand_fit         NUMERIC(3,1) NOT NULL,
  social_potential  NUMERIC(3,1) NOT NULL,
  suggested_usage   TEXT NOT NULL CHECK (suggested_usage IN
    ('hero','support','carousel_anchor','story_only','background','ignore')),
  suggested_crop_focal_x NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  suggested_crop_focal_y NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  rationale_he      TEXT NOT NULL,
  scored_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  scored_by_model   TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
);
CREATE INDEX image_ai_scores_usage_idx ON image_ai_scores(suggested_usage);
ALTER TABLE image_ai_scores ENABLE ROW LEVEL SECURITY;
-- Read: anyone (public client dashboard) — scores are not sensitive
CREATE POLICY image_scores_read ON image_ai_scores FOR SELECT USING (true);
-- Write: service role only (called by API; not exposed to anon)
```

### 3.2 No change to `feed_plans` schema — `posts` JSONB already accommodates the new shape.

---

## 4. API contracts

### 4.1 `POST /api/score-images`

```ts
Request:  { clientId: string }
Response (200): {
  ok: true
  scored: number          // newly scored
  cached: number          // already scored (skipped)
  total: number           // top_picks count
  trace_ms: number
}
Response (4xx/5xx): { ok: false; error: string; detail?: string }
```

Logic:
1. Fetch top_picks for client (across live galleries).
2. Filter out images that already have a row in `image_ai_scores`.
3. For remaining, call Claude vision in batches of 8 images per call.
4. Persist scores. Return summary.

Cost target: ~$0.30 per 100 new images. Idempotent — calling twice scores 0 the second time.

### 4.2 `POST /api/generate-feed`  (extended)

```ts
Request:  { clientId: string; brief: Brief; selectedGalleryIds?: string[] }
Response (200): {
  ok: true
  plan: {
    id: string
    variants: Variant[]
    status: 'draft'
    created_at: string
  }
  trace_ms: number
}
Response (4xx/5xx): { ok: false; error: string; detail?: string; tail?: string }
```

Logic:
1. Validate brief shape.
2. Fetch top_picks for client (filtered by `selectedGalleryIds` if provided), join with `image_ai_scores`.
3. **If scoring is missing** for ≥10% of top picks, return error `scores_not_ready` (frontend must call `/api/score-images` first).
4. Build prompt with brief + scored top picks (using image_index 1..N pattern).
5. Single Claude Sonnet call requesting 3 variants × multi-format posts.
6. Persist + return.

The prompt explicitly references the brief in the rationale field, so the user
sees how their choices shaped the plan.

### 4.3 `POST /api/regenerate-feed-with-tweak`

```ts
Request: {
  planId: string
  tweak: 'plan_deeper' | 'use_more_images' | 'more_editorial' | 'more_premium'
       | 'more_social' | 'less_repetitive' | 'spread_gallery_over_3'
       | 'turn_into_carousel' | 'replace_weak' | 'explain_layout'
  context?: { galleryId?: string; postId?: string }   // optional, when tweak is targeted
}
Response: same shape as generate-feed
```

Logic: re-runs generation with original brief + tweak directive prepended to prompt.

---

## 5. Component contracts

### 5.1 CreativeBriefWizard

```tsx
<CreativeBriefWizard
  onSubmit={(brief: Brief) => void}
  onCancel={() => void}
  initial?: Partial<Brief>
/>
```

Renders 10 steps + advanced-settings panel. Shows progress bar 1/10 .. 10/10.
Each step has Hebrew question + multi-select or single-select options.
"חזור" / "הבא" / "סיום" buttons. All state lives in the wizard until submit.

### 5.2 GalleryDeepDive

```tsx
<GalleryDeepDive
  galleryId: string
  galleryName: string
  topPicks: TopPick[]                    // all top_picks for this gallery
  scores: Map<string, ImageScore>        // image_id → score (may be partial)
  onClose: () => void
  onRescore: () => void                  // triggers /api/score-images
/>
```

Grid of cards, one per top_pick. Each card:
- Photo thumbnail (with suggested_crop applied)
- Suggested usage badge (color-coded)
- Three score bars: brand_fit · social_potential · atmosphere
- Hebrew rationale at the bottom
- Click a card → expand to show all 7 scores

### 5.3 PostPreview (multi-format)

```tsx
<PostPreview
  post: Post
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  onClick?: () => void
/>
```

Picks the right sub-component based on `post.format`:
- SinglePostCard
- CarouselPostCard       (3D-stacked slides)
- StoryPostCard          (9:16 phone mockup)
- ReelCoverPostCard      (9:16 with hook overlay)
- TextSlidePostCard      (designed-text preview)

### 5.4 AIDirectionBar

```tsx
<AIDirectionBar
  onTweak: (tweak: TweakKind) => void   // calls /api/regenerate-feed-with-tweak
  busy?:    boolean
/>
```

Horizontal bar of tweak buttons.

---

## 6. Critical invariants

1. **Top picks only.** Every code path that reads images for the AI MUST filter
   `is_top_pick = true`. No exceptions.
2. **Image references are indices in API I/O.** Server sends `[1] [2] ...`,
   model returns `image_index`, server maps back to `image_id`.
3. **Brief is persisted with the plan.** The plan rationale must reference the
   brief, so the user sees the connection.
4. **Scores are cached.** Don't re-score images that have a row in
   `image_ai_scores`. Score-images is idempotent.
5. **No burned-in text on photos.** Captions render below the post (for `single`,
   `carousel`, `reel_cover`). `text_slide` is a designed text card, not a photo.

---

## 7. Out-of-scope for v1

- Real Instagram publishing (Graph API). "Published" status is manual flag.
- Brand-Brain memory across feeds (continuity engine).
- Auto-generated reel videos. We pick the cover; the photographer edits the reel.
- AI auto-rewrite of captions inside the editor (manual edit only, for now).
- Schedule auto-balance across days. Default schedule still Mon/Wed/Fri 19:00.
