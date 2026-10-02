-- Rollback for 087_face_index_cron_sweeper.sql
-- Stops the sweeper and drops its function. Leaves pg_net/pg_cron installed
-- (other things may use them; dropping extensions is out of scope here).

select cron.unschedule('sweep-face-indexing')
where exists (select 1 from cron.job where jobname = 'sweep-face-indexing');

drop function if exists public.sweep_stalled_face_indexing();
