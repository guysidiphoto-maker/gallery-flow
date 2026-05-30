/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SENTRY_DSN?: string
  /**
   * Phase 6 step 5 phase 2 cutover flag. When 'true', the public viewer
   * reads delivery_settings + sections from the gallery_revisions snapshot
   * referenced by galleries.published_revision_id instead of the live row.
   * Flipping this off instantly reverts to the legacy live read.
   */
  readonly VITE_USE_PUBLISHED_SNAPSHOT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
