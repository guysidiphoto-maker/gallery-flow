// storyStudioApi.ts — client helpers the editor/Dashboard use to talk to the
// Story Studio endpoints. The access token is the Supabase session JWT
// (supabase.auth.getSession()); the server verifies gallery ownership from it.

import { stripForPersistence } from "./serverPlan";
import type { ScenePlan } from "./sceneplan";

export interface DraftResponse {
  scenePlan: ScenePlan | null;
  title: string | null;
  savedAt: string | null;
}

/** Load the autosaved Story Studio draft for a gallery (owner only). */
export async function loadDraft(galleryId: string, accessToken: string): Promise<DraftResponse> {
  const res = await fetch(`/api/stories/draft?galleryId=${encodeURIComponent(galleryId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`loadDraft failed: ${res.status}`);
  return (await res.json()) as DraftResponse;
}

/** Persist the current plan as the gallery's autosaved draft (owner only). */
export async function saveDraft(
  galleryId: string,
  plan: ScenePlan,
  accessToken: string,
  title?: string
): Promise<void> {
  const res = await fetch(`/api/stories/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    // Send a persistence-clean plan (no volatile src / dev _reason).
    body: JSON.stringify({ galleryId, scenePlan: stripForPersistence(plan), title }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`saveDraft failed: ${res.status} ${JSON.stringify(detail)}`);
  }
}

export interface RenderStart {
  ok: boolean;
  renderId?: string;
  status?: string;
  outputUrl?: string;
  posterUrl?: string;
  error?: string;
  message?: string;
  details?: string[];
}

/** Submit an edited ScenePlan to the render endpoint (server validates it). */
export async function requestStudioRender(
  galleryId: string,
  plan: ScenePlan,
  accessToken: string
): Promise<RenderStart> {
  const res = await fetch(`/api/stories/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ galleryId, scenePlan: stripForPersistence(plan) }),
  });
  const data = (await res.json().catch(() => ({}))) as RenderStart;
  return { ...data, ok: res.ok && data.ok !== false };
}

/**
 * Cancel the in-flight studio render for a gallery (cooperative — the running
 * render discards its artifacts when it sees the row is no longer 'rendering').
 * Safe to call even if nothing is in flight (returns cancelled:false).
 */
export async function cancelRender(
  galleryId: string,
  accessToken: string,
  renderId?: string
): Promise<{ ok: boolean; cancelled: boolean }> {
  const res = await fetch(`/api/stories/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ galleryId, renderId }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; cancelled?: boolean };
  return { ok: res.ok && data.ok !== false, cancelled: Boolean(data.cancelled) };
}

export interface RenderStatus {
  status: "queued" | "rendering" | "ready" | "failed" | "completed";
  outputUrl?: string;
  error?: string;
}

/** Poll a render's status (used when the POST returns an in-flight renderId). */
export async function getRenderStatus(renderId: string, accessToken: string): Promise<RenderStatus> {
  const res = await fetch(`/api/stories/status?renderId=${encodeURIComponent(renderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`status failed: ${res.status}`);
  return (await res.json()) as RenderStatus;
}

/**
 * Wire this into the editor via `onSave`. Debounce lives in the editor; this just
 * fires the request. Example (Dashboard):
 *   const token = (await supabase.auth.getSession()).data.session?.access_token
 *   <StoryStudioEditor onSave={(plan) => saveDraft(galleryId, plan, token!)} ... />
 */
export function makeAutosave(galleryId: string, getToken: () => Promise<string | null>) {
  return async (plan: ScenePlan) => {
    const token = await getToken();
    if (!token) return;
    await saveDraft(galleryId, plan, token);
  };
}
