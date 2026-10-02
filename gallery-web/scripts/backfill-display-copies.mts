// backfill-display-copies.mts — give originals-only images their stored 2048px web
// and 640px thumb copies (same scheme as the browser upload pipeline), so the
// viewer stops paying a Supabase image transform per photo per billing cycle.
// Originals are never modified or deleted. Dry run unless --apply.
//
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-display-copies.mts [--apply] [--gallery <id>] [--limit <n>]
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY is required'); process.exit(1) }

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const APPLY = args.includes('--apply')
const GALLERY = flag('--gallery')
const LIMIT = Number(flag('--limit') ?? Infinity)

// Must match src/features/dashboard/lib/displayCopySizes.ts.
const WEB = { width: 2048, quality: 82 }
const THUMB = { width: 640, quality: 78 }
const BUCKET = 'gallery-images'
const PAGE = 200
const CONCURRENCY = 4
const ONE_YEAR_CACHE = '31536000'

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Same as uploadPipeline.sanitizeFilename, so backfilled and fresh copies share one naming scheme.
function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '')
    || `img_${Date.now()}`
}

/** `{slug}/{gid}/originals/{hash}_{name}` → the matching web/thumbs keys. */
function copyPaths(origPath: string): { webPath: string; thumbPath: string } | null {
  const m = origPath.match(/^(.+)\/originals\/([0-9a-f]{8})_(.+)$/i)
  if (!m) return null
  const [, prefix, hash, name] = m
  const file = `${hash}_${sanitizeFilename(name).replace(/\.[^.]*$/, '')}.jpg`
  return { webPath: `${prefix}/web/${file}`, thumbPath: `${prefix}/thumbs/${file}` }
}

async function upload(path: string, body: Buffer) {
  const { error } = await sb.storage.from(BUCKET).upload(path, body, {
    upsert: true, contentType: 'image/jpeg', cacheControl: ONE_YEAR_CACHE,
  })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
}

interface Row { id: string; original_path: string | null; web_preview_path: string }

async function processRow(row: Row): Promise<'done' | 'skipped' | 'would'> {
  const orig = row.original_path || row.web_preview_path
  const paths = copyPaths(orig)
  if (!paths) return 'skipped'
  if (!APPLY) return 'would'

  const { data, error } = await sb.storage.from(BUCKET).download(orig)
  if (error || !data) throw new Error(`download ${orig}: ${error?.message ?? 'no data'}`)
  const src = Buffer.from(await data.arrayBuffer())
  // rotate() bakes EXIF orientation in, like createImageBitmap does in the browser.
  const web = await sharp(src).rotate().resize({ width: WEB.width, withoutEnlargement: true })
    .flatten({ background: '#fff' }).jpeg({ quality: WEB.quality, mozjpeg: true }).toBuffer()
  const thumb = await sharp(web).resize({ width: THUMB.width, withoutEnlargement: true })
    .jpeg({ quality: THUMB.quality, mozjpeg: true }).toBuffer()
  await upload(paths.webPath, web)
  await upload(paths.thumbPath, thumb)

  // Guarded on the old path so a photo replaced mid-run isn't overwritten.
  const { error: upErr } = await sb.from('images')
    .update({ web_preview_path: paths.webPath, thumbnail_path: paths.thumbPath })
    .eq('id', row.id)
    .eq('web_preview_path', row.web_preview_path)
  if (upErr) throw new Error(`update ${row.id}: ${upErr.message}`)
  return 'done'
}

async function main() {
  console.log(APPLY ? 'APPLY mode — writing copies + updating rows' : 'DRY RUN — pass --apply to write')
  const counts = { done: 0, would: 0, skipped: 0, failed: 0 }
  let cursor = ''
  let seen = 0

  while (seen < LIMIT) {
    let q = sb.from('images')
      .select('id, original_path, web_preview_path, galleries!inner(demo_expires_at)')
      .like('web_preview_path', '%/originals/%')
      .is('galleries.demo_expires_at', null)
      .gt('id', cursor)
      .order('id')
      .limit(Math.min(PAGE, LIMIT - seen))
    if (GALLERY) q = q.eq('gallery_id', GALLERY)
    const { data, error } = await q
    if (error) throw new Error(`query: ${error.message}`)
    const rows = (data ?? []) as unknown as Row[]
    if (rows.length === 0) break
    cursor = rows[rows.length - 1].id
    seen += rows.length

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(async row => {
        try { counts[await processRow(row)]++ }
        catch (e) { counts.failed++; console.warn(`  FAIL ${row.id}:`, e instanceof Error ? e.message : e) }
      }))
    }
    console.log(`  ${seen} scanned — ${JSON.stringify(counts)}`)
  }
  console.log('finished:', counts)
}

main().catch(e => { console.error(e); process.exit(1) })
