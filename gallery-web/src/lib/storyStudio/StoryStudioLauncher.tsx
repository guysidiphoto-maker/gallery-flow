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
import {
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const latestPlan = useRef<ScenePlan | null>(null);
  const cancelled = useRef(false);

  // Restore the saved draft on open.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const draft = await loadDraft(galleryId, token);
          if (alive && draft.scenePlan) setInitialPlan(draft.scenePlan);
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
      try {
        const token = await getToken();
        if (token) await saveDraft(galleryId, plan, token);
      } catch {
        // Autosave failures are non-fatal (endpoint may be pre-migration).
      }
    },
    [galleryId, getToken]
  );

  const handleRender = useCallback(async () => {
    const plan = latestPlan.current ?? initialPlan;
    if (!plan) return;
    setRenderState("rendering");
    setErrorMsg(null);
    setOutputUrl(null);
    cancelled.current = false;
    try {
      const token = await getToken();
      if (!token) throw new Error("לא מחוברים");
      const start = await requestStudioRender(galleryId, plan, token);
      if (!start.ok) {
        throw new Error(start.error === "invalid_scene_plan" ? "התוכנית לא עברה אימות" : start.error || "שגיאת רינדור");
      }
      // Synchronous render returns outputUrl directly; otherwise poll.
      if (start.outputUrl) {
        setOutputUrl(start.outputUrl);
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
            <span style={{ color: "#4ade80", fontSize: 13 }}>✓ הסרטון מוכן</span>
            <a href={outputUrl} download style={{ ...primary, textDecoration: "none" }}>⬇ הורד MP4</a>
            <button onClick={handleRender} style={ghost}>רנדר מחדש</button>
          </>
        ) : renderState === "failed" ? (
          <>
            <span style={{ color: "#f87171", fontSize: 13 }}>{errorMsg}</span>
            <button onClick={handleRender} style={primary}>נסה שוב</button>
          </>
        ) : renderState === "rendering" ? (
          <span style={{ color: C.muted, fontSize: 13 }}>מפיק סרטון… זה יכול לקחת עד דקה</span>
        ) : (
          <button onClick={handleRender} style={primary} disabled={loading}>🎬 הפק סרטון</button>
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
