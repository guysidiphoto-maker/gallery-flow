import { RENDER_MAX_DURATION_SEC, RENDER_MAX_SCENES } from "../sceneplan";
import { primary, ghost } from "./launcherClasses";
import type { StudioSession } from "./useStudioSession";

/** Launcher top bar: close, plus render / progress / download / retry. */
export function LauncherBar({ session, onClose }: { session: StudioSession; onClose: () => void }) {
  const { phase, renderState, outputUrl, posterUrl, errorMsg, feasibility, loading, handleRender, handleCancel } = session;
  return (
    <div className="flex items-center gap-2.5 border-b border-studio-line bg-studio-panel px-3.5 py-2 text-studio-text">
      <button onClick={onClose} className={ghost}>✕ סגור</button>
      <div className="flex-1" />
      {phase !== "editor" ? (
        <span className="text-[13px] text-studio-muted">בחרו את התמונות לסטורי</span>
      ) : renderState === "ready" && outputUrl ? (
        <>
          {posterUrl ? (
            <img src={posterUrl} alt="" className="h-[34px] w-[19px] rounded-[4px] border border-studio-line object-cover" />
          ) : null}
          <span className="text-[13px] text-studio-ok">✓ הסרטון מוכן</span>
          <a href={outputUrl} download className={`${primary} no-underline`}>⬇ הורד MP4</a>
          <button onClick={handleRender} className={ghost}>רנדר מחדש</button>
        </>
      ) : renderState === "failed" ? (
        <>
          <span className="max-w-[420px] text-left text-[13px] text-studio-error">{errorMsg}</span>
          <button onClick={handleRender} className={primary} disabled={!feasibility.ok}>נסה שוב</button>
        </>
      ) : renderState === "rendering" ? (
        <>
          <span className="text-[13px] text-studio-muted">מפיק סרטון… זה יכול לקחת עד דקה</span>
          <button onClick={handleCancel} className={ghost}>בטל</button>
        </>
      ) : (
        <>
          {!feasibility.ok ? (
            <span className="max-w-[460px] text-left text-[12px] leading-[1.3] text-studio-warn">
              כדי לשמור על איכות ומהירות, ההפקה מוגבלת כרגע ל־{RENDER_MAX_SCENES} תמונות / {RENDER_MAX_DURATION_SEC} שניות. הסירו כמה תמונות כדי להפיק.
            </span>
          ) : (
            <span className="text-[12px] text-studio-muted">
              עד {RENDER_MAX_SCENES} תמונות · {RENDER_MAX_DURATION_SEC} שניות
            </span>
          )}
          <button onClick={handleRender} className={primary} disabled={loading || !feasibility.ok}>🎬 הפק סרטון</button>
        </>
      )}
    </div>
  );
}
