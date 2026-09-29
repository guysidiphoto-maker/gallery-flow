import { useCallback, useMemo, useRef, useState } from "react";
import { planStory, type PlannerImage } from "../planner";
import {
  applyBeatSync,
  type AudioAnalysis,
  type BrandResolved,
  type MusicConfig,
  type Scene,
  type ScenePlan,
  type StoryLength,
  type StoryTemplate,
  type TitleCard,
} from "../sceneplan";
import MUSIC_ANALYSIS from "../musicAnalysis.json";
import { HE, type OrderMode, type Pace } from "./copy";
import {
  duplicateSceneIn,
  moveSceneTo,
  sceneForAddedPhoto,
  swapScenes,
  toggleCollageIn,
  withPreviewSrc,
} from "./sceneOps";
import { usePlanHistory } from "./usePlanHistory";

const DEFAULT_MUSIC: MusicConfig = { trackId: null, volume: 0.7, fadeInSec: 1, fadeOutSec: 1.5, muted: false };

export interface StoryPlanOptions {
  images: PlannerImage[];
  brand: BrandResolved;
  event?: { title?: string; date?: string; location?: string };
  galleryId: string;
  initialPlan?: ScenePlan | null;
  selectedIds?: string[] | null;
  onSave?: (plan: ScenePlan) => Promise<void> | void;
  onPlanChange?: (plan: ScenePlan) => void;
}

/**
 * All editor state + mutations. Manual edits are kept as overrides keyed by image
 * so they survive template/length/pace changes and regenerates.
 */
