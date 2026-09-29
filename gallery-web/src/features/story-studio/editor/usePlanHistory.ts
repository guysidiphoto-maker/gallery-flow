import { useCallback, useEffect, useRef, useState } from "react";
import type { ScenePlan } from "../sceneplan";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

const HISTORY_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 700;

/** Plan state with undo/redo, debounced autosave and a synchronous change callback. */
export function usePlanHistory(
  init: () => ScenePlan,
  onSave: ((plan: ScenePlan) => Promise<void> | void) | undefined,
  onPlanChange: ((plan: ScenePlan) => void) | undefined,
) {
  const [plan, setPlanState] = useState<ScenePlan>(init);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // Bumped on every history change so undo/redo disabled states (read from refs) re-render.
  const [, setHistoryTick] = useState(0);
  const past = useRef<ScenePlan[]>([]);
  const future = useRef<ScenePlan[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(
    (next: ScenePlan) => {
      if (!onSave) return;
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await onSave(next);
          setSaveStatus("saved");
        } catch {
          setSaveStatus("failed");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [onSave]
  );

  const commit = useCallback(
    (next: ScenePlan, recordHistory = true) => {
      if (recordHistory) {
        past.current.push(plan);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        future.current = [];
      }
      setPlanState(next);
      setHistoryTick((t) => t + 1);
      onPlanChange?.(next);
      scheduleSave(next);
    },
    [plan, scheduleSave, onPlanChange]
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(plan);
    setPlanState(prev);
    setHistoryTick((t) => t + 1);
    onPlanChange?.(prev);
    scheduleSave(prev);
  }, [plan, scheduleSave, onPlanChange]);

  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(plan);
    setPlanState(nxt);
    setHistoryTick((t) => t + 1);
    onPlanChange?.(nxt);
    scheduleSave(nxt);
  }, [plan, scheduleSave, onPlanChange]);

  // Emit the initial plan once so the host can render before any edit.
  const emittedInitial = useRef(false);
  useEffect(() => {
    if (emittedInitial.current) return;
    emittedInitial.current = true;
    onPlanChange?.(plan);
  }, [plan, onPlanChange]);

  return {
    plan,
    saveStatus,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
