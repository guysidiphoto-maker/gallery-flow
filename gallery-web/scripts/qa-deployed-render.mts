// qa-deployed-render.mts — drive the DEPLOYED isolated-QA render exactly as the
// editor does: build a ScenePlan with the real planner, optionally edit it, POST
// it to /api/stories/render (through the Vercel share-cookie bypass + synthetic
// owner JWT), and print the result. Synthetic data only.
//
//   node --experimental-strip-types scripts/qa-deployed-render.mts <jobKey>
// jobKey ∈ wedding-auto | wedding-edit | corporate-auto | corporate-edit | concert-auto | concert-edit
import { planStory, type PlannerImage } from "../src/lib/storyStudio/planner.ts";
import { computeTotalDuration, type ScenePlan } from "../src/lib/storyStudio/sceneplan.ts";

const BASE = process.env.QA_BASE!;
const SHARE = process.env.QA_SHARE!;
const SB = "https://icxitoczqtcgdkwiaxxc.supabase.co";
const ANON = process.env.QA_ANON!;
const EMAIL = "studioa.owner@example.com";
const PASSWORD = process.env.QA_PW!;

const BRAND = {
  accentHex: "#A67C52",
  headingFont: "Playfair Display, Georgia, serif",
  bodyFont: "Inter, sans-serif",
  studioName: "QA Studio A",
  logoUrl: null,
  watermark: { enabled: true, opacityPercent: 18, position: "bottom-right" },
};

const GALLERIES: Record<string, { id: string; template: any; event: any }> = {
  wedding: { id: "dddddddd-0000-0000-0000-000000000001", template: "editorial-clean", event: { title: "Dana & Tom", date: "1 Jun 2026", location: "Tel Aviv" } },
  corporate: { id: "dddddddd-0000-0000-0000-000000000002", template: "cinematic-energy", event: { title: "Company Summit 2026", date: "15 May 2026", location: "Herzliya" } },
  concert: { id: "dddddddd-0000-0000-0000-000000000003", template: "fast-highlights", event: { title: "Live in Concert", date: "20 Jul 2026", location: "Caesarea" } },
};

async function establishBypass(): Promise<string> {
  const r = await fetch(`${BASE}/?_vercel_share=${SHARE}`, { redirect: "manual" });
  const cookies = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
  if (!cookies.length) throw new Error("no bypass cookie set from share url");
  return cookies.join("; ");
}

async function getToken(): Promise<string> {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`token failed: ${r.status} ${JSON.stringify(j)}`);
  return j.access_token as string;
}

async function fetchImages(gid: string, token: string): Promise<PlannerImage[]> {
  const url = `${SB}/rest/v1/images?gallery_id=eq.${gid}&select=id,width,height,is_top_pick,sort_order&order=sort_order.asc`;
  const r = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  const rows = await r.json();
  if (!r.ok || !Array.isArray(rows)) throw new Error(`images fetch failed: ${r.status} ${JSON.stringify(rows)}`);
  return rows.map((x: any) => ({ id: x.id, width: x.width, height: x.height, isTopPick: x.is_top_pick, sortOrder: x.sort_order }));
}

// Deterministic edits that MUST change the exported MP4 (reorder + duration +
// transition + caption + focal). Proves preview==export and that edits render.
function applyEdits(plan: ScenePlan): ScenePlan {
  const scenes = plan.scenes.map((s) => ({ ...s }));
  if (scenes.length >= 3) { const t = scenes[1]; scenes[1] = scenes[2]; scenes[2] = t; } // reorder
  scenes[0].durationSec = 4.5;                                   // duration change
  scenes[0].focal = { x: 0.3, y: 0.35 };                        // crop/focus change
  scenes[1].transitionIn = "whip"; scenes[1].transitionDurationSec = 0.16; // transition change
  scenes[2].text = { content: "EDITED CUT", position: "center" }; // caption (ASCII, safe)
  return { ...plan, scenes, generatedBy: "manual" };
}

async function main() {
  const jobKey = process.argv[2];
  const [galleryKey, mode] = jobKey.split("-");
  const g = GALLERIES[galleryKey];
  if (!g) throw new Error(`unknown job ${jobKey}`);

  const cookie = await establishBypass();
  const token = await getToken();
  const imgs = await fetchImages(g.id, token);
  let plan = planStory(imgs, { galleryId: g.id, template: g.template, brand: BRAND, event: g.event });
  if (mode === "edit") plan = applyEdits(plan);

  const planned = { scenes: plan.scenes.length, seconds: computeTotalDuration(plan), template: plan.template };
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/stories/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Cookie: cookie },
    body: JSON.stringify({ galleryId: g.id, scenePlan: plan }),
  });
  const wall = Math.round((Date.now() - t0) / 1000);
  const j = await r.json().catch(() => ({}));
  console.log(JSON.stringify({ jobKey, planned, http: r.status, wallSeconds: wall, result: j }, null, 2));
}
main().catch((e) => { console.error("FATAL", e?.message || e); process.exit(1); });
