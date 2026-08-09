#!/usr/bin/env node
/**
 * bundle-stories.mjs — produce a single Remotion site bundle at build time
 * (NOT per request).
 *
 * Why bundle ahead-of-time:
 *   Calling @remotion/bundler from inside the Vercel Function on every render
 *   adds ~5-8s of cold-start work, requires the webpack toolchain to ship in
 *   the function bundle (would blow past the 250MB unzipped limit), and ties
 *   the function's memory ceiling to webpack instead of Chromium.
 *
 *   Bundling at build time:
 *     1. Runs once per deploy on Vercel's build container (no size limit there)
 *     2. Emits a self-contained static site into public/stories-bundle
 *     3. The static bundle is served from the same Vercel deployment, so the
 *        render function points renderMedia at `${VERCEL_URL}/stories-bundle/`
 *        as its serveUrl — Chromium loads it like any other web page.
 *
 * Output layout:
 *   gallery-web/public/stories-bundle/
 *     ├── index.html
 *     ├── bundle.js
 *     ├── ... (chunked assets)
 *
 * Wired as `prebuild` in package.json so `npm run build` (and Vercel's default
 * build) trigger this automatically. Idempotent — safe to re-run locally.
 */

import { bundle } from '@remotion/bundler';
import { existsSync, rmSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Recursively delete *.map files — Remotion's default webpack config still emits
// source maps, which have zero runtime value but ship into the Vercel function
// bundle via includeFiles (~9MB). Strip them post-bundle to keep the function small.
function stripSourceMaps(dir) {
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) removed += stripSourceMaps(full);
    else if (name.endsWith('.map')) { unlinkSync(full); removed += 1; }
  }
  return removed;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo layout:
//   gallery-web/scripts/bundle-stories.mjs       ← THIS FILE
//   gallery-web/stories-remotion/src/Root.tsx    ← Remotion entry
//   gallery-web/public/stories-bundle/           ← bundle target
const webRoot = path.resolve(__dirname, '..');
const entryPoint = path.resolve(webRoot, 'stories-remotion', 'src', 'Root.tsx');
const outDir = path.resolve(webRoot, 'public', 'stories-bundle');

if (!existsSync(entryPoint)) {
  console.error(`[bundle-stories] entry point missing: ${entryPoint}`);
  process.exit(1);
}

// Clear any previous bundle so stale chunks from a dropped composition don't
// leak through. The folder is recreated below.
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(`[bundle-stories] entry:  ${entryPoint}`);
console.log(`[bundle-stories] output: ${outDir}`);

const t0 = Date.now();

try {
  await bundle({
    entryPoint,
    outDir,
    // Production bundle: no source maps, no dev server.
    // Returning the config unchanged keeps Remotion's defaults — which already
    // handle JSX, TS, and image inlining for the composition's local assets.
    webpackOverride: (cfg) => cfg,
    onProgress: (progress) => {
      process.stdout.write(`\r[bundle-stories] bundling ${progress}%   `);
    },
  });
  process.stdout.write('\n');
  const mapsRemoved = stripSourceMaps(outDir);
  console.log(
    `[bundle-stories] done in ${((Date.now() - t0) / 1000).toFixed(1)}s (stripped ${mapsRemoved} source map(s))`,
  );
} catch (err) {
  process.stdout.write('\n');
  console.error('[bundle-stories] FAILED:', err);
  process.exit(1);
}
