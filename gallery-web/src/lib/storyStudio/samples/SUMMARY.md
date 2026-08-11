# Story Studio — Auto-Plan Sample Results

Generated deterministically from synthetic fixtures. Regenerate with `node --experimental-strip-types generateSamples.ts`.

## Corporate event (landscape-heavy, AI-scored)
- valid: **true** 
- scenes: 20 · duration: 41.83s
- orientation mix: {"landscape":14,"portrait":6}
- distinct motions used: push-in, focus-zoom, pan, pull-out (static holds: 0)
- edge-face safe fits (blurred bg): 0
- opener: corp-0011-ab — opening(strongest) orient:landscape focal:ai-focal toppick motion:push-in

## Wedding (portrait-heavy, bursts, edge faces)
- valid: **true** 
- scenes: 40 · duration: 77.84s
- orientation mix: {"portrait":31,"landscape":9}
- distinct motions used: push-in, none, pull-out (static holds: 20)
- edge-face safe fits (blurred bg): 3
- opener: wed-0002-abc — opening(strongest) orient:portrait focal:face-centroid toppick motion:push-in

## Concert (no AI metadata — structural fallback)
- valid: **true** 
- scenes: 10 · duration: 22.84s
- orientation mix: {"landscape":7,"portrait":3}
- distinct motions used: push-in, focus-zoom, none (static holds: 2)
- edge-face safe fits (blurred bg): 0
- opener: gig-0001-abc — opening(strongest) orient:landscape focal:center toppick motion:push-in
