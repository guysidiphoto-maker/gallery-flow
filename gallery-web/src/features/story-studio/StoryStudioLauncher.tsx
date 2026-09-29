// StoryStudioLauncher.tsx — the REAL product surface (not the demo).
//
// Mounted from the photographer dashboard with real gallery images, the real
// resolved Brand Kit, and real event info. Responsibilities:
//   • restore the autosaved draft (leave & return),
//   • host the editor with debounced autosave,
//   • submit the edited ScenePlan to the render endpoint,
//   • surface render progress / success (download) / failure (retry).
//
// The Dashboard maps its gallery rows -> PlannerImage[] and resolves BrandResolved
// before rendering this; this component is UI-framework-agnostic beyond that.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryStudioEditor } from "./StoryStudioEditor";
import type { PlannerImage } from "./planner";
import type { BrandResolved, ScenePlan } from "./sceneplan";
import { checkRenderFeasibility, RENDER_MAX_SCENES, RENDER_MAX_DURATION_SEC } from "./sceneplan";
import {
  cancelRender,
  getRenderStatus,
  loadDraft,
  requestStudioRender,
  saveDraft,
} from "./storyStudioApi";

type RenderState = "idle" | "rendering" | "ready" | "failed";

export interface StoryStudioLauncherProps {
  galleryId: string;
  images: PlannerImage[];
  brand: BrandResolved;
  event?: { title?: string; date?: string; location?: string };
  /** Returns the current Supabase access token (session JWT). */
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

const C = { bg: "#0d0d10", panel: "#17171c", border: "#2a2a32", text: "#e9e9ee", muted: "#9a9aa6", accent: "#B45309" };

export const StoryStudioLauncher: React.FC<StoryStudioLauncherProps> = ({
  galleryId,
  images,
  brand,
  event,
  getToken,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  // "select" = pre-generation photo picker; "editor" = the storyboard editor.
  const [phase, setPhase] = useState<"select" | "editor">("select");
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [initialPlan, setInitialPlan] = useState<ScenePlan | null>(null);
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<ScenePlan | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const latestPlan = useRef<ScenePlan | null>(null);
  const cancelled = useRef(false);

  // Live render-feasibility (first-release scene/duration cap). Drives the UI
  // explanation + disables the render button so an unsupported render can never
  // be submitted. The server enforces the identical rule authoritatively.
  const capPlan = currentPlan ?? initialPlan;
  const feasibility = capPlan ? checkRenderFeasibility(capPlan) : { ok: true as const };

  // Restore the saved draft on open.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const draft = await loadDraft(galleryId, token);
          if (alive && draft.scenePlan) {
            // Resume an existing story straight into the editor.
            setInitialPlan(draft.scenePlan);
            setCurrentPlan(draft.scenePlan);
            setSelectedIds(draft.scenePlan.scenes.map((s) => s.imageId));
            setPhase("editor");
          }
        }
      } catch {
        // No draft or endpoint not live yet — start at photo selection.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      cancelled.current = true;
    };
  }, [galleryId, getToken]);

  const handleSave = useCallback(
    async (plan: ScenePlan) => {
      latestPlan.current = plan;
      setCurrentPlan(plan);
      // Let failures propagate so the editor shows an honest "save failed"
      // state instead of a misleading "saved". (A silently-swallowed error made
      // the UI claim work was safe when it wasn't.)
      const token = await getToken();
      if (!token) throw new Error("not_authenticated");
      await saveDraft(galleryId, plan, token);
    },
    [galleryId, getToken]
  );

  const handleRender = useCallback(async () => {
    const plan = latestPlan.current ?? initialPlan;
    if (!plan) return;
    // Client-side gate (server enforces the same). Never submit an over-cap plan.
    const feas = checkRenderFeasibility(plan);
    if (!feas.ok) {
      setErrorMsg(feas.reason ?? "הסטורי ארוך מדי");
      setRenderState("failed");
      return;
    }
    setRenderState("rendering");
    setErrorMsg(null);
    setOutputUrl(null);
    setPosterUrl(null);
    setRenderId(null);
    cancelled.current = false;
    try {
      const token = await getToken();
      if (!token) throw new Error("לא מחוברים");
      const start = await requestStudioRender(galleryId, plan, token);
      if (!start.ok) {
        // Prefer the server's human message (e.g. the too-long explanation).
        const msg =
          start.message ||
          (start.error === "invalid_scene_plan"
            ? "התוכנית לא עברה אימות"
            : start.error === "story_too_long"
              ? "הסטורי ארוך מדי להפקה"
              : start.error || "שגיאת רינדור");
        throw new Error(msg);
      }
      if (start.renderId) setRenderId(start.renderId);
      // Synchronous render returns outputUrl directly; otherwise poll.
      if (start.outputUrl) {
        setOutputUrl(start.outputUrl);
        setPosterUrl(start.posterUrl ?? null);
        setRenderState("ready");
        return;
      }
      if (start.renderId) {
        for (let i = 0; i < 120 && !cancelled.current; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          const st = await getRenderStatus(start.renderId, token);
          if (st.status === "ready" || st.status === "completed") {
            setOutputUrl(st.outputUrl ?? null);
            setRenderState("ready");
            return;
          }
          if (st.status === "failed") throw new Error(st.error || "הרינדור נכשל");
        }
        if (!cancelled.current) throw new Error("הרינדור לקח יותר מדי זמן");
      }
    } catch (e) {
      if (!cancelled.current) {
        setErrorMsg(e instanceof Error ? e.message : "שגיאה");
        setRenderState("failed");
      }
    }
  }, [galleryId, getToken, initialPlan]);

  // Cooperative cancel: stop polling immediately AND tell the server to abandon
  // the in-flight render (it discards its artifacts and releases the lock).
  const handleCancel = useCallback(async () => {
    cancelled.current = true;
    setRenderState("idle");
    try {
      const token = await getToken();
      if (token) await cancelRender(galleryId, token, renderId ?? undefined);
    } catch {
      // Best-effort — the client has already stopped polling regardless.
    }
  }, [galleryId, getToken, renderId]);

  const editor = useMemo(
    () => (
      <StoryStudioEditor
        images={images}
        brand={brand}
        event={event}
        galleryId={galleryId}
        initialPlan={initialPlan}
        selectedIds={selectedIds}
        onSave={handleSave}
        onPlanChange={(p) => { latestPlan.current = p; setCurrentPlan(p); }}
      />
    ),
    [images, brand, event, galleryId, initialPlan, selectedIds, handleSave]
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: C.bg, display: "flex", flexDirection: "column" }} dir="rtl">
      {/* Launcher top bar (render + close) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: C.panel, borderBottom: `1px solid ${C.border}`, color: C.text }}>
        <button onClick={onClose} style={ghost}>✕ סגור</button>
        <div style={{ flex: 1 }} />
        {phase === "editor" ? (
          renderState === "ready" && outputUrl ? (
          <>
            {posterUrl ? (
              <img src={posterUrl} alt="" style={{ height: 34, width: 19, objectFit: "cover", borderRadius: 4, border: `1px solid ${C.border}` }} />
            ) : null}
            <span style={{ color: "#4ade80", fontSize: 13 }}>✓ הסרטון מוכן</span>
            <a href={outputUrl} download style={{ ...primary, textDecoration: "none" }}>⬇ הורד MP4</a>
            <button onClick={handleRender} style={ghost}>רנדר מחדש</button>
          </>
        ) : renderState === "failed" ? (
          <>
            <span style={{ color: "#f87171", fontSize: 13, maxWidth: 420, textAlign: "left" }}>{errorMsg}</span>
            <button onClick={handleRender} style={primary} disabled={!feasibility.ok}>נסה שוב</button>
          </>
        ) : renderState === "rendering" ? (
          <>
            <span style={{ color: C.muted, fontSize: 13 }}>מפיק סרטון… זה יכול לקחת עד דקה</span>
            <button onClick={handleCancel} style={ghost}>בטל</button>
          </>
        ) : (
          <>
            {!feasibility.ok ? (
              <span style={{ color: "#fbbf24", fontSize: 12, maxWidth: 460, textAlign: "left", lineHeight: 1.3 }}>
                כדי לשמור על איכות ומהירות, ההפקה מוגבלת כרגע ל־{RENDER_MAX_SCENES} תמונות / {RENDER_MAX_DURATION_SEC} שניות. הסירו כמה תמונות כדי להפיק.
              </span>
            ) : (
              <span style={{ color: C.muted, fontSize: 12 }}>
                עד {RENDER_MAX_SCENES} תמונות · {RENDER_MAX_DURATION_SEC} שניות
              </span>
            )}
            <button onClick={handleRender} style={primary} disabled={loading || !feasibility.ok}>🎬 הפק סרטון</button>
          </>
          )
        ) : (
          <span style={{ color: C.muted, fontSize: 13 }}>בחרו את התמונות לסטורי</span>
        )}
      </div>

      {/* Selection → editor (or loading) */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
            טוען את הסטורי…
          </div>
        ) : phase === "select" ? (
          <SelectionScreen images={images} onCreate={(ids) => { setSelectedIds(ids); setPhase("editor"); }} />
        ) : (
          editor
        )}
      </div>
    </div>
  );
};

