# gallery-web

Pixflow public gallery + photographer dashboard (Vite + React).

## Operator notes

### `react-window` dependency (perf/web-grid-virtualization-and-batch-reorder)

This branch adds `react-window` (+ `@types/react-window`) for masonry/grid
virtualization on galleries with more than 300 photos. The package was added
to `package.json` but **not installed**. Run:

```sh
npm install react-window
npm install --save-dev @types/react-window
```

(or `npm install` to pick both up from the manifest).

Without the install the dev/build will fail with `Cannot find module
'react-window'` — the code is gated to only mount virtualization when
`images.length > 300`, but the import is unconditional.

### `reorder_images` RPC (migration 070)

Migration `supabase/migrations/070_reorder_images_rpc.sql` defines a
SECURITY DEFINER RPC that replaces the previous N-parallel-UPDATE fan-out
in `Dashboard.tsx`'s `reorderImage`. Apply it via the Supabase MCP, the
Supabase CLI (`supabase db push`), or the SQL editor before deploying the
client changes — otherwise drag-reorder will fail with "function does not
exist".
