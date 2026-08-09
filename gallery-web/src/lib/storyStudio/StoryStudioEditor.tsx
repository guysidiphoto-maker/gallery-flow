// StoryStudioEditor.tsx — the photographer-facing Story Studio editor.
//
// Live preview uses the SAME <StoryStudioVideo> composition the renderer encodes,
// so what you see is what you export (preview = export by construction). Hebrew
// RTL UI, drag-reorder WITH button fallbacks, per-scene + global controls,
// undo/redo, debounced autosave, and a guarded destructive reset.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StoryStudioVideo } from "../../../story-studio-remotion/StoryStudioVideo";
import { planStory, type PlannerImage } from "./planner";
import {
  MAX_SCENE_SEC,
  MIN_SCENE_SEC,
  MOTION_EFFECTS,
  TEMPLATES,
  TRANSITIONS,
  totalFrames,
  type BrandResolved,
  type MotionEffect,
  type Scene,
  type ScenePlan,
  type StoryLength,
  type StoryTemplate,
  type TransitionType,
} from "./sceneplan";

// ── Hebrew copy (plain, non-technical) ───────────────────────────────────────
const HE = {
  template: "סגנון",
  length: "אורך",
  pace: "קצב",
  regenerate: "צור מחדש אוטומטית",
  reset: "איפוס לעריכה של פיקספלו",
  resetConfirm: "לאפס את כל השינויים ולחזור לעריכה האוטומטית?",
  undo: "בטל",
  redo: "בצע שוב",
  addPhoto: "הוסף תמונה",
  duplicate: "שכפל",
  remove: "הסר",
  duration: "משך",
  motion: "תנועה",
  transition: "מעבר",
  fitFull: "מילוי מלא",
  fitContain: "התאמה (עם רקע)",
  focal: "נקודת מיקוד (לחצו על התמונה)",
  caption: "כותרת על התמונה",
  eventTitle: "שם האירוע",
  eventDate: "תאריך",
  scene: "סצנה",
  saving: "שומר…",
  saved: "נשמר",
  seconds: "שנ׳",
  total: "אורך כולל",
};
const TEMPLATE_HE: Record<StoryTemplate, string> = {
  "editorial-clean": "נקי ואלגנטי",
  "cinematic-energy": "קולנועי",
  "fast-highlights": "מהיר לרשתות",
};
const LENGTH_HE: Record<StoryLength, string> = { short: "קצר", standard: "רגיל", extended: "ארוך" };
const PACE_HE: Record<"relaxed" | "balanced" | "energetic", string> = {
  relaxed: "רגוע",
  balanced: "מאוזן",
  energetic: "אנרגטי",
};
const MOTION_HE: Record<MotionEffect, string> = {
  none: "ללא (סטטי)",
  "push-in": "זום פנימה",
  "pull-out": "זום החוצה",
  pan: "תנועה צידית",
  "focus-zoom": "זום למיקוד",
  "punch-in": "זום נקישה",
};
const TRANSITION_HE: Record<TransitionType, string> = {
  cut: "חיתוך חד",
  "cross-dissolve": "מעבר רך",
  slide: "החלקה",
  "soft-blur": "טשטוש רך",
  "light-leak": "הבזק אור",
  whip: "החלקה מהירה",
};

export interface StoryStudioEditorProps {
  images: PlannerImage[];
  brand: BrandResolved;
  event?: { title?: string; date?: string; location?: string };
  /** Called (debounced) whenever the plan changes. Persist the plan here. */
  onSave?: (plan: ScenePlan) => Promise<void> | void;
  galleryId: string;
  /** Restore a previously-saved draft instead of generating a fresh auto cut. */
  initialPlan?: ScenePlan | null;
}

const C = {
  bg: "#0d0d10",
  panel: "#17171c",
  border: "#2a2a32",
  text: "#e9e9ee",
  muted: "#9a9aa6",
  accent: "#B45309",
};

