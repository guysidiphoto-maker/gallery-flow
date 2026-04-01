import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function storageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}
