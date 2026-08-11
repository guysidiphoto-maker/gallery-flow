# Story Studio — Controls Truth Matrix

Audit date: 2026-08-09. Read-only. No code changed.

## Objective test

`preview == export` because the editor's `<Player>` renders the exact same
`StoryStudioVideo` composition the server encodes (StoryStudioEditor.tsx:421,
inputProps `{ plan }`). Therefore a control **affects both preview and export iff
it writes a ScenePlan field that `StoryStudioVideo.tsx` reads.** Every row below
was traced control → field → composition read site.

Two indirection notes used throughout:

- **Global controls (template / length / pace)** do not each have to be read by
  the composition directly. They are inputs to `planStory()` (planner.ts), which
  rewrites `scenes[]`, `opening`, `outro`, etc. The composition reads those
  rewritten fields, so the global control's effect reaches export. Where the
  composition *also* branches on the raw field (only `plan.template` does), that
  is called out.
- The composition reads `scene.src` (StoryStudioVideo.tsx:99,111,127). `src` is
  attached only for preview and stripped before render (`sanitizeForRender`,
  sceneplan.ts:354). The render endpoint re-resolves `src` server-side, so this
  is not a divergence.

## 1. Controls matrix

| Control (UI) | ScenePlan field written | Read by StoryStudioVideo? | Status | Notes |
|---|---|---|---|---|
| Template segment (Editor:371) | `plan.template` (+ full `scenes[]` rebuild via planStory) | Yes — CARD_DESIGN[template] (:211), appear timing (:212), TemplateTreatment (:441), StoryProgressBars gate (:442) | Implemented | The only global read directly by the composition. Changes card art direction, letterbox/vignette, reel progress bars, and (via replan) motion/transition/pace vocab. |
| Length segment (Editor:372) | `plan.length` (drives `scenes[]` count + durations via planStory) | Indirect — `length` itself unread; the `scenes[]`/durations it produces are read (:411,:412) | Implemented | LENGTH_TARGETS (planner:146) sets target seconds + max scenes. Full replan on change (setGlobal, Editor:263). |
| Pace segment (Editor:373) | `plan.pace` (drives per-scene `durationSec` via PACE_MULT) | Indirect — `pace` unread; resulting `durationSec` read (:412) | Implemented | PACE_MULT (planner:152) scales hold time. Full replan on change. |
| Per-scene duration slider (Editor:526) | `scene.durationSec` | Yes — secToFrames per scene (:401,:412,:428) | Implemented | Clamped MIN/MAX_SCENE_SEC in UI (1.2–6.0s). |
| Motion select (Editor:538) | `scene.motion` | Yes — switch on motion (:53) push-in/pull-out/focus-zoom/punch-in/pan/none | Implemented | All 6 vocab values handled by the composition. |
| Transition select (Editor:547) | `scene.transitionIn` + `scene.transitionDurationSec` | Yes — TransitionWrap type (:419,:457) + overlap frames (:413) | Implemented | UI forces duration 0 for "cut", 0.4s otherwise. All 6 transition types handled (:457–:469). |
| Fit toggle — "fill" (Editor:557) | `scene.fit="fill"` **and** `scene.background="none"` | `fit` Yes (:93/:125). `background` **No** | Partial | The `fit` half works. The `background` field it also writes is never read by the composition (see gap below). |
| Fit toggle — "fit/contain" (Editor:558) | `scene.fit="fit"` **and** `scene.background="blur"` | `fit` Yes (:93). `background` **No** | Partial | The "fit" branch (:93–:122) hard-codes a blurred cover backdrop regardless of `scene.background`. "color"/"none" backgrounds are impossible to express — no UI and no composition support. |
| Focal point (click on image) (Editor:518) | `scene.focal` {x,y} | Yes — objectPosition + transformOrigin (:90,:91) | Implemented | Also drives Ken Burns anchor. |
| Caption / on-image text (Editor:580) | `scene.text` {content, position:"bottom"} | Partial — read only in the `fill` branch (:138) | Partial | Caption is rendered ONLY when `scene.fit==="fill"`. In the "fit/contain" branch (:96–:122) `scene.text` is never rendered → typing a caption on a letterboxed (landscape) scene shows in neither preview nor export. Also `text.position` is written but ignored: SceneCaption is hard-pinned bottom (:151); "top"/"center" do nothing. |
| Storyboard reorder (drag) (Editor:604) | `scenes[]` order | Yes — mapped in sequence order (:411) | Implemented | |
| Move ◀ ▶ (Editor:628,631) | `scenes[]` order | Yes (:411) | Implemented | Button fallback for drag. |
| Duplicate scene (Editor:629) | appends to `scenes[]` | Yes (:411) | Implemented | |
| Remove scene (Editor:630) | removes from `scenes[]` | Yes (:411) | Implemented | Floored at 3 scenes to keep plan valid. |
| Regenerate auto (Editor:375) | rebuilds `scenes[]`, re-applies overrides | Yes (:411) | Implemented | |
| Reset to auto (Editor:378) | full plan rebuild, clears overrides | Yes (whole plan) | Implemented | window.confirm guarded. |
| Undo / Redo (Editor:376,377) | swaps whole `plan` | Yes | Implemented | 50-step history. |
| Preview transport (play/seek/restart) (Editor:435–443) | none (Player state only) | n/a | Cosmetic-only (by design) | Preview scrubber; correctly not a plan field. Not a bug. |
| Render / Retry / Re-render (Launcher:227,204) | none (submits plan) | n/a | Implemented (operational) | Calls requestStudioRender with current plan. |
| Cancel render (Launcher:214) | none | n/a | Implemented (operational) | Stops polling + best-effort server cancel. |
| Render cap notice + disabled button (Launcher:218,227) | none (reads checkRenderFeasibility) | n/a | Implemented (operational) | Enforces RENDER_MAX_SCENES=18 / RENDER_MAX_DURATION_SEC=45; server re-enforces. |

