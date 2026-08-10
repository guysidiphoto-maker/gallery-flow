// upload-packs.mjs — upload the 3 realistic packs to qa2 gallery-images storage
// (via the synthetic owner JWT + temp policy) and emit seed rows for reseeding.
import { readFileSync } from "node:fs";
import path from "node:path";

const SB = "https://icxitoczqtcgdkwiaxxc.supabase.co";
const ANON = process.env.QA_ANON;
const PW = process.env.QA_PW;
const EMAIL = "studioa.owner@example.com";
const GAL = {
  wedding: "dddddddd-0000-0000-0000-000000000001",
  corporate: "dddddddd-0000-0000-0000-000000000002",
  nightlife: "dddddddd-0000-0000-0000-000000000003",
};

const token = await (async () => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("auth failed: " + JSON.stringify(j));
  return j.access_token;
})();

const manifest = JSON.parse(readFileSync("/tmp/packs/manifest.json", "utf8"));
const seed = {};
for (const [pack, rows] of Object.entries(manifest)) {
  const gid = GAL[pack];
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const file = readFileSync(path.join(`/tmp/packs/${pack}`, row.name));
    const storagePath = `qa-studio-a/${gid}/web/pack-${String(i).padStart(2, "0")}.jpg`;
    const r = await fetch(`${SB}/storage/v1/object/gallery-images/${storagePath}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
      body: file,
    });
    if (!r.ok) { console.log(`  FAIL ${pack} ${row.name}: ${r.status} ${await r.text()}`); continue; }
    out.push({ web_preview_path: storagePath, width: row.width, height: row.height, is_top_pick: row.is_top_pick, sort_order: i, filename: `pack-${String(i).padStart(2, "0")}.jpg` });
  }
  seed[gid] = out;
  console.log(`${pack} -> ${gid}: uploaded ${out.length}/${rows.length}`);
}
const { writeFileSync } = await import("node:fs");
writeFileSync("/tmp/packs/seed-rows.json", JSON.stringify(seed, null, 2));
console.log("seed rows -> /tmp/packs/seed-rows.json");
