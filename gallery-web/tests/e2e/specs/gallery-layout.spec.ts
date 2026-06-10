import { test, expect, type Page } from '@playwright/test'
import { E2E_PUBLIC_GALLERY_URL, requirePublicGallery } from '../fixtures/gallery'

/**
 * Desktop gallery layout + scroll regression suite.
 *
 * Guards two bugs that shipped when the public masonry used a react-window
 * `VariableSizeList` for galleries over ~300 photos:
 *
 *   1. Nested scroll trap — the list owned its own `overflow:auto` viewport
 *      (~85vh). On desktop it stole the wheel from the document, so the page
 *      felt "stuck" until the cursor was over the photos and then an inner
 *      box scrolled under the page. The document must be the ONLY vertical
 *      scroll owner.
 *
 *   2. Black holes on portrait images — each virtualized row was clipped to
 *      its tallest tile's height. Mixed portrait/landscape rows reserved more
 *      height than they filled, leaving the black page background showing
 *      through. The masonry must pack columns with no large vertical gaps.
 *
 * Operator: point `E2E_PUBLIC_GALLERY_URL` at a published gallery that mixes
 * portrait + landscape photos and has enough images to fill more than one
 * screen (the old bug only appeared past the virtualization threshold).
 * Skips when the env var is unset, matching the rest of the suite.
 */

// The welcome screen gates the grid behind a "View Gallery" button. Click it
// if present so the masonry actually mounts; no-op when the gallery opens
// straight onto the grid.
async function enterGallery(page: Page): Promise<void> {
  const enter = page.getByRole('button', { name: /view gallery|צפה בגלריה/i }).first()
  const firstTile = page.locator('.grid-item').first()

  // The welcome CTA (and the grid behind it) mount after the data fetch, which
  // can land well after `load`. Wait until either the gate or the grid is on
  // screen before deciding whether a click is needed.
  await Promise.race([
    enter.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
    firstTile.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
  ])
  if (await enter.isVisible().catch(() => false)) {
    await enter.click() // dismisses the welcome screen (≈600ms fade) → grid mounts
  }

  // Wait for at least a few tiles to mount before measuring.
  await expect.poll(async () => page.locator('.grid-item').count(), {
    timeout: 20_000,
    message: 'masonry should mount at least 8 photo tiles',
  }).toBeGreaterThanOrEqual(8)
}

