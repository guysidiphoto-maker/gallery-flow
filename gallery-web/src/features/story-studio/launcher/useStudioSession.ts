import { useCallback, useEffect, useRef, useState } from "react";
import { checkRenderFeasibility, type ScenePlan } from "../sceneplan";
import { cancelRender, getRenderStatus, loadDraft, requestStudioRender, saveDraft } from "../storyStudioApi";

export type RenderState = "idle" | "rendering" | "ready" | "failed";
export type Phase = "select" | "editor";

const POLL_INTERVAL_MS = 2500;
const POLL_ATTEMPTS = 120;

/** Draft restore, autosave, render submission/polling and cancel for the launcher. */
export function useStudioSession(galleryId: string, getToken: () => Promise<string | null>) {
  const [loading, setLoading] = useState(true);
  // "select" = pre-generation photo picker; "editor" = the storyboard editor.
  const [phase, setPhase] = useState<Phase>("select");
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

  // Live scene/duration cap check; the server enforces the identical rule.
  const capPlan = currentPlan ?? initialPlan;
  const feasibility = capPlan ? checkRenderFeasibility(capPlan) : { ok: true as const };

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
        // No draft yet — start at photo selection.
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
      // Let failures propagate so the editor shows "save failed" instead of a false "saved".
      const token = await getToken();
      if (!token) throw new Error("not_authenticated");
      await saveDraft(galleryId, plan, token);
    },
    [galleryId, getToken]
  );

  const handlePlanChange = useCallback((p: ScenePlan) => {
    latestPlan.current = p;
    setCurrentPlan(p);
  }, []);

  const handleRender = useCallback(async () => {
    const plan = latestPlan.current ?? initialPlan;
    if (!plan) return;
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
        // Prefer the server's human-readable message.
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
      // A synchronous render returns outputUrl directly; otherwise poll.
      if (start.outputUrl) {
        setOutputUrl(start.outputUrl);
        setPosterUrl(start.posterUrl ?? null);
        setRenderState("ready");
        return;
      }
      if (start.renderId) {
        for (let i = 0; i < POLL_ATTEMPTS && !cancelled.current; i++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
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

  // Stop polling immediately and ask the server to abandon the render (frees its lock).
  const handleCancel = useCallback(async () => {
    cancelled.current = true;
    setRenderState("idle");
    try {
      const token = await getToken();
      if (token) await cancelRender(galleryId, token, renderId ?? undefined);
    } catch {
      // Best-effort: polling has already stopped.
    }
  }, [galleryId, getToken, renderId]);

  const startEditing = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    setPhase("editor");
  }, []);

  return {
    loading,
    phase,
    selectedIds,
    initialPlan,
    renderState,
    outputUrl,
    posterUrl,
    errorMsg,
    feasibility,
    handleSave,
    handlePlanChange,
    handleRender,
    handleCancel,
    startEditing,
  };
}

export type StudioSession = ReturnType<typeof useStudioSession>;
