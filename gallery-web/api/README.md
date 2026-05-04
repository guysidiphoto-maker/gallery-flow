# gallery-web Vercel functions

Each `.ts` / `.tsx` file in this folder becomes a Vercel function deployed
alongside the SPA.

## Share-link previews

When a guest forwards a `/gallery/<uuid>` URL in WhatsApp / iMessage / Slack /
Telegram / etc., the messenger fetches the URL with a crawler User-Agent.
Without server-rendered meta tags the SPA shell loads and the preview falls
back to the favicon — generic and unbranded.

The flow:

1. **Vercel rewrite** (`vercel.json`) sends `/gallery/:id` to `/api/share`,
   sends `/:slug/gallery/:id` and `/:business/:gallery` to `/api/gallery-page`.
2. **`api/share.ts`** (Node runtime) and **`api/gallery-page.ts`** sniff the
   User-Agent against `WhatsApp|facebookexternalhit|Twitterbot|...`. Real
   browsers receive the SPA bootstrap shell that resolves the latest Vite
   bundle and mounts the React app — exactly what `/index.html` would have
   served. Crawlers receive a tiny HTML page whose `<head>` carries the
   correct `og:title`, `og:description`, and `og:image`.
3. **`api/og.tsx`** (Edge runtime, `@vercel/og`) generates the preview image
   itself: 1200x630, dark background, gallery cover as a soft backdrop,
   gallery title + studio name + photo count overlaid, Pixflow wordmark in
   the corner. On any failure it returns a generic Pixflow card — never a
   500, because a broken share preview is worse than a plain logo.

## Testing

After a deploy, paste `https://pixflow-ai.com/gallery/<live-gallery-id>` into
WhatsApp / Slack / Twitter / iMessage / Discord and confirm the rich preview
appears with the gallery name and a branded image.

To preview the OG card directly in a browser:
`https://pixflow-ai.com/api/og?gallery=<live-gallery-id>`.
