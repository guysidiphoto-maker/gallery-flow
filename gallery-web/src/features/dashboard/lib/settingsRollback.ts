type Settings = Record<string, unknown>

/**
 * Undoes a failed optimistic patch key by key: each patched key goes back to
 * its value in `prev` (or is removed if it was absent), but only while it still
 * holds the optimistic value, so a later write to the same key or a concurrent
 * write to another key survives. Returns `current` itself when nothing changes.
 */
export function rollbackSettingsPatch(current: Settings, prev: Settings, patch: Settings): Settings {
  let next: Settings | null = null
  for (const key of Object.keys(patch)) {
    if (!Object.is(current[key], patch[key])) continue
    next ??= { ...current }
    if (Object.prototype.hasOwnProperty.call(prev, key)) next[key] = prev[key]
    else delete next[key]
  }
  return next ?? current
}