### Fields defined in the contract but NOT surfaced by any editor control

These exist in ScenePlan and are honored by the composition, but the photographer
has no control to set them (auto-only or fixed):

| ScenePlan field | Read by composition? | Any UI control? | Status |
|---|---|---|---|
| `opening` TitleCard (title/subtitle/showLogo/duration/enabled) | Yes — CardLayer (:405) | **No** | Missing (editor). Auto-filled from event/brand (planner:485). Photographer cannot edit the title text, toggle the card, or change its duration. |
| `outro` TitleCard | Yes — CardLayer (:432) | **No** | Missing (editor). Same as opening. |
| `scene.motionDirection` | Yes — pan tx/ty (:76) | **No** | Missing. Only "pan" motion uses it; direction is auto-chosen (planner:423). |
| `scene.motionIntensity` | Yes — intensity scalar (:48) | **No** | Missing. Fixed per template by planner (:466). |
| `scene.text.position` | **No** — SceneCaption hard-pinned bottom (:151) | Written as "bottom" only | Cosmetic-only field. |
| `scene.background` | **No** — "fit" branch always blurs, "fill" branch never uses it (:93) | Written by Fit toggle | Cosmetic-only field (see Fit rows). |
| `plan.music` (MusicConfig) | **No** — no audio anywhere in the composition | **No** | Missing. Contract has full music config (trackId/volume/fades/muted, sceneplan:157) but the renderer emits a silent MP4. |
| `brand.watermark` | Yes — Watermark (:370) | **No** (resolved from Brand Kit) | Implemented via brand snapshot, not an editor control. Acceptable. |
| Add photo (`HE.addPhoto` string exists, Editor:41) | — | **No button wired** | Missing. The Hebrew label is defined but there is no add-photo control; you can only remove/duplicate existing scenes. |

## 2. P0 GAPS

Ranked for a first release aimed at getting a photographer to switch from
Pic-Time / Pixieset. Each is cross-checked against code. I am deliberately short:
the core edit loop (template/length/pace, per-scene duration/motion/transition/
focal/reorder, live preview = export) is genuinely implemented and is the hard
part. The gaps below are the ones that will actually lose the sale or produce a
"the export doesn't match what I edited" support ticket.

### P0-1 — Music / audio track. Effort: L
- **What:** No soundtrack. The contract already models it (`plan.music`,
  sceneplan.ts:157) but `StoryStudioVideo.tsx` renders zero audio — grep the
  file: no `<Audio>`, no `useAudioData`, nothing.
- **Why P0:** A silent highlights reel is not a shippable social deliverable in
  2026. Pic-Time/Pixieset slideshows ship with music; a muted MP4 reads as
  broken. This is the single biggest credibility gap.
