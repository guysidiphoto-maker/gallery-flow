import { cn } from "@/shared/ui";
import type { BrandResolved, MusicConfig, ScenePlan, TitleCard } from "../sceneplan";
import { HE } from "./copy";
import { MusicPicker } from "./MusicPicker";
import { control, lbl } from "./studioClasses";

const checkRow = cn(lbl, "flex-row items-center gap-2");

/** Story-level settings, collapsed by default so the first screen stays simple. */
export function StorySettings({ plan, brand, onPatchCard, onSetMusic, onSetBeatSync }: {
  plan: ScenePlan;
  brand: BrandResolved;
  onPatchCard: (kind: "opening" | "outro", patch: Partial<TitleCard>) => void;
  onSetMusic: (patch: Partial<MusicConfig> | null) => void;
  onSetBeatSync: (strength: number) => void;
}) {
  return (
    <details className="border-b border-studio-line px-4 py-3">
      <summary className="cursor-pointer text-[15px] font-semibold">⚙︎ {HE.storySettings}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <label className={checkRow}>
          <input type="checkbox" checked={plan.opening.enabled} onChange={(e) => onPatchCard("opening", { enabled: e.target.checked })} />
          כרטיס פתיחה
        </label>
        {plan.opening.enabled ? (
          <>
            <label className={lbl}>
              {HE.eventTitle}
              <input className={control} type="text" maxLength={80} value={plan.opening.title ?? ""} placeholder={brand.studioName ?? ""} onChange={(e) => onPatchCard("opening", { title: e.target.value })} />
            </label>
            <label className={lbl}>
              {HE.eventDate}
              <input className={control} type="text" maxLength={80} value={plan.opening.subtitle ?? ""} placeholder="לא חובה" onChange={(e) => onPatchCard("opening", { subtitle: e.target.value })} />
            </label>
          </>
        ) : null}
        <label className={checkRow}>
          <input type="checkbox" checked={plan.outro.enabled} onChange={(e) => onPatchCard("outro", { enabled: e.target.checked })} />
          {HE.showOutro}
        </label>
        {plan.outro.enabled ? (
          <label className={lbl}>
            {HE.eventTitle}
            <input className={control} type="text" maxLength={80} value={plan.outro.title ?? ""} placeholder={brand.studioName ?? ""} onChange={(e) => onPatchCard("outro", { title: e.target.value })} />
          </label>
        ) : null}
        {brand.logoUrl ? (
          <label className={checkRow}>
            <input
              type="checkbox"
              checked={Boolean(plan.opening.showLogo || plan.outro.showLogo)}
              onChange={(e) => { onPatchCard("opening", { showLogo: e.target.checked }); onPatchCard("outro", { showLogo: e.target.checked }); }}
            />
            {HE.showLogo}
          </label>
        ) : null}
        <MusicPicker plan={plan} onSetMusic={onSetMusic} onSetBeatSync={onSetBeatSync} />
      </div>
    </details>
  );
}
