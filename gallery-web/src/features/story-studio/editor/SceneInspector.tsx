import {
  MAX_SCENE_SEC,
  MIN_SCENE_SEC,
  MOTION_EFFECTS,
  TRANSITIONS,
  type MotionEffect,
  type MotionIntensity,
  type Scene,
  type TextPosition,
  type TransitionType,
} from "../sceneplan";
import { HE, MOTION_HE, TRANSITION_HE } from "./copy";
import { FocalPicker } from "./FocalPicker";
import { btn, btnGhost, control, lbl } from "./studioClasses";

const INTENSITY_HE: Record<MotionIntensity, string> = { subtle: "עדינה", medium: "בינונית", strong: "חזקה" };
const POSITION_HE: Record<TextPosition, string> = { top: HE.posTop, center: HE.posCenter, bottom: HE.posBottom };
const CAPTION_STYLE_HE = { editorial: "אלגנטי", bold: "מודגש", minimal: "מינימלי" } as const;

/** Per-scene controls for the scene selected in the timeline. */
export function SceneInspector({ scene, onPatch, onReset, onToggleCollage }: {
  scene: Scene | null;
  onPatch: (id: string, patch: Partial<Scene>) => void;
  onReset: (id: string) => void;
  onToggleCollage?: (id: string) => void;
}) {
  if (!scene) return <div className="p-4 text-studio-muted">בחרו סצנה מלמטה</div>;
  const pos: TextPosition = scene.text?.position ?? "bottom";
  const patch = (p: Partial<Scene>) => onPatch(scene.id, p);
  const on = (active: boolean) => (active ? btn : btnGhost);

  return (
    <div className="flex flex-col gap-4 border-t border-studio-line p-4">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[15px]">עריכת סצנה</h3>
        <div className="flex gap-1.5">
          <button className={on(Boolean(scene.locked))} onClick={() => patch({ locked: !scene.locked })} title="נעל סצנה: עריכה אוטומטית מחדש תשמור עליה">
            {scene.locked ? "🔒 נעול" : "🔓 נעל"}
          </button>
          <button className={btnGhost} onClick={() => onReset(scene.id)} title="אפס סצנה זו לאוטומטי">⟲ אפס סצנה</button>
        </div>
      </div>

      <label className={lbl}>
        {HE.duration}: {scene.durationSec.toFixed(1)} {HE.seconds}
        <input type="range" min={MIN_SCENE_SEC} max={MAX_SCENE_SEC} step={0.1} value={scene.durationSec} onChange={(e) => patch({ durationSec: Number(e.target.value) })} />
      </label>

      <label className={lbl}>
        {HE.motion}
        <select className={control} value={scene.motion} onChange={(e) => patch({ motion: e.target.value as MotionEffect })}>
          {MOTION_EFFECTS.map((m) => <option key={m} value={m}>{MOTION_HE[m]}</option>)}
        </select>
      </label>

      <label className={lbl}>
        עוצמת תנועה
        <select className={control} value={scene.motionIntensity} onChange={(e) => patch({ motionIntensity: e.target.value as MotionIntensity })}>
          {(["subtle", "medium", "strong"] as MotionIntensity[]).map((m) => <option key={m} value={m}>{INTENSITY_HE[m]}</option>)}
        </select>
      </label>

      <label className={lbl}>
        {HE.transition} (כניסה)
        <select className={control} value={scene.transitionIn} onChange={(e) => patch({ transitionIn: e.target.value as TransitionType, transitionDurationSec: e.target.value === "cut" ? 0 : scene.transitionDurationSec || 0.4 })}>
          {TRANSITIONS.map((t) => <option key={t} value={t}>{TRANSITION_HE[t]}</option>)}
        </select>
      </label>

      <label className={lbl}>
        {HE.transition} (יציאה)
        <select className={control} value={scene.transitionOut ?? ""} onChange={(e) => patch({ transitionOut: (e.target.value || undefined) as TransitionType | undefined, transitionOutDurationSec: e.target.value && e.target.value !== "cut" ? scene.transitionOutDurationSec || 0.4 : e.target.value === "cut" ? 0 : undefined })}>
          <option value="">(אוטומטי)</option>
          {TRANSITIONS.map((t) => <option key={t} value={t}>{TRANSITION_HE[t]}</option>)}
        </select>
      </label>

      {scene.transitionIn !== "cut" ? (
        <label className={lbl}>
          משך מעבר: {scene.transitionDurationSec.toFixed(2)} {HE.seconds}
          <input type="range" min={0.15} max={1.2} step={0.05} value={scene.transitionDurationSec} onChange={(e) => patch({ transitionDurationSec: Number(e.target.value) })} />
        </label>
      ) : null}

      <div className={lbl}>
        תצוגה
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button className={on(scene.layout !== "collage" && scene.fit === "fill")} onClick={() => patch({ fit: "fill", background: "none" })}>{HE.fitFull}</button>
          <button className={on(scene.layout !== "collage" && scene.fit === "fit")} onClick={() => patch({ fit: "fit", background: "blur" })}>{HE.fitContain}</button>
          {onToggleCollage ? (
            <button className={on(scene.layout === "collage")} title="קולאז': 2-3 תמונות רוחביות זו מעל זו, ממלא את המסך בלי פסים שחורים" onClick={() => onToggleCollage(scene.id)}>
              ▦ קולאז'{scene.layout === "collage" && scene.collageImageIds ? ` (${scene.collageImageIds.length})` : ""}
            </button>
          ) : null}
        </div>
      </div>

      <div className={lbl}>
        {HE.focal}
        {scene.src ? <FocalPicker src={scene.src} focal={scene.focal} onChange={(focal) => patch({ focal })} /> : null}
      </div>

      <label className={lbl}>
        {HE.caption}
        <input
          className={control}
          type="text"
          maxLength={120}
          value={scene.text?.content ?? ""}
          placeholder="לא חובה"
          onChange={(e) => patch({ text: e.target.value ? { content: e.target.value, position: pos } : null })}
        />
      </label>

      {scene.text?.content ? (
        <>
          <div className={lbl}>
            {HE.captionPos}
            <div className="mt-1 flex gap-1.5">
              {(["top", "center", "bottom"] as TextPosition[]).map((p) => (
                <button key={p} className={on(pos === p)} onClick={() => patch({ text: { content: scene.text!.content, position: p } })}>
                  {POSITION_HE[p]}
                </button>
              ))}
            </div>
          </div>
          <div className={lbl}>
            סגנון כיתוב
            <div className="mt-1 flex gap-1.5">
              {(["editorial", "bold", "minimal"] as const).map((cs) => (
                <button key={cs} className={on((scene.captionStyle ?? "editorial") === cs)} onClick={() => patch({ captionStyle: cs })}>
                  {CAPTION_STYLE_HE[cs]}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
