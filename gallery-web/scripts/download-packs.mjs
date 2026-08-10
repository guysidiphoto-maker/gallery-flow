// download-packs.mjs — fetch three DISTINCT packs of real, openly-licensed
// photography (Lorem Picsum serves Unsplash images; Unsplash License permits
// free commercial use, no attribution required). People + orientation variety.
// Writes to /tmp/packs/<pack>/NN.jpg and prints a manifest.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

// Curated Picsum IDs biased toward people/scenes, distinct per pack. Over-
// provisioned: we keep the first N that download OK (some ids 404).
const PACKS = {
  wedding: [1005, 1027, 342, 349, 431, 129, 145, 203, 219, 235, 250, 64, 91, 177, 1010, 1062, 447, 306, 338, 823],
  corporate: [1011, 1012, 20, 26, 27, 60, 96, 100, 160, 180, 201, 225, 366, 435, 469, 494, 3, 48, 180, 660],
  nightlife: [65, 66, 68, 119, 152, 200, 315, 319, 334, 351, 357, 399, 453, 513, 669, 628, 111, 249, 452, 456],
};
const PER_PACK = 15;

async function fetchImg(id, w, h) {
  const url = `https://picsum.photos/id/${id}/${w}/${h}`;
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) return null; // guard against tiny/error payloads
  return buf;
}

const manifest = {};
for (const [pack, ids] of Object.entries(PACKS)) {
  const dir = `/tmp/packs/${pack}`;
  mkdirSync(dir, { recursive: true });
  const rows = [];
  let n = 0;
  for (let k = 0; k < ids.length && n < PER_PACK; k++) {
    const id = ids[k];
    // Alternate orientation for variety: even = landscape, odd = portrait.
    const landscape = n % 3 === 0; // ~1/3 landscape
    const w = landscape ? 1800 : 1200;
    const h = landscape ? 1200 : 1800;
    const buf = await fetchImg(id, w, h);
    if (!buf) { console.log(`  skip id ${id} (unavailable)`); continue; }
    const name = `${String(n).padStart(2, "0")}.jpg`;
    writeFileSync(path.join(dir, name), buf);
    // Mark a few as top picks (strong openers/closers).
    rows.push({ name, width: w, height: h, is_top_pick: [0, 4, 9, 13].includes(n), bytes: buf.length });
    n++;
  }
  manifest[pack] = rows;
  console.log(`${pack}: ${rows.length} images`);
}
writeFileSync("/tmp/packs/manifest.json", JSON.stringify(manifest, null, 2));
console.log("manifest -> /tmp/packs/manifest.json");