export const StoryStudioEditor: React.FC<StoryStudioEditorProps> = ({
  images,
  brand,
  event,
  onSave,
  galleryId,
  initialPlan,
}) => {
  const srcById = useMemo(() => {
    const m = new Map<string, string>();
    for (const img of images) if (img.src) m.set(img.id, img.src);
    return m;
  }, [images]);

  const buildAuto = useCallback(
    (template: StoryTemplate, length: StoryLength, pace: "relaxed" | "balanced" | "energetic") => {
      const p = planStory(images, { galleryId, template, length, pace, brand, event, seed: 7 });
      // Attach preview src for the live <Player> + thumbnails (not persisted).
      return { ...p, scenes: p.scenes.map((s) => ({ ...s, src: srcById.get(s.imageId) })) };
    },
    [images, galleryId, brand, event, srcById]
  );

  const [plan, setPlanState] = useState<ScenePlan>(() =>
    initialPlan
      ? // Restore a saved draft; re-attach preview src (not persisted).
        { ...initialPlan, scenes: initialPlan.scenes.map((s) => ({ ...s, src: srcById.get(s.imageId) })) }
      : buildAuto("editorial-clean", "standard", "balanced")
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => plan.scenes[0]?.id ?? null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const past = useRef<ScenePlan[]>([]);
  const future = useRef<ScenePlan[]>([]);
  // Manual per-image overrides, re-applied after an auto-regenerate so edits survive.
  const overrides = useRef<Map<string, Partial<Scene>>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(
    (next: ScenePlan) => {
      if (!onSave) return;
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await onSave(next);
        setSaveStatus("saved");
      }, 700);
    },
    [onSave]
  );

  const commit = useCallback(
    (next: ScenePlan, recordHistory = true) => {
      if (recordHistory) {
        past.current.push(plan);
        if (past.current.length > 50) past.current.shift();
        future.current = [];
      }
      setPlanState(next);
      scheduleSave(next);
    },
    [plan, scheduleSave]
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(plan);
    setPlanState(prev);
    scheduleSave(prev);
  }, [plan, scheduleSave]);

  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(plan);
    setPlanState(nxt);
    scheduleSave(nxt);
  }, [plan, scheduleSave]);

  // ── Scene mutations ────────────────────────────────────────────────────────
  const patchScene = useCallback(
    (id: string, patch: Partial<Scene>) => {
      const scenes = plan.scenes.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...patch };
        const ov = overrides.current.get(s.imageId) ?? {};
        overrides.current.set(s.imageId, { ...ov, ...patch });
        return merged;
      });
      commit({ ...plan, scenes, generatedBy: "manual" });
    },
    [plan, commit]
  );

  const moveScene = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = plan.scenes.findIndex((s) => s.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= plan.scenes.length) return;
      const scenes = plan.scenes.slice();
      [scenes[idx], scenes[j]] = [scenes[j], scenes[idx]];
      commit({ ...plan, scenes, generatedBy: "manual" });
    },
    [plan, commit]
  );

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const from = plan.scenes.findIndex((s) => s.id === fromId);
      const to = plan.scenes.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0) return;
      const scenes = plan.scenes.slice();
      const [moved] = scenes.splice(from, 1);
      scenes.splice(to, 0, moved);
      commit({ ...plan, scenes, generatedBy: "manual" });
    },
    [plan, commit]
  );

  const duplicateScene = useCallback(
    (id: string) => {
      const idx = plan.scenes.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const src = plan.scenes[idx];
      const copy: Scene = { ...src, id: `${src.id}_dup${plan.scenes.length}` };
      const scenes = plan.scenes.slice();
      scenes.splice(idx + 1, 0, copy);
      commit({ ...plan, scenes, generatedBy: "manual" });
    },
    [plan, commit]
  );

  const removeScene = useCallback(
    (id: string) => {
      if (plan.scenes.length <= 3) return; // keep the plan valid
      const scenes = plan.scenes.filter((s) => s.id !== id);
      commit({ ...plan, scenes, generatedBy: "manual" });
      if (selectedId === id) setSelectedId(scenes[0]?.id ?? null);
    },
    [plan, commit, selectedId]
  );

  const regenerate = useCallback(() => {
    const fresh = buildAuto(plan.template, plan.length, plan.pace);
    // Re-apply manual overrides onto matching images so edits survive.
    const scenes = fresh.scenes.map((s) => {
      const ov = overrides.current.get(s.imageId);
      return ov ? { ...s, ...ov } : s;
    });
    commit({ ...fresh, scenes, generatedBy: "manual" });
  }, [buildAuto, plan.template, plan.length, plan.pace, commit]);

  const resetToAuto = useCallback(() => {
    if (!window.confirm(HE.resetConfirm)) return;
    overrides.current.clear();
    commit(buildAuto(plan.template, plan.length, plan.pace));
  }, [buildAuto, plan.template, plan.length, plan.pace, commit]);

  const setGlobal = useCallback(
    (patch: Partial<Pick<ScenePlan, "template" | "length" | "pace">>) => {
      const next = { ...plan, ...patch };
      const fresh = buildAuto(next.template, next.length, next.pace);
      const scenes = fresh.scenes.map((s) => {
        const ov = overrides.current.get(s.imageId);
        return ov ? { ...s, ...ov } : s;
      });
      commit({ ...fresh, scenes, generatedBy: "manual" });
    },
    [plan, buildAuto, commit]
  );

  const selected = plan.scenes.find((s) => s.id === selectedId) ?? null;
  const durationInFrames = useMemo(() => totalFrames(plan), [plan]);
  const totalSec = (durationInFrames / plan.fps).toFixed(1);

  // ── Preview: Remotion Player's auto-scale is unreliable in this embed, so we
  // render at native 1080x1920 and apply our OWN measured scale transform. This
  // is deterministic and also drives responsive sizing (mobile). Custom controls
  // keep normal size (scaling the Player would shrink built-in controls).
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [previewW, setPreviewW] = useState(300);
  const [isNarrow, setIsNarrow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Container-based responsiveness (works in embeds, not just full viewport).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setIsNarrow(w < 760);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [curFrame, setCurFrame] = useState(0);
  const scale = previewW / plan.width;
  const previewWidthCss = isNarrow ? "min(72vw, 340px)" : "min(300px, 44vw)";

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setPreviewW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setCurFrame(e.detail.frame);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else p.play();
  };
  const seekTo = (frame: number) => {
    playerRef.current?.seekTo(frame);
    setCurFrame(frame);
  };
  const fmt = (f: number) => {
    const s = f / plan.fps;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      dir="rtl"
      ref={rootRef}
      style={{
        ...(isNarrow
          ? { display: "flex", flexDirection: "column", overflowY: "auto" }
          : {
              display: "grid",
              gridTemplateColumns: "minmax(280px, 340px) 1fr",
              gridTemplateRows: "auto 1fr auto",
            }),
        gap: 1,
        height: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "system-ui, 'Segoe UI', Arial, sans-serif",
      }}
    >
      {/* Global bar */}
      <div style={{ gridColumn: "1 / 3", order: 0, ...bar }}>
        <strong style={{ fontSize: 18, marginInlineEnd: 16 }}>🎬 סטודיו סטורי</strong>
        <Segment label={HE.template} value={plan.template} options={TEMPLATES} labels={TEMPLATE_HE} onChange={(v) => setGlobal({ template: v })} />
        <Segment label={HE.length} value={plan.length} options={["short", "standard", "extended"] as StoryLength[]} labels={LENGTH_HE} onChange={(v) => setGlobal({ length: v })} />
        <Segment label={HE.pace} value={plan.pace} options={["relaxed", "balanced", "energetic"] as const} labels={PACE_HE} onChange={(v) => setGlobal({ pace: v })} />
        <div style={{ flex: 1 }} />
        <button style={btn} onClick={regenerate}>♻︎ {HE.regenerate}</button>
        <button style={btnGhost} onClick={undo} disabled={past.current.length === 0}>↩︎ {HE.undo}</button>
        <button style={btnGhost} onClick={redo} disabled={future.current.length === 0}>↪︎ {HE.redo}</button>
        <button style={btnGhost} onClick={resetToAuto}>⟲ {HE.reset}</button>
        <span style={{ color: C.muted, minWidth: 60, textAlign: "center" }}>
          {saveStatus === "saving" ? HE.saving : saveStatus === "saved" ? "✓ " + HE.saved : ""}
        </span>
      </div>

      {/* Scene controls */}
      <aside style={{ ...panel, overflowY: "auto", order: isNarrow ? 3 : 0, width: isNarrow ? "100%" : undefined }}>
        <SceneControls scene={selected} onPatch={patchScene} event={event} plan={plan} onGlobalEvent={() => {}} />
      </aside>

      {/* Preview */}
      <main
        style={{
          ...panel,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          order: isNarrow ? 1 : 0,
          padding: isNarrow ? "16px 0" : undefined,
        }}
      >
        <div style={{ color: C.muted, marginBottom: 8, fontSize: 13 }}>
          {HE.total}: {totalSec} {HE.seconds} · {plan.scenes.length} {HE.scene}ות · 9:16
        </div>
        <div
          ref={previewWrapRef}
          style={{
            width: previewWidthCss,
            aspectRatio: "9 / 16",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            borderRadius: 12,
            overflow: "hidden",
            background: "#000",
          }}
        >
          {/* `zoom` (not transform) scales at layout level so Remotion's
              absolutely-positioned composition stays in-frame. Chrome-only,
              which is fine: Remotion renders in Chrome too. */}
          <div style={{ zoom: scale }}>
            <Player
              ref={playerRef}
              component={StoryStudioVideo}
              inputProps={{ plan }}
              durationInFrames={durationInFrames}
              fps={plan.fps}
              compositionWidth={plan.width}
              compositionHeight={plan.height}
              style={{ width: plan.width, height: plan.height }}
              controls={false}
              loop
            />
          </div>
        </div>
        {/* Custom, correctly-sized controls (play/seek/restart) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, width: previewWidthCss }}>
          <button style={btnGhost} onClick={() => seekTo(0)} title="התחלה">⏮</button>
          <button style={btn} onClick={togglePlay}>{isPlaying ? "⏸" : "▶"}</button>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationInFrames - 1)}
            value={curFrame}
            onChange={(e) => seekTo(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: C.muted, fontSize: 12, minWidth: 74, textAlign: "center" }}>
            {fmt(curFrame)} / {fmt(durationInFrames)}
          </span>
        </div>
      </main>

      {/* Storyboard strip */}
      <div style={{ gridColumn: "1 / 3", order: isNarrow ? 2 : 0, ...strip }}>
        {plan.scenes.map((s, i) => (
          <SceneCard
            key={s.id}
            scene={s}
            index={i}
            selected={s.id === selectedId}
            first={i === 0}
            last={i === plan.scenes.length - 1}
            onSelect={() => setSelectedId(s.id)}
            onMove={moveScene}
            onDuplicate={duplicateScene}
            onRemove={removeScene}
            onReorder={reorder}
          />
        ))}
      </div>
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────
function Segment<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginInlineEnd: 14 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{props.label}</span>
      <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {props.options.map((o) => (
          <button
            key={o}
            onClick={() => props.onChange(o)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "none",
              cursor: "pointer",
              background: props.value === o ? C.accent : "transparent",
              color: props.value === o ? "#fff" : C.text,
            }}
          >
            {props.labels[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

const SceneControls: React.FC<{
  scene: Scene | null;
  plan: ScenePlan;
  event?: { title?: string; date?: string };
  onPatch: (id: string, patch: Partial<Scene>) => void;
  onGlobalEvent: () => void;
}> = ({ scene, onPatch }) => {
  if (!scene) return <div style={{ color: C.muted, padding: 16 }}>בחרו סצנה מלמטה</div>;
  const setFocalFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onPatch(scene.id, { focal: { x, y } });
  };
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>עריכת סצנה</h3>

      <label style={lbl}>
        {HE.duration}: {scene.durationSec.toFixed(1)} {HE.seconds}
        <input
          type="range"
          min={MIN_SCENE_SEC}
          max={MAX_SCENE_SEC}
          step={0.1}
          value={scene.durationSec}
          onChange={(e) => onPatch(scene.id, { durationSec: Number(e.target.value) })}
        />
      </label>

      <label style={lbl}>
        {HE.motion}
        <select style={sel} value={scene.motion} onChange={(e) => onPatch(scene.id, { motion: e.target.value as MotionEffect })}>
          {MOTION_EFFECTS.map((m) => (
            <option key={m} value={m}>{MOTION_HE[m]}</option>
          ))}
        </select>
      </label>

      <label style={lbl}>
        {HE.transition}
        <select style={sel} value={scene.transitionIn} onChange={(e) => onPatch(scene.id, { transitionIn: e.target.value as TransitionType, transitionDurationSec: e.target.value === "cut" ? 0 : 0.4 })}>
          {TRANSITIONS.map((t) => (
            <option key={t} value={t}>{TRANSITION_HE[t]}</option>
          ))}
        </select>
      </label>

      <div style={lbl}>
        תצוגה
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button style={scene.fit === "fill" ? btn : btnGhost} onClick={() => onPatch(scene.id, { fit: "fill", background: "none" })}>{HE.fitFull}</button>
          <button style={scene.fit === "fit" ? btn : btnGhost} onClick={() => onPatch(scene.id, { fit: "fit", background: "blur" })}>{HE.fitContain}</button>
        </div>
      </div>

      <div style={lbl}>
        {HE.focal}
        {scene.src ? (
          <div onClick={setFocalFromClick} style={{ position: "relative", marginTop: 6, cursor: "crosshair", borderRadius: 8, overflow: "hidden", aspectRatio: "9/16", maxHeight: 200, background: "#000" }}>
            <img src={scene.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${scene.focal.x * 100}% ${scene.focal.y * 100}%` }} />
            <div style={{ position: "absolute", left: `${scene.focal.x * 100}%`, top: `${scene.focal.y * 100}%`, width: 20, height: 20, marginLeft: -10, marginTop: -10, border: "3px solid #fff", borderRadius: "50%", boxShadow: "0 0 0 2px rgba(0,0,0,0.5)" }} />
          </div>
        ) : null}
      </div>

      <label style={lbl}>
        {HE.caption}
        <input
          style={inp}
          type="text"
          maxLength={120}
          value={scene.text?.content ?? ""}
          placeholder="לא חובה"
          onChange={(e) => onPatch(scene.id, { text: e.target.value ? { content: e.target.value, position: "bottom" } : null })}
        />
      </label>
    </div>
  );
};

const SceneCard: React.FC<{
  scene: Scene;
  index: number;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}> = ({ scene, index, selected, first, last, onSelect, onMove, onDuplicate, onRemove, onReorder }) => {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/scene", scene.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/scene");
        if (from) onReorder(from, scene.id);
      }}
      onClick={onSelect}
      style={{
        flex: "0 0 auto",
        width: 92,
        border: `2px solid ${selected ? C.accent : C.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: C.panel,
        cursor: "grab",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "9/16", background: "#000" }}>
        {scene.src ? (
          <img src={scene.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${scene.focal.x * 100}% ${scene.focal.y * 100}%` }} />
        ) : null}
        <span style={{ position: "absolute", top: 2, insetInlineStart: 4, fontSize: 11, color: "#fff", textShadow: "0 1px 3px #000" }}>{index + 1}</span>
        <span style={{ position: "absolute", bottom: 2, insetInlineStart: 4, fontSize: 9, color: "#fff", textShadow: "0 1px 3px #000" }}>{scene.durationSec.toFixed(1)}s</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: 2 }}>
        <button title="שמאלה" style={mini} disabled={first} onClick={(e) => { e.stopPropagation(); onMove(scene.id, -1); }}>◀</button>
        <button title={HE.duplicate} style={mini} onClick={(e) => { e.stopPropagation(); onDuplicate(scene.id); }}>⧉</button>
        <button title={HE.remove} style={mini} onClick={(e) => { e.stopPropagation(); onRemove(scene.id); }}>🗑</button>
        <button title="ימינה" style={mini} disabled={last} onClick={(e) => { e.stopPropagation(); onMove(scene.id, 1); }}>▶</button>
      </div>
    </div>
  );
};

// ── styles ───────────────────────────────────────────────────────────────────
const bar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, padding: "8px 14px", background: C.panel, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" };
const panel: React.CSSProperties = { background: C.bg, borderInlineStart: `1px solid ${C.border}` };
const strip: React.CSSProperties = { display: "flex", gap: 8, padding: 10, background: C.panel, borderTop: `1px solid ${C.border}`, overflowX: "auto" };
const btn: React.CSSProperties = { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" };
const mini: React.CSSProperties = { background: "transparent", color: C.text, border: "none", cursor: "pointer", fontSize: 11, padding: 2 };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: C.text };
const sel: React.CSSProperties = { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 8px", fontSize: 13 };
const inp: React.CSSProperties = { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 8px", fontSize: 13 };

export default StoryStudioEditor;
