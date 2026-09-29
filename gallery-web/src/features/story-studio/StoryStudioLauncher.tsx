// Story Studio as mounted from the dashboard: restores the autosaved draft, hosts
// the editor, and drives render → progress → download/retry. The dashboard maps
// gallery rows to PlannerImage[] and resolves the brand before mounting this.

import { useMemo } from "react";
import { StoryStudioEditor } from "./StoryStudioEditor";
import type { PlannerImage } from "./planner";
import type { BrandResolved } from "./sceneplan";
import { LauncherBar } from "./launcher/LauncherBar";
import { SelectionScreen } from "./launcher/SelectionScreen";
import { useStudioSession } from "./launcher/useStudioSession";

export interface StoryStudioLauncherProps {
  galleryId: string;
  images: PlannerImage[];
  brand: BrandResolved;
  event?: { title?: string; date?: string; location?: string };
  /** Returns the current Supabase access token (session JWT). */
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

export function StoryStudioLauncher({ galleryId, images, brand, event, getToken, onClose }: StoryStudioLauncherProps) {
  const session = useStudioSession(galleryId, getToken);
  const { loading, phase, initialPlan, selectedIds, handleSave, handlePlanChange } = session;

  // Memoized so render-state updates in the bar don't re-render the editor.
  const editor = useMemo(
    () => (
      <StoryStudioEditor
        images={images}
        brand={brand}
        event={event}
        galleryId={galleryId}
        initialPlan={initialPlan}
        selectedIds={selectedIds}
        onSave={handleSave}
        onPlanChange={handlePlanChange}
      />
    ),
    [images, brand, event, galleryId, initialPlan, selectedIds, handleSave, handlePlanChange]
  );

  return (
    <div dir="rtl" className="fixed inset-0 z-[9999] flex flex-col bg-studio">
      <LauncherBar session={session} onClose={onClose} />
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-studio-muted">טוען את הסטורי…</div>
        ) : phase === "select" ? (
          <SelectionScreen images={images} onCreate={session.startEditing} />
        ) : (
          editor
        )}
      </div>
    </div>
  );
}
