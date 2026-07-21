-- 087_face_index_cron_sweeper.sql
-- Durable reliability net for face indexing. Supabase edge self-continuation is
-- unreliable for large galleries, so a 1-minute cron sweeps any gallery stuck in
-- 'indexing' with a stale (>75s) heartbeat and re-kicks the rekognition function
-- (action index_kick, anon-authed, idempotent) to resume it until done.
--
-- Idempotent: extensions are IF NOT EXISTS; cron.schedule replaces a same-named
-- job. Rollback: 087_face_index_cron_sweeper_rollback.sql (unschedules + drops).

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.sweep_stalled_face_indexing()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  -- Public anon key (safe to embed). index_kick is gated to only resume
  -- genuinely-stalled indexing, so anon auth is sufficient.
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY';
begin
  for g in
    select id from public.galleries
    where face_index_status = 'indexing'
      and (face_indexed_at is null or face_indexed_at < now() - interval '75 seconds')
  loop
    perform net.http_post(
      url     := 'https://vlyiqfawkrjvqcmkpfvs.supabase.co/functions/v1/rekognition',
      body    := jsonb_build_object('action', 'index_kick', 'galleryId', g.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon
      )
    );
  end loop;
end;
$$;

revoke all on function public.sweep_stalled_face_indexing() from public, anon, authenticated;

-- Every minute. cron.schedule replaces a job of the same name (idempotent).
select cron.schedule(
  'sweep-face-indexing',
  '* * * * *',
  $cron$ select public.sweep_stalled_face_indexing() $cron$
);
