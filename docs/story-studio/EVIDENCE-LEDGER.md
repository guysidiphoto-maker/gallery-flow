# Story Studio — Competitor & Platform Evidence Ledger
_Compiled 2026-08-08. All URLs accessed 2026-08-08. Capability research only — no protected UI/code/templates copied._

## PART A — Pic-Time slideshow/story (competitor)

### A.1 VERIFIED (official Pic-Time sources)
| Claim | Detail | Source |
|---|---|---|
| Auto-generation | **NO auto-generation** — creation is manual ("select your images"). Photos pulled from gallery, no re-upload. | help.pic-time.com/articles/7915295; pic-time.com/features/slideshows |
| Vertical format | YES — 3:2, 16:9, 4:3, **9:16** ("fit vertical social media … Instagram stories and reels"). | help 7915295; features/slideshows |
| Output res | Full HD **1920×1080**; **4K 3840** long-edge (paid add-on). | help 7910718 |
| Music library | Professional: **2,000 tracks**; Advanced: **10,000+** (Soundstripe-sourced, licensed). | pricing; help 7841133 |
| User music | YES — **.mp3 only** + "Music Match" licensed-equivalent finder. | help 7841133 |
| Beat-match | AI modes Fast/Normal/Slow/Rapid/Turbo; time modes 4s/2s/1s/0.5s per slide; manual pulse editing. | help 7841133 |
| Transitions | fast/slow crossfade, fade-to-bg-color, hard cut. | help 7915295 |
| Editing | colors, text, layouts, multi-image layouts, title slides (text+logo), **drag-reorder**, per-slide duration + bg color. | help 7915295 |
| Branding | logo, cover name, **watermark auto-included**. | features/slideshows |
| Export | downloads as **video file**; embed anywhere; client download; sellable in store. | help 7910718 |
| Tier gating | requires **Professional (~$21–25/mo)** or **Advanced (~$42–50/mo)**; Free/Beginner excluded; 4K paid add-on. | pricing |

### A.2 ASSUMPTION (high-confidence, from absence in official sources)
- No AI/auto photo-selection, no "highlights/top-pick" auto-pick (only AI is audio beat-sync).
- No face/subject-aware cropping.
- No personalized per-guest story from face-search.
- Exact Soundstripe redistribution license terms and 4K add-on price not confirmed verbatim.

## PART B — Meta / Instagram export specs

### B.1 / B.2 VERIFIED (Meta Ads Guide / Business Help — server-rendered)
Stories **and** Reels (ad specs): recommended **1440×2560**, aspect **9:16** (1% tol), **H.264**, square pixels, constant/progressive frame rate, **stereo AAC 128 kbps+**, container **MP4/MOV**, max **4 GB**. Safe zones (Meta-stated): **~14% top, ~35% bottom, ~6% each side** free of text/logos. Story primary text ≤125 chars.
Sources: facebook.com/business/help/2222978001316177; facebook.com/business/ads-guide/update/video/instagram-story; …/instagram-reels

### B.3 ASSUMPTION (organic; help.instagram.com is JS-rendered, returned empty on fetch — community consensus)
- Organic Stories/Reels practical standard **1080×1920, 9:16** (master higher at 1440×2560).
- Organic Story card up to **60s**; Reels recommended ≤3 min.
- **30 fps** recommended (24/60 accepted). Bitrate ~4–8 Mbps 1080p. Color Rec.709/sRGB 8-bit.
- Pixel safe zones ≈ top ~250px / bottom ~340px of a 1080×1920 frame.

## PART C — Synthesis

| Capability | Pic-Time | Pixflow already has | Pixflow missing | Opportunity |
|---|---|---|---|---|
| Auto-story from gallery | Manual only (V) | scene auto-grouping | one-click full-gallery generate | **ship true auto-gen** |
| Highlights/top-pick auto-select | None (A) | `is_top_pick` + `image_ai_scores.story_score` | wire scores→selection | green-field win |
| Intelligent pacing/sequencing | beat-match presets (V) | deterministic motion seq | narrative arc + energy pacing | go beyond beat-sync |
| Face/subject-aware crop | None (A) | `image_faces.bbox`, `suggested_crop_focal_x/y` | wire into 9:16 crop | **reuse face infra** |
| Brand kit | logo+name+watermark (V) | branded outro/logo/watermark | fonts/colors/title cards | full brand kit parity+ |
| Editable timeline | drag-reorder + per-slide dur (V) | drag-reorder scenes | fine timeline + per-transition | near parity |
| Per-scene control | bg/text/layout/dur (V) | layout(auto)+dur | per-scene text/crop/motion | close gap |
| Music/licensing | 2K–10K lib+upload+sync (V) | **none in story pipeline** | licensed lib + sync | biggest gap; licensing = moat |
| Text/title cards | title slide+logo (V) | outro only | intro/caption cards | add + auto-captions |
| 9:16 export | 9:16 HD/4K (V) | **1080×1920 H.264 MP4** | 1440 master/4K | parity at 1080p |
| Preview=export parity | undocumented (A) | preview step; parity is a known risk | guaranteed WYSIWYG | trust feature |
| Per-guest story from face-search | None (A) | face-index/search infra exists | wire results→story | unique differentiator |

### Where Pixflow can be materially better (only when implemented + verified)
1. **True one-click auto-story from a whole gallery** (Pic-Time is manual-only).
2. **AI highlight/top-pick auto-selection** (neither competitor has it; signals already in schema).
3. **Face/subject-aware 9:16 cropping** reusing existing Rekognition/focal data.
4. **Personalized per-guest story** from authorized face-search results (no competitor equivalent).
5. **Guaranteed preview = export parity** (single scene-plan drives both).
6. **Match Pic-Time on music** (licensed library + upload + sync) — the one real gap; licensing is the moat.
