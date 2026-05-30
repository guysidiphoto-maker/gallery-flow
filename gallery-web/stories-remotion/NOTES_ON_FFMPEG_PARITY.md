# FFmpeg → Remotion Parity Notes

Reference for: `gallery-web/stories-remotion/src/Clean.tsx`
Source of truth (desktop): `src/main/storyRenderer.ts`

This is the per-primitive mapping we used for the spike, plus every known
visual gap. Anything marked "GAP" needs a Phase 1 fix before we promote
Remotion to the production renderer.

---

## Output geometry

| Aspect                | FFmpeg (desktop)                                | Remotion (spike)            | Notes |
|-----------------------|-------------------------------------------------|-----------------------------|-------|
| Final resolution      | 1080 × 1920                                     | 1080 × 1920                 | Match |
| Frame rate            | 30 fps                                          | 30 fps                      | Match |
| Codec / pix_fmt       | libx264 / yuv420p                               | libx264 / yuv420p (default) | Match |
| Bitrate (final mux)   | 4.5 Mbit/s (2.5 per scene)                      | `videoBitrate: '4500k'`     | Match |
| Working res for motion| 2160 × 3840 (2×) then `scale=1080:1920:lanczos` | 1080 × 1920 (CSS transform) | See "sub-pixel jitter" below |

---

## Motion primitives

| Desktop motion | FFmpeg filter                                                                 | Remotion equivalent                                  | Status |
|----------------|-------------------------------------------------------------------------------|------------------------------------------------------|--------|
| `zoom-in`      | `zoompan` with `z=min(1+on*r, endZoom)` centered                              | `transform: scale(1 + (endZoom-1)*t)`                | OK     |
| `zoom-out`     | `zoompan` with `z=max(1, endZoom - (on-1)*r)` centered                        | `scale(endZoom - (endZoom-1)*t)`                     | OK     |
| `pan-right`    | `zoompan` z=1.04, x=`(iw*z-iw)*(on-1)/d`, y centered                          | `scale(1.04) translateX(-(0.04*W)*(t-0.5))`          | OK*    |
| `pan-left`     | mirrored x expression                                                          | `scale(1.04) translateX((0.04*W)*(t-0.5))`           | OK*    |
| `drift-up`     | `zoompan` zoom-in + y `(ih*z-ih)/2 - 60*(on-1)/d` (60px at 2× = 30px final)   | `scale(...) translateY(-30 * t)`                     | OK     |
| `drift-down`   | mirrored y expression                                                          | `scale(...) translateY(30 * t)`                      | OK     |

\* Pan amplitude is approximated as `(zoom-1) * width`. The FFmpeg form uses
`(iw*zoom - iw)`, which is the same value at the source image size; because
the CSS transform applies to the rendered box (1080 wide), the perceived
travel is identical. **GAP candidate**: confirm during Phase 1 A/B that the
visual speed matches; if Remotion feels too slow / fast, multiply by ~1.1
empirically.

### End-zoom tables

Identical to desktop:

```ts
PORTRAIT_ZOOM  = { none: 1.0, subtle: 1.06, dynamic: 1.10 }
LANDSCAPE_ZOOM = { none: 1.0, subtle: 1.03, dynamic: 1.05 }
```

### Motion sequence assignment

Identical to desktop (deterministic, `sceneIndex % seq.length`):

```ts
PORTRAIT_MOTION_SEQ  = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left', 'drift-up', 'drift-down']
LANDSCAPE_MOTION_SEQ = ['zoom-in', 'pan-left', 'pan-right', 'zoom-out']
```

---

## Sub-pixel jitter

**Desktop strategy**: render motion at WORK_W=2160 / WORK_H=3840 (2× target),
then `scale=1080:1920:lanczos`. The integer-pixel rounding in `zoompan`
becomes 0.5 final-px movements, which the eye reads as smooth.

