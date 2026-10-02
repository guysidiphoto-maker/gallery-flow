# Supabase

| Folder | What it is |
|---|---|
| `migrations/` | The database schema, in order. Starts at `20261002000000_baseline.sql` (production's schema dumped 2026-10-03). Every change after it is a new file here. |
| `rollbacks/` | Hand-run undo scripts. Never put these in `migrations/` — the CLI applies every file there. |
| `migrations_archive/` | Pre-baseline migrations and production's old history, for reference only. |
| `functions/` | Edge functions. |
| `config.toml` | Local stack config (`supabase start`). |

## Changing the database

1. `npx supabase migration new <short_name>` → write the SQL in the new file.
2. Test it locally: `npx supabase start` builds a fresh database from `migrations/`;
   `npx supabase db reset` rebuilds it after edits.
3. Open a PR with the migration and the code that needs it.
4. After merging, apply it: `npx supabase migration list --linked` (check only the
   new file is pending), then `npx supabase db push --linked`.

Never change production by hand (SQL editor, dashboard, MCP) — that is how the
repo and production drifted apart before the baseline.
