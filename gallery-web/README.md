# gallery-web

Pixflow on the web: the public gallery viewer, the photographer dashboard, the client
portal and the marketing site. Vite + React 18 + Tailwind v4, deployed on Vercel, backed
by Supabase (Postgres, Auth, Storage, Edge Functions).

## Run it

```sh
npm install
npm run dev          # http://localhost:5173 — talks to the PRODUCTION Supabase project
```

- There is no `.env` in the repo; without `VITE_SUPABASE_URL` the app uses production.
  Anything you create, upload or delete locally is real data.
- `npm run dev` does not run the Vercel functions in `api/`. Signed image URLs, watermarked
  and ZIP downloads, client invites, the importer and story rendering need `vercel dev`
  (`vercel link` + `vercel env pull` first).
- Local feature flags go in `.env.local` (gitignored), e.g. `VITE_FEATURE_GALLERY_BILLING=true`.

## Where things are

| Path | What |
|---|---|
| `src/app/` | App shell: `routes.ts` (URL → page), lazy page map, error boundary |
| `src/features/<area>/` | One folder per product area: `viewer`, `dashboard`, `client-portal`, `marketing`, `brand-kit`, `clients`, `importer`, `portfolio`, `story-studio`, … |
| `src/shared/data/` | Every Supabase read/write, as plainly named functions — start with its README |
| `src/shared/ui/` | Design-system primitives (Button, Field, Modal, Toggle, WorkspaceView, …) |
| `src/shared/gallery/` | Gallery rules shared by viewer + dashboard (branding, layout, presets, settings schema) |
| `src/styles/tokens.css` | Design tokens — every color/font/radius is a Tailwind utility |
| `api/`, `server/` | Vercel functions and their helpers (service-role Supabase, origin checks, SMS) |
| `seo/` | Server-rendered marketing/blog content |
| `stories-remotion/`, `story-studio-remotion/` | Remotion compositions bundled for server-side story rendering |

Conventions (styling, imports, comments) are in [`CLAUDE.md`](./CLAUDE.md).

## Checks

```sh
npx tsc --noEmit -p .
npm run build
for t in tests/*.test.ts src/features/story-studio/*.test.ts; do npx tsx $t || echo "FAIL $t"; done
npx -y -p node@24 node --import tsx tests/api-error-hygiene.test.ts
npm run test:e2e     # Playwright smoke suite (needs E2E_* env, see tests/README.md)
```

## Deploys

Every push to a branch creates a Vercel preview; merging to `main` deploys production.
Database changes are migrations in `../supabase/migrations/` applied with the Supabase CLI.