**Remotion strategy**: CSS `transform: scale() translate()` is computed in
floating-point, then composited by Chromium's GPU rasterizer. Chromium's
compositor does sub-pixel positioning natively, so the 2× working-resolution
trick is unnecessary. We add `will-change: transform; backface-visibility:
hidden` to force the GPU compositor path and avoid the rare CSS-transform
banding bug in headless raster.

**GAP risk**: If headless Chromium on Lambda falls back to software raster
under cold start, we may see jitter. Mitigation in Phase 1: render at
`scale=1.5` internally and `transform: scale(0.667)` outer, mimicking the
desktop 2× trick.

---

## Scene composition (orientation-based grouping)

| Desktop scene type | Layout                                       | Remotion component | Status |
|--------------------|----------------------------------------------|--------------------|--------|
| `portrait`         | Single image, cover-fit, motion              | `<MotionImage>`    | OK     |
| `landscape-1`      | Single landscape on blurred+darkened self    | `<Landscape1>`     | OK*    |
| `landscape-2`      | Two landscapes vstack, motion on the stack   | `<Landscape2>`     | OK     |
| `landscape-3`      | Three landscapes vstack, motion on the stack | `<Landscape3>`     | OK     |

\* `Landscape1` uses CSS `filter: blur(44px) brightness(0.55)`. FFmpeg uses
`boxblur=luma_radius=44:luma_power=2,colorlevels=rimax=0.55:...`. **GAP**:
CSS Gaussian blur is visually softer than FFmpeg box blur (×2 power) — the
darkened bg may look a hair smoother. Acceptable for the spike; revisit if
the QA reviewer flags it.

---

## Transitions

| Desktop                                    | Remotion                                              | Status |
|--------------------------------------------|-------------------------------------------------------|--------|
| `xfade=transition=fade:duration=0.4`       | Per-scene opacity interpolation, overlapping by 0.4s  | OK     |
| `slideleft / slideright / slideup / ...`   | NOT implemented (spike only does `clean` style)       | N/A    |
| `wipeleft / wiperight`                     | NOT implemented                                        | N/A    |
| `zoomin` transition                        | NOT implemented                                        | N/A    |

For the `clean` style the desktop always picks `fade`, so the spike matches.
Phase 1 will add slide/wipe/zoom for the `cinematic` and `energetic` styles.

---

## Scene-duration math

Identical math to desktop:

- `TRANSITION_DURATION_SEC = 0.4`
- `MIN_SCENE_DURATION_SEC = 2.0`
- `MAX_SCENE_DURATION_SEC = 8.0`
- `per_scene = clamp((total - (n-1)*0.4) / n, 2.0, 8.0)`

`computeTotalFrames()` in `Clean.tsx` produces the same final frame count
as FFmpeg's `xfade offset=cumDuration - td` chain: `sum(scene) - (n-1)*0.4`.

---

## Color / grading

| Desktop                                       | Remotion             | Status |
|-----------------------------------------------|----------------------|--------|
| `clean` style: no grading                     | No grading           | OK     |
| `vintage`: `noise=alls=25` (film grain only)  | Not implemented      | OUT OF SCOPE for spike |
| `colorMatch=subtle / strong` (curves + eq)    | Not implemented      | OUT OF SCOPE for spike |

For Phase 1, grading should be applied as a Remotion `<AbsoluteFill>` overlay
with `mix-blend-mode` or via an SVG `<feColorMatrix>` filter, NOT post-encode
— we want every pipeline stage to live inside React for live preview.

---

## Out of scope for Phase 0

- Fast Social vertical scroll mode (`renderScrollVideo`)
- Branded outro (`renderOutroScene`) — logo fade-in/out grid
- HEIC → JPEG conversion (desktop uses macOS `sips`; Lambda will need
  Sharp or a libheif wrapper, or we require callers to pre-convert)
- Audio (none in current desktop pipeline either)

All of the above need their own parity tables before Phase 1 ships.