- **Needs:** Editor UI to pick a track + volume/mute → already-existing
  `plan.music` fields. Composition: add a Remotion `<Audio>` bound to
  `plan.music.trackId` with `fadeInSec`/`fadeOutSec`/`volume`/`muted`. Plus a
  licensed track library + server-side asset resolution (the L driver). Render
  must also mux audio (verify the render endpoint/Lambda encodes audio, not just
  video).

### P0-2 — Caption is dropped on letterboxed (landscape) scenes. Effort: S
- **What:** `SceneLayer` renders `scene.text` only in the `fit==="fill"` branch
  (StoryStudioVideo.tsx:138). The `fit==="fit"` branch (:96–:122) returns before
  any caption. Landscape photos auto-use "fit" (planner:446), so a caption typed
  on a landscape scene appears in neither preview nor export.
- **Why P0:** Silent data loss that violates the preview==export promise — the
  photographer types text, sees it vanish (or worse, sees it in preview on a
  fill scene but not after switching fit), and loses trust. Captions are a
  headline feature of story tools.
- **Needs:** No new field. Move the `{scene.text ? <SceneCaption/> : null}`
  render so it wraps both branches (e.g. render it in the outer AbsoluteFill
  after the image in both cases).

### P0-3 — `scene.background` and caption `position` are written but ignored (cosmetic-only). Effort: S–M
- **What:** The Fit toggle writes `scene.background` ("none"/"blur",
  Editor:557–558) and captions write `text.position:"bottom"` (Editor:580), but
  the composition reads neither — the "fit" branch always blurs (:93) and
  SceneCaption is hard-pinned `bottom:360` (:151).
- **Why P0:** These are live controls (or fields) whose written value never
  reaches export. Per the audit definition these are cosmetic-only = bugs. Text
  position especially: photographers expect top/center/bottom placement, and
  bottom:360 will collide with faces on many portraits.
- **Needs:** Honor `text.position` in SceneCaption (top/center/bottom → change
  the absolute offset). For `background`, either (a) make the "fit" branch honor
  `background` ("color" = solid accent/black backdrop, "none" = plain black bars)
  and expose it, or (b) delete the unused field + stop writing it so the contract
  stops lying. Decide one; do not leave a written-but-ignored field.

### P0-4 — No title/outro card editing. Effort: M
- **What:** `opening`/`outro` TitleCards are rendered (CardLayer, :405/:432) and
  auto-filled from event+brand (planner:485–500), but there is zero UI to edit
  the title/subtitle text, toggle a card off, or set its duration. `HE.eventTitle`
  / `HE.eventDate` strings exist (Editor:48–49) but are not wired to any input —
  `SceneControls`' `event`/`onGlobalEvent` props are passed and then ignored
  (Editor:386 passes `onGlobalEvent={() => {}}`).
- **Why P0:** The opening title is the first frame a client sees. A photographer
  will absolutely want to fix a wrong event name, change "SEP 2026" phrasing, or
  drop the intro entirely. Right now they cannot without editing the gallery
  event record.
- **Needs:** A small "title cards" panel writing `plan.opening`/`plan.outro`
  (title, subtitle, enabled toggle, showLogo, durationSec). All fields already
  read by the composition — pure UI wiring, no composition change.

### P0-5 — Cannot add a photo to the story. Effort: M
- **What:** You can remove and duplicate scenes, but there is no "add photo from
  gallery" control. The label `HE.addPhoto` (Editor:41) is defined and never
  rendered.
- **Why P0:** The auto-cut trims to the render cap and de-dupes bursts
  (planner:329,333). A photographer who wants a specific shot the auto-editor
  dropped has no way to put it back short of a full reset. That is a common,
  reasonable edit and its absence feels broken.
- **Needs:** A picker over the full `images` prop → build a new `Scene`
  (mirroring planner's scene construction) and splice into `scenes[]`. No
  contract or composition change; must respect RENDER_MAX_SCENES (checkRender-
  Feasibility already gates render, so worst case is a disabled render button).

## What is genuinely done (not padding the gap list)

The differentiating core is real and honest: three templates that diverge on
pace/motion/transition/card design/frame treatment (planner TEMPLATE_PROFILES +
composition CARD_DESIGN/TemplateTreatment), subject-aware focal + face-edge
motion guarding, deterministic replan, per-scene duration/motion/transition/
focal/fit editing, reorder with drag+button fallback, undo/redo, debounced
autosave/draft restore, and a live preview that is byte-for-byte the export path.
The gaps above are additive (music, title editing, add-photo) or small
correctness fixes (caption in fit branch, honor position/background), not a
rewrite.
