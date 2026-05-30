/**
 * render-local.ts — one-shot local renderer for the spike's quality A/B.
 *
 * Usage:
 *   npm run render:gallery -- --gallery-id=<uuid> --slug=<slug> [--duration=30]
 *   npm run render:gallery -- --image-dir=./fixtures/sample-gallery [--duration=30]
 *
 * Modes:
 *   - --gallery-id + --slug : fetch images from Supabase, render, upload mp4 back.
 *   - --image-dir           : render local jpegs, write mp4 to ./out (no upload).
 *
 * Idempotent: writes/overwrites a single object at
 *   galleries/{slug}/{galleryId}/story_clean.mp4
 *
 * Requires (only for the Supabase mode):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * This is spike-quality: minimal error handling, console logging, best-effort
 * cleanup of temp dirs.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { buildScenes, type ImageDims, type SceneSpec } from './Clean.js';

const execFileAsync = promisify(execFile);

// ── CLI args ────────────────────────────────────────────────────────────────

interface Args {
  galleryId?: string;
  slug?: string;
  imageDir?: string;
  duration: number;
  out?: string;
}

function parseArgs(): Args {
  const args: Args = { duration: 30 };
  for (const raw of process.argv.slice(2)) {
    const [key, ...rest] = raw.replace(/^--/, '').split('=');
    const val = rest.join('=');
    switch (key) {
      case 'gallery-id':
        args.galleryId = val;
        break;
      case 'slug':
        args.slug = val;
        break;
      case 'image-dir':
        args.imageDir = val;
        break;
      case 'duration':
        args.duration = parseFloat(val) || 30;
        break;
      case 'out':
        args.out = val;
        break;
    }
  }
  return args;
}

// ── Image probing: shell out to `sips` on macOS, `identify` elsewhere ──────

async function probeDims(file: string): Promise<{ width: number; height: number }> {
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('sips', [
      '-g',
      'pixelWidth',
      '-g',
      'pixelHeight',
      file,
    ]);
    const w = stdout.match(/pixelWidth:\s*(\d+)/);
    const h = stdout.match(/pixelHeight:\s*(\d+)/);
    if (!w || !h) throw new Error(`sips: cannot read dims for ${file}`);
    return { width: parseInt(w[1]!), height: parseInt(h[1]!) };
  }
  // Fallback: ImageMagick `identify -format "%w %h"`.
  const { stdout } = await execFileAsync('identify', ['-format', '%w %h', file]);
  const [w, h] = stdout.trim().split(/\s+/).map(Number);
  if (!w || !h) throw new Error(`identify: cannot read dims for ${file}`);
  return { width: w, height: h };
}

// ── Supabase mode: fetch gallery image list ────────────────────────────────

async function fetchGalleryImages(
  galleryId: string,
  slug: string,
  workDir: string,
): Promise<ImageDims[]> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Pull image paths from the `images` table for this gallery, ordered by sort.
  const { data, error } = await sb
    .from('images')
    .select('storage_path')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
    .limit(40);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`No images for gallery ${galleryId}`);
  }

  const out: ImageDims[] = [];
  for (const row of data) {
    const storagePath = (row as { storage_path: string }).storage_path;
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/galleries/${storagePath}`;
    // Download to temp dir so Remotion can read it as a file:// URL — much
    // faster + more reliable than streaming over HTTPS during render.
    const localName = `${out.length.toString().padStart(3, '0')}_${path.basename(storagePath)}`;
    const localPath = path.join(workDir, localName);
    const resp = await fetch(publicUrl);
    if (!resp.ok) throw new Error(`Fetch ${publicUrl} → ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(localPath, buf);
    const dims = await probeDims(localPath);
    out.push({ url: `file://${localPath}`, ...dims });
    console.log(`  downloaded ${storagePath} (${dims.width}x${dims.height})`);
  }
  return out;
}

// ── Local-dir mode: scan a folder of jpegs ─────────────────────────────────

async function loadLocalImages(dir: string): Promise<ImageDims[]> {
  const entries = await fs.readdir(dir);
  const files = entries
    .filter((n) => /\.(jpe?g|png)$/i.test(n))
    .sort()
    .map((n) => path.resolve(dir, n));
  if (files.length === 0) throw new Error(`No jpeg/png in ${dir}`);
  const out: ImageDims[] = [];
  for (const f of files) {
    const dims = await probeDims(f);
    out.push({ url: `file://${f}`, ...dims });
  }
  return out;
}

// ── Upload result back to Supabase ─────────────────────────────────────────

async function uploadResult(mp4Path: string, galleryId: string, slug: string): Promise<void> {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const destPath = `${slug}/${galleryId}/story_clean.mp4`;
  const buf = await fs.readFile(mp4Path);
  const { error } = await sb.storage.from('galleries').upload(destPath, buf, {
    contentType: 'video/mp4',
    cacheControl: 'public, max-age=31536000, immutable',
    upsert: true,
  });
  if (error) throw error;
  console.log(`uploaded → galleries/${destPath}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-remotion-'));
  console.log(`workdir: ${tmpDir}`);

  try {
    // 1. Gather image list + dimensions
    const imgs =
      args.imageDir != null
        ? await loadLocalImages(args.imageDir)
        : await fetchGalleryImages(args.galleryId!, args.slug!, tmpDir);

    console.log(`loaded ${imgs.length} images`);

    // 2. Build scenes on the host (mirrors desktop behavior)
    const scenes: SceneSpec[] = buildScenes(imgs, args.duration, 'subtle');
    console.log(`built ${scenes.length} scenes`);

    // 3. Bundle the Remotion project
    console.log('bundling Remotion...');
    const entryPoint = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'Root.tsx');
    const serveUrl = await bundle({
      entryPoint,
      // Production bundles only. Studio uses a dev server.
      webpackOverride: (cfg) => cfg,
    });
    console.log(`bundled → ${serveUrl}`);

    // 4. Select composition with our props
    const inputProps = {
      images: imgs.map((i) => i.url),
      scenes,
      durationSeconds: args.duration,
      motionMode: 'subtle' as const,
    };
    const composition = await selectComposition({
      serveUrl,
      id: 'Clean',
      inputProps,
    });
    console.log(`composition: ${composition.durationInFrames} frames @ ${composition.fps}fps`);

    // 5. Render
    const outPath = args.out
      ? path.resolve(args.out)
      : args.galleryId
        ? path.join(tmpDir, 'story_clean.mp4')
        : path.resolve('./out/clean.mp4');
    await fs.mkdir(path.dirname(outPath), { recursive: true });

    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      // Match desktop bitrate band (2.5 Mbit/s for scenes, ~4.5 for final).
      videoBitrate: '4500k',
      onProgress: ({ progress }) => {
        process.stdout.write(`\r  render ${(progress * 100).toFixed(1)}%   `);
      },
    });
    process.stdout.write('\n');
    console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outPath}`);

    // 6. Upload (Supabase mode only)
    if (args.galleryId && args.slug) {
      await uploadResult(outPath, args.galleryId, args.slug);
    }
  } finally {
    // Best-effort cleanup. Leave the workdir on failure for debugging.
    if (!process.env.KEEP_TMP) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
