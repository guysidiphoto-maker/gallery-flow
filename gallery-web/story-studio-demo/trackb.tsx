// Track B editor harness — loads the approved concert gallery (via the local
// manifest server) into the REAL StoryStudioEditor so a refined cut is produced
// through the actual UI controls. Exposes window.__getPlan() for extraction.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "../src/styles/index.css"; // the editor is styled with Tailwind utilities
import { StoryStudioEditor } from "../src/features/story-studio/StoryStudioEditor";
import type { PlannerImage } from "../src/features/story-studio/planner";
import type { ScenePlan } from "../src/features/story-studio/sceneplan";

function App() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  useEffect(() => {
    fetch("http://localhost:8802/manifest.json")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div style={{ color: "#fff", padding: 40 }}>manifest error: {err} (is the manifest server running on 8802?)</div>;
  if (!data) return <div style={{ color: "#fff", padding: 40 }}>loading concert gallery…</div>;
  const images: PlannerImage[] = data.images;
  return (
    <StoryStudioEditor
      images={images}
      brand={data.brand}
      event={data.event}
      galleryId="trackb-concert"
      initialPlan={data.plan as ScenePlan}
      onPlanChange={(p) => { (window as any).__plan = p; }}
      onSave={() => {}}
    />
  );
}
(window as any).__getPlan = () => JSON.stringify((window as any).__plan ?? null);
createRoot(document.getElementById("root")!).render(<App />);