export function useStoryPlan({ images, brand, event, galleryId, initialPlan, selectedIds, onSave, onPlanChange }: StoryPlanOptions) {
  const srcById = useMemo(() => {
    const m = new Map<string, string>();
    for (const img of images) if (img.src) m.set(img.id, img.src);
    return m;
  }, [images]);

  // The auto cut draws only from the photographer's selection, in their order;
  // the full `images` still feeds the add-photo picker.
  const selectedPool = useMemo(() => {
    if (!selectedIds || selectedIds.length === 0) return images;
    const order = new Map(selectedIds.map((id, i) => [id, i]));
    return images.filter((i) => order.has(i.id)).sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  }, [images, selectedIds]);

  // "locked" keeps the photographer's order; "suggested" is an explicit opt-in re-sequence.
  const [orderMode, setOrderMode] = useState<OrderMode>("locked");

  // Bumped by "another variation" to get a fresh but deterministic auto cut.
  const variationSeed = useRef(7);
  const buildAuto = useCallback(
    (template: StoryTemplate, length: StoryLength, pace: Pace, mode: OrderMode = orderMode) => {
      const p = planStory(selectedPool, {
        galleryId, template, length, pace, brand, event, seed: variationSeed.current,
        preserveOrder: mode === "locked",
      });
      return withPreviewSrc(p, srcById);
    },
    [selectedPool, galleryId, brand, event, srcById, orderMode]
  );

  const { plan, saveStatus, commit, undo, redo, canUndo, canRedo } = usePlanHistory(
    () => (initialPlan ? withPreviewSrc(initialPlan, srcById) : buildAuto("editorial-clean", "standard", "balanced")),
    onSave,
    onPlanChange,
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => plan.scenes[0]?.id ?? null);

  const overrides = useRef<Map<string, Partial<Scene>>>(new Map());
  const cardOverrides = useRef<{ opening?: Partial<TitleCard>; outro?: Partial<TitleCard> }>({});
  const musicRef = useRef<MusicConfig | null>(initialPlan?.music ?? null);

  const applyOverrides = useCallback((fresh: ScenePlan): ScenePlan => {
    const scenes = fresh.scenes.map((s) => {
      const ov = overrides.current.get(s.imageId);
      return ov ? { ...s, ...ov } : s;
    });
    const co = cardOverrides.current;
    return {
      ...fresh,
      scenes,
      opening: co.opening ? { ...fresh.opening, ...co.opening } : fresh.opening,
      outro: co.outro ? { ...fresh.outro, ...co.outro } : fresh.outro,
      music: musicRef.current ?? fresh.music,
    };
  }, []);

  const commitScenes = useCallback(
    (scenes: Scene[] | null) => {
      if (scenes) commit({ ...plan, scenes, generatedBy: "manual" });
    },
    [plan, commit]
  );

  const patchScene = useCallback(
    (id: string, patch: Partial<Scene>) => {
      const scenes = plan.scenes.map((s) => {
        if (s.id !== id) return s;
        const ov = overrides.current.get(s.imageId) ?? {};
        overrides.current.set(s.imageId, { ...ov, ...patch });
        return { ...s, ...patch };
      });
      commitScenes(scenes);
    },
    [plan, commitScenes]
  );

  const moveScene = useCallback((id: string, dir: -1 | 1) => commitScenes(swapScenes(plan.scenes, id, dir)), [plan, commitScenes]);
  const reorder = useCallback((fromId: string, toId: string) => commitScenes(moveSceneTo(plan.scenes, fromId, toId)), [plan, commitScenes]);
  const duplicateScene = useCallback((id: string) => commitScenes(duplicateSceneIn(plan.scenes, id)), [plan, commitScenes]);
  const toggleCollage = useCallback((id: string) => commitScenes(toggleCollageIn(plan.scenes, id, srcById)), [plan, commitScenes, srcById]);

  // Reset one scene to what the automatic cut produced for that image.
  const resetScene = useCallback(
    (id: string) => {
      const scene = plan.scenes.find((s) => s.id === id);
      if (!scene) return;
      overrides.current.delete(scene.imageId);
      const auto = buildAuto(plan.template, plan.length, plan.pace);
      const autoScene = auto.scenes.find((s) => s.imageId === scene.imageId);
      if (!autoScene) return; // manually added image: nothing to reset to
      const scenes = plan.scenes.map((s) => (s.id === id ? { ...autoScene, id: s.id, src: s.src } : s));
      commit({ ...plan, scenes });
    },
    [plan, buildAuto, commit]
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
    commit({ ...applyOverrides(buildAuto(plan.template, plan.length, plan.pace)), generatedBy: "manual" });
  }, [buildAuto, plan.template, plan.length, plan.pace, commit, applyOverrides]);

  const anotherVariation = useCallback(() => {
    variationSeed.current += 1;
    commit({ ...applyOverrides(buildAuto(plan.template, plan.length, plan.pace)), generatedBy: "manual" });
  }, [buildAuto, plan.template, plan.length, plan.pace, commit, applyOverrides]);

  const resetToAuto = useCallback(() => {
    if (!window.confirm(HE.resetConfirm)) return;
    overrides.current.clear();
    cardOverrides.current = {};
    commit(buildAuto(plan.template, plan.length, plan.pace));
  }, [buildAuto, plan.template, plan.length, plan.pace, commit]);

  const setGlobal = useCallback(
    (patch: Partial<Pick<ScenePlan, "template" | "length" | "pace">>) => {
      const next = { ...plan, ...patch };
      commit({ ...applyOverrides(buildAuto(next.template, next.length, next.pace)), generatedBy: "manual" });
    },
    [plan, buildAuto, commit, applyOverrides]
  );

  const switchOrderMode = useCallback(
    (mode: OrderMode) => {
      setOrderMode(mode);
      commit({ ...applyOverrides(buildAuto(plan.template, plan.length, plan.pace, mode)), generatedBy: "manual" });
    },
    [plan.template, plan.length, plan.pace, buildAuto, applyOverrides, commit]
  );

  const patchCard = useCallback(
    (kind: "opening" | "outro", patch: Partial<TitleCard>) => {
      const prev = cardOverrides.current[kind] ?? {};
      cardOverrides.current = { ...cardOverrides.current, [kind]: { ...prev, ...patch } };
      commit({ ...plan, [kind]: { ...plan[kind], ...patch } });
    },
    [plan, commit]
  );

  const addPhoto = useCallback(
    (img: PlannerImage) => {
      const scene = sceneForAddedPhoto(img, plan.scenes.length);
      commit({ ...plan, scenes: [...plan.scenes, scene], generatedBy: "manual" });
      setSelectedId(scene.id);
    },
    [plan, commit]
  );

  const usedImageIds = useMemo(() => new Set(plan.scenes.map((s) => s.imageId)), [plan.scenes]);
  const availableImages = useMemo(() => images.filter((i) => !usedImageIds.has(i.id)), [images, usedImageIds]);

  // null = "no music"; the choice survives regenerate via musicRef.
  const setMusic = useCallback(
    (patch: Partial<MusicConfig> | null) => {
      if (patch === null) {
        musicRef.current = { ...DEFAULT_MUSIC, trackId: null };
        commit({ ...plan, music: musicRef.current });
        return;
      }
      const next = { ...(plan.music ?? DEFAULT_MUSIC), ...patch };
      musicRef.current = next;
      commit({ ...plan, music: next });
    },
    [plan, commit]
  );

  // Attach the track's beat analysis and snap unlocked cuts; affects preview and export alike.
  const setBeatSync = useCallback(
    (strength: number) => {
      const trackId = plan.music?.trackId;
      const analysis = (trackId ? (MUSIC_ANALYSIS as Record<string, AudioAnalysis>)[trackId] : null) ?? null;
      commit(applyBeatSync({ ...plan, audio: analysis, beatSyncStrength: strength }));
    },
    [plan, commit]
  );

  return {
    plan,
    saveStatus,
    orderMode,
    selectedId,
    setSelectedId,
    selected: plan.scenes.find((s) => s.id === selectedId) ?? null,
    availableImages,
    canUndo,
    canRedo,
    undo,
    redo,
    regenerate,
    anotherVariation,
    resetToAuto,
    setGlobal,
    switchOrderMode,
    patchScene,
    moveScene,
    reorder,
    duplicateScene,
    removeScene,
    resetScene,
    toggleCollage,
    patchCard,
    addPhoto,
    setMusic,
    setBeatSync,
  };
}

export type StoryPlanApi = ReturnType<typeof useStoryPlan>;
