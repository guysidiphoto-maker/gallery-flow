# Migrations archive

The original migrations (002–115) plus the old `schema.sql` / `setup-storage.sql`.
They are history only — nothing runs them.

Production drifted from these files: from 041 on, changes were applied straight to
the database (recorded under timestamp versions, some never committed), so the
files here don't reproduce production. On 2026-10-03 production's schema was
dumped into `../migrations/20261003000000_baseline.sql`, which is the real
starting point. `production_history_2026-10-03.csv` is production's migration
history at that moment.