test.describe('public gallery — desktop layout & scroll', () => {
  test('document is the only vertical scroll owner (no inner scroll trap)', async ({ page }) => {
    requirePublicGallery()
    await page.setViewportSize({ width: 1440, height: 900 })

    const response = await page.goto(E2E_PUBLIC_GALLERY_URL)
    expect(response?.ok(), `viewer responded ok (got ${response?.status()})`).toBe(true)
    await enterGallery(page)

    // The page must be taller than the viewport, otherwise the scroll
    // assertion below is vacuous (nothing to scroll).
    const pageScrollable = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement
      return el.scrollHeight - el.clientHeight
    })
    expect(pageScrollable, 'document should overflow the viewport').toBeGreaterThan(200)

    // Wheel over the centre of the viewport — i.e. over the photo grid, the
    // exact spot where the old inner container used to capture the wheel.
    const before = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop)
    await page.mouse.move(720, 450)
    await page.mouse.wheel(0, 1400)
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop)

    expect(after, 'wheeling over the gallery must scroll the document').toBeGreaterThan(before + 100)

    // No descendant of the gallery may be its own vertical scroll container.
    // Signature of the old VariableSizeList trap: an element shorter than the
    // viewport, with overflow-y auto/scroll, whose content overflows it.
    const innerScrollers = await page.evaluate(() => {
      const vh = window.innerHeight
      const offenders: string[] = []
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const s = getComputedStyle(el)
        const oy = s.overflowY
        if (oy !== 'auto' && oy !== 'scroll') continue
        const verticallyScrollable = el.scrollHeight - el.clientHeight > 50
        const shorterThanViewport = el.clientHeight > 100 && el.clientHeight < vh * 0.95
        if (verticallyScrollable && shorterThanViewport) {
          offenders.push(`${el.tagName.toLowerCase()}.${el.className || '(no-class)'} h=${el.clientHeight}`)
        }
      }
      return offenders
    })
    expect(innerScrollers, `unexpected inner vertical scroll container(s): ${innerScrollers.join(', ')}`).toEqual([])
  })

  test('mixed portrait/landscape masonry has no black holes and valid tile sizes', async ({ page }) => {
    requirePublicGallery()
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.goto(E2E_PUBLIC_GALLERY_URL)
    await enterGallery(page)

    // Nudge a couple of lazy batches in, then let the network settle so the
    // measured tiles have real images decoded.
    await page.mouse.move(720, 450)
    await page.mouse.wheel(0, 1600)
    await page.waitForTimeout(400)
    await page.waitForLoadState('networkidle').catch(() => {})

    const report = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll<HTMLElement>('.grid-item')).map((el) => {
        const r = el.getBoundingClientRect()
        const img = el.querySelector('img')
        return {
          x: Math.round(r.left),
          top: r.top + window.scrollY,
          bottom: r.bottom + window.scrollY,
          w: r.width,
          h: r.height,
          loaded: !!img && img.complete && img.naturalWidth > 0,
          nw: img?.naturalWidth ?? 0,
          nh: img?.naturalHeight ?? 0,
        }
      })

      // Collapsed / zero-size tiles — a broken layout symptom.
      const zeroSize = tiles.filter((t) => t.w < 2 || t.h < 2).length

      // Loaded tiles must carry valid intrinsic dimensions (portrait or
      // landscape), otherwise the grid can't size them and reserves a wrong,
      // image-less box → black rectangle.
      const loaded = tiles.filter((t) => t.loaded)
      const invalidDims = loaded.filter((t) => t.nw <= 0 || t.nh <= 0).length
      const portrait = loaded.filter((t) => t.nh > t.nw).length
      const landscape = loaded.filter((t) => t.nw > t.nh).length

      // Largest vertical gap between two vertically-adjacent tiles in the same
      // column. A black hole shows up here as a gap of hundreds of px; the
      // design gap is 0–10px. Cluster tiles into columns by their left edge.
      const cols = new Map<number, Array<{ top: number; bottom: number }>>()
      for (const t of tiles) {
        if (t.w < 2) continue
        let key = -1
        for (const k of cols.keys()) {
          if (Math.abs(k - t.x) <= 12) { key = k; break }
        }
        if (key === -1) key = t.x
        const arr = cols.get(key) ?? []
        arr.push({ top: t.top, bottom: t.bottom })
        cols.set(key, arr)
      }
      let maxGap = 0
      for (const arr of cols.values()) {
        arr.sort((a, b) => a.top - b.top)
        for (let i = 1; i < arr.length; i++) {
          maxGap = Math.max(maxGap, arr[i].top - arr[i - 1].bottom)
        }
      }

      return { count: tiles.length, zeroSize, invalidDims, portrait, landscape, maxGap, columns: cols.size }
    })

    expect(report.count, 'masonry should render tiles').toBeGreaterThanOrEqual(8)
    expect(report.zeroSize, 'no collapsed/zero-size tiles').toBe(0)
    expect(report.invalidDims, 'every loaded tile has valid intrinsic dimensions').toBe(0)

    // The inter-tile gap should stay close to the design spacing (≤10px).
    // Anything in the hundreds is the portrait black-hole regression. 60px
    // tolerance absorbs sub-pixel rounding and a half-loaded trailing row.
    expect(report.maxGap, `largest vertical gap between stacked tiles (${report.maxGap}px) — black-hole guard`).toBeLessThan(60)

    // Sanity: the operator's gallery is supposed to mix orientations, so the
    // black-hole guard above is actually exercising portrait tiles. Soft-warn
    // via annotation rather than failing if the chosen gallery is uniform.
    if (report.portrait === 0 || report.landscape === 0) {
      test.info().annotations.push({
        type: 'warning',
        description: `gallery is not mixed-orientation (portrait=${report.portrait}, landscape=${report.landscape}); black-hole guard is weaker`,
      })
    }
  })
})
