// Supabase Storage objects (uploads, deletes, authenticated downloads). Bucket
// policies key on the `{business}/{galleryId}/...` path, so only the owner can write.

import { supabase } from '@/shared/lib/supabase'

type UploadOptions = { upsert?: boolean; contentType?: string; cacheControl?: string }

/** Uploads `body` to `bucket/path` with the given options, passed through as-is. */
export async function uploadStorageObject(bucket: string, path: string, body: Blob | File, options: UploadOptions) {
  return supabase.storage.from(bucket).upload(path, body, options)
}

/** Deletes objects from a bucket (at most ~1000 paths per call). */
export async function removeStorageObjects(bucket: string, paths: string[]) {
  return supabase.storage.from(bucket).remove(paths)
}

/** Downloads an object as a Blob with the signed-in owner's rights (works for private objects). */
export async function downloadStorageObject(bucket: string, path: string) {
  return supabase.storage.from(bucket).download(path)
}
