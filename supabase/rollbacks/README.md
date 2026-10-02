# Rollbacks

Manual undo scripts for migrations, run by hand (SQL editor or psql) only when a
migration has to be reverted. They live outside `migrations/` on purpose: the
Supabase CLI applies every file in that folder, so a rollback there would run
right after the migration it is meant to undo.