// Pre-generation photo picker: shows the gallery, defaults to Highlights/Top
// Picks (or all if none are marked), preserves the photographer's order, and
// hands the selection to the editor. Nothing generates until the photographer
// confirms which photos are in the story.
const SelectionScreen: React.FC<{ images: PlannerImage[]; onCreate: (ids: string[]) => void }> = ({ images, onCreate }) => {
  const hasPicks = images.some((i) => i.isTopPick);
  const [sel, setSel] = useState<Set<string>>(() => new Set((hasPicks ? images.filter((i) => i.isTopPick) : images).map((i) => i.id)));
  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const orderedIds = images.filter((i) => sel.has(i.id)).map((i) => i.id); // gallery order preserved
  const count = orderedIds.length;
  return (
    <div dir="rtl" style={{ height: "100%", display: "flex", flexDirection: "column", color: C.text }}>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>בחרו תמונות לסטורי</strong>
        <span style={{ color: C.muted, fontSize: 13 }}>נבחרו {count} · הסדר שלכם נשמר · עד {RENDER_MAX_SCENES} בהפקה</span>
        <button style={ghost} onClick={() => setSel(new Set(images.map((i) => i.id)))}>בחר הכל</button>
        {hasPicks ? <button style={ghost} onClick={() => setSel(new Set(images.filter((i) => i.isTopPick).map((i) => i.id)))}>רק מומלצות ★</button> : null}
        <div style={{ flex: 1 }} />
        <button style={{ ...primary, opacity: count < 3 ? 0.5 : 1 }} disabled={count < 3} onClick={() => onCreate(orderedIds)}>צור סטורי ({count}) →</button>
      </div>
      {count > RENDER_MAX_SCENES ? (
        <div style={{ padding: "6px 16px", color: "#fbbf24", fontSize: 12 }}>
          ייכללו {RENDER_MAX_SCENES} התמונות הראשונות בהפקה (אפשר לשנות בעורך).
        </div>
      ) : null}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
        {images.map((img) => {
          const on = sel.has(img.id);
          return (
            <button key={img.id} onClick={() => toggle(img.id)} aria-pressed={on} style={{ position: "relative", padding: 0, border: `2px solid ${on ? C.accent : C.border}`, borderRadius: 8, overflow: "hidden", aspectRatio: "3/4", background: "#000", cursor: "pointer", opacity: on ? 1 : 0.5 }}>
              {img.src ? <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              <span style={{ position: "absolute", top: 4, insetInlineStart: 4, width: 22, height: 22, borderRadius: "50%", background: on ? C.accent : "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{on ? "✓" : ""}</span>
              {img.isTopPick ? <span style={{ position: "absolute", top: 4, insetInlineEnd: 4, fontSize: 13, color: "#fbbf24" }}>★</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const primary: React.CSSProperties = { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" };
const ghost: React.CSSProperties = { background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" };

export default StoryStudioLauncher;
