# gallery-web — conventions

Pixflow web app: public gallery viewer, photographer dashboard, client portal and
marketing site. Vite + React 18 SPA, Vercel functions in `api/`, Supabase backend.

## Layout

```
src/
  main.tsx              entry: Sentry/analytics init + render
  app/                  App (route → lazy page), routes.ts (URL matching), ErrorBoundary
  styles/               index.css (entry), tokens.css (design tokens), base.css, legacy.css (being retired)
  shared/
    ui/                 design-system primitives (Button, Field, Modal, Toggle, Panel, Icon, cn …)
    lib/                framework-level helpers (supabase client, auth, storage signing, analytics, hooks)
    i18n/               locale dictionaries + hooks (owner, portal, viewer)
    gallery/            gallery domain logic shared by viewer + dashboard (branding, layout, presets, schema)
    types.ts            shared domain types (DB rows)
  features/<name>/      one folder per product area; owns its pages, components, hooks and lib
api/                    Vercel functions (never import from src/ except story-studio core)
server/                 helpers for api/: env.ts (Supabase URL/keys), supabase.ts (serviceClient/anonClient),
                        origin.ts (isAllowedOrigin), ownerAuth.ts, sentryServer.ts …
```

Rules:
- A feature may import from `shared/*` and its own folder. Importing another feature is a smell —
  move the shared piece to `shared/` instead.
- Cross-area imports use the `@/` alias (`@/shared/ui`); imports inside a feature are relative.
- One component per file. Page = `XxxPage.tsx`. Data/logic in hooks (`useXxx.ts`) or `lib/`, not in JSX files.
- Never define components inside another component's render (they remount every render).
- Aim for files under ~300 lines; split by tab/section/sub-component when larger.
- `src/features/story-studio/{sceneplan,planner}.ts` are also imported by `story-studio-remotion/`,
  `scripts/` and `api/` — keep them relative-import-only and free of DOM/React.

## Styling — Tailwind v4 + tokens

- Style with Tailwind utility classes. Tokens live in `src/styles/tokens.css` (`@theme`); every token is a
  utility: `bg-canvas`, `bg-surface`, `bg-raised`, `text-ink`, `text-ink-soft`, `text-muted`, `border-line`,
  `bg-sage`, `text-danger`, `bg-night`, `text-brand`, `rounded-hair`, `shadow-card`, `tracking-label`,
  `text-eyebrow`, `font-display`, `ease-out-expo` …
- **No hex/rgb literals in components.** Need a new color? Add a token to `tokens.css` first.
  Opacity via modifiers: `bg-ink/10`, `text-white/60`.
- The default Tailwind palette is disabled (`--color-*: initial`) — `bg-red-500` does not exist on purpose.
- Gallery viewer colors are per-gallery runtime values: use `bg-gallery`, `text-gallery-text`,
  `text-gallery-muted`, `bg-gallery-accent`, `font-gallery-heading` (backed by CSS vars set on `<html>`).
- `style={{}}` is only for truly dynamic values (computed sizes/positions, a user-picked color).
  Prefer passing them as CSS variables: `style={{ '--cols': n }}` + `grid-cols-[repeat(var(--cols),1fr)]`.
- No `onMouseEnter/onMouseLeave` style mutation — use `hover:`, `focus-visible:`, `group-hover:`.
- Compose classes with `cn()` from `@/shared/ui` (clsx + tailwind-merge).
- Use `shared/ui` primitives (Button, Input/Field, Modal, Toggle/ToggleRow, Panel/PageHeading, PageLoader)
  before writing a new one-off.
- The UI is mostly RTL (Hebrew). Use logical utilities: `ms-/me-/ps-/pe-/start-/end-/text-start`,
  and `rtl:` variants for transforms.
- Tailwind preflight is on: headings/buttons/lists have no default styles and `img` is `display:block`.
  State sizes/weights explicitly.
- Keyframes and genuinely complex selectors go in `tokens.css` (`--animate-*`) or a feature `*.css` file
  imported by that feature — never global hacks.

## Comments

- 1–3 lines, explain **why**, not what. No changelogs, phase names, PR/ticket numbers or dates.
- Doc comments on exported functions only when the name isn't enough.

## Checks

```sh
npx tsc --noEmit -p .                                    # types (src)
npm run build                                           # production bundle
for t in tests/*.test.ts src/features/story-studio/*.test.ts; do npx tsx $t || echo "FAIL $t"; done
```
`tests/api-error-hygiene.test.ts` needs Node 24: `npx -y -p node@24 node --import tsx tests/api-error-hygiene.test.ts`.

## Don'ts

- Don't change behavior while restructuring: same data calls, same URLs, same copy.
- Don't remove or redirect legacy URLs (`/home-legacy`, `/gallery/:id`, `/:biz/gallery/:id`, `?section=`,
  `/client/:id/dashboard` PIN login) without asking the owner first.
