// cover-image.test.ts — offline proof of the cover resolution rules that the
// public hero and the private password gate both depend on. Run:
//   npx tsx tests/cover-image.test.ts
//
// Focus: BACKWARD COMPATIBILITY. Galleries created before the cover toggle
// have neither coverEnabled nor coverSource in delivery_settings and must keep
// their exact current behavior. Also proves the private-gate URL is small +
// disabled-aware, and that source inference is correct.

import { readCoverConfig, coverIsEnabled, gateCoverBackgroundUrl, coverPathBelongsToGallery } from '../src/lib/coverImage.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

const BUCKET = 'gallery-images'
const GALLERY_ASSET = 'eclipse/GID/originals/abc_photo.jpg'
const CUSTOM_COVER = 'eclipse/GID/covers/def_cover.jpg'

// ── Cover ownership guard (Set-as-cover security) ────────────────────────────
// A gallery photo's storage path always carries the gallery id as a segment:
//   {slug}/{galleryId}/{originals|web|thumbs}/{hash}_{name}
// so a foreign gallery/business image is rejected before it can become a cover.
{
  ok('own gallery photo passes the ownership guard',
    coverPathBelongsToGallery('eclipse/GID/originals/abc_photo.jpg', 'GID') === true)
  ok('own custom cover passes the ownership guard',
    coverPathBelongsToGallery('eclipse/GID/covers/def_cover.jpg', 'GID') === true)
  ok('foreign-gallery image is rejected',
    coverPathBelongsToGallery('eclipse/OTHER_GID/originals/abc.jpg', 'GID') === false)
  ok('foreign-business image is rejected',
    coverPathBelongsToGallery('other-biz/OTHER_GID/originals/abc.jpg', 'GID') === false)
  ok('empty path is rejected', coverPathBelongsToGallery('', 'GID') === false)
  ok('null path is rejected', coverPathBelongsToGallery(null, 'GID') === false)
  ok('missing gallery id is rejected',
    coverPathBelongsToGallery('eclipse/GID/originals/abc.jpg', '') === false)
  ok('gallery id as filename substring (not a segment) is rejected',
    coverPathBelongsToGallery('eclipse/OTHER/originals/GID.jpg', 'GID') === false)
}

// ── Backward compat: legacy galleries (no coverEnabled / coverSource) ────────
{
  const legacyNone = readCoverConfig({})
  ok('legacy empty → disabled', legacyNone.enabled === false, JSON.stringify(legacyNone))
  ok('legacy empty → source none', legacyNone.source === 'none')

  const legacyWithCover = readCoverConfig({ coverImagePath: GALLERY_ASSET, coverImageUrl: 'https://x/y.jpg' })
  ok('legacy w/ chosen cover → enabled (keeps current look)', legacyWithCover.enabled === true)
  ok('legacy path (not covers/) → inferred gallery_asset', legacyWithCover.source === 'gallery_asset')

  const legacyCustom = readCoverConfig({ coverImagePath: CUSTOM_COVER })
  ok('legacy covers/ path → inferred custom_upload', legacyCustom.source === 'custom_upload')
}

// ── Explicit toggle overrides ────────────────────────────────────────────────
{
  const offRaw = { coverEnabled: false, coverImagePath: GALLERY_ASSET, coverSource: 'gallery_asset' }
  const off = readCoverConfig(offRaw)
  ok('coverEnabled:false → disabled even with a path', off.enabled === false)

  const onRaw = { coverEnabled: true, coverSource: 'custom_upload', coverImagePath: CUSTOM_COVER }
  const on = readCoverConfig(onRaw)
  ok('coverEnabled:true → enabled', on.enabled === true)
  ok('explicit coverSource respected', on.source === 'custom_upload')

  ok('coverIsEnabled matches readCoverConfig', coverIsEnabled(onRaw) === true && coverIsEnabled(offRaw) === false)
}

// ── Private gate background URL ───────────────────────────────────────────────
{
  const disabledUrl = gateCoverBackgroundUrl({ coverEnabled: false, coverImagePath: GALLERY_ASSET }, BUCKET)
  ok('gate url null when cover disabled', disabledUrl === null, String(disabledUrl))

  const url = gateCoverBackgroundUrl({ coverEnabled: true, coverSource: 'gallery_asset', coverImagePath: GALLERY_ASSET }, BUCKET)
  ok('gate url is a render/image transform', !!url && url.includes('/render/image/public/'), String(url))
  ok('gate url is small width (privacy + mobile perf)', !!url && /width=900\b/.test(url), String(url))
  ok('gate url is low quality', !!url && /quality=45\b/.test(url), String(url))
  ok('gate url targets the cover path', !!url && url.includes(encodeURI(GALLERY_ASSET)) || (!!url && url.includes(GALLERY_ASSET)), String(url))

  const extUrl = gateCoverBackgroundUrl({ coverEnabled: true, coverImageUrl: 'https://cdn.example/cover.jpg' }, BUCKET)
  ok('gate url falls back to absolute url when no path', extUrl === 'https://cdn.example/cover.jpg', String(extUrl))

  const noneUrl = gateCoverBackgroundUrl({ coverEnabled: true }, BUCKET)
  ok('gate url null when enabled but nothing to show', noneUrl === null, String(noneUrl))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
