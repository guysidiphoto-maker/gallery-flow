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
            setInitialPlan(draft.scenePlan);
            setCurrentPlan(draft.scenePlan);
          }
        }
      } catch {
        // No draft or endpoint not live yet — start from the auto cut.
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
        onSave={handleSave}
      />
    ),
    [images, brand, event, galleryId, initialPlan, handleSave]
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: C.bg, display: "flex", flexDirection: "column" }} dir="rtl">
      {/* Launcher top bar (render + close) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: C.panel, borderBottom: `1px solid ${C.border}`, color: C.text }}>
        <button onClick={onClose} style={ghost}>✕ סגור</button>
        <div style={{ flex: 1 }} />
        {renderState === "ready" && outputUrl ? (
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
        )}
      </div>

      {/* Editor (or loading) */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
            טוען את הסטורי…
          </div>
        ) : (
          editor
        )}
      </div>
    </div>
  );
};

const primary: React.CSSProperties = { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" };
const ghost: React.CSSProperties = { background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" };

export default StoryStudioLauncher;
