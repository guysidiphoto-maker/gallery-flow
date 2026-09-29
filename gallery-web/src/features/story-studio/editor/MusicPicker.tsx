import { cn } from "@/shared/ui";
import { MUSIC_MAX_FADE_SEC, MUSIC_TRACKS, type MusicConfig, type ScenePlan } from "../sceneplan";
import { HE } from "./copy";
import { control, lbl } from "./studioClasses";

/** Bundled-track picker with volume, fades and beat-sync strength. */
export function MusicPicker({ plan, onSetMusic, onSetBeatSync }: {
  plan: ScenePlan;
  onSetMusic: (patch: Partial<MusicConfig> | null) => void;
  onSetBeatSync: (strength: number) => void;
}) {
  const music = plan.music;
  const activeTrack = music && !music.muted && music.trackId ? music.trackId : "";
  return (
    <>
      <label className={lbl}>
        {HE.music}
        <select
          className={control}
          value={activeTrack}
          onChange={(e) => (e.target.value ? onSetMusic({ trackId: e.target.value, muted: false }) : onSetMusic(null))}
        >
          <option value="">{HE.noMusic}</option>
          {MUSIC_TRACKS.map((t) => <option key={t.id} value={t.id}>{t.labelHe}</option>)}
        </select>
      </label>
      {activeTrack ? (
        <>
          <label className={lbl}>
            {HE.volume}: {Math.round((music?.volume ?? 0.7) * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={music?.volume ?? 0.7} onChange={(e) => onSetMusic({ volume: Number(e.target.value) })} />
          </label>
          <div className="flex gap-2.5">
            <label className={cn(lbl, "flex-1")}>
              {HE.fadeIn}: {(music?.fadeInSec ?? 1).toFixed(1)}s
              <input type="range" min={0} max={MUSIC_MAX_FADE_SEC} step={0.5} value={music?.fadeInSec ?? 1} onChange={(e) => onSetMusic({ fadeInSec: Number(e.target.value) })} />
            </label>
            <label className={cn(lbl, "flex-1")}>
              {HE.fadeOut}: {(music?.fadeOutSec ?? 1.5).toFixed(1)}s
              <input type="range" min={0} max={MUSIC_MAX_FADE_SEC} step={0.5} value={music?.fadeOutSec ?? 1.5} onChange={(e) => onSetMusic({ fadeOutSec: Number(e.target.value) })} />
            </label>
          </div>
          <label className={lbl}>
            יישור לקצב: {Math.round((plan.beatSyncStrength ?? 0) * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={plan.beatSyncStrength ?? 0} onChange={(e) => onSetBeatSync(Number(e.target.value))} />
          </label>
        </>
      ) : null}
    </>
  );
}
