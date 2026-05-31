#!/usr/bin/env node
// Render the branded share-email template against a representative brand
// kit and write the result to docs/email-preview-sample.html. The output is
// what a human opens in a browser to verify spacing, colors, and copy
// before we ship a template change. Runs under Node 22+ via the built-in
// strip-types loader so we share the exact same template module the edge
// function loads in Deno (single source of truth).

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const templatePath = resolve(repoRoot, 'supabase/functions/share-gallery/template.ts')

const { composeShareEmail } = await import(pathToFileURL(templatePath).href)

const sample = composeShareEmail({
  galleryName:   'יוסי ושני · החתונה',
  galleryUrl:    'https://pixflow-ai.com/gallery/sample-001',
  coverImageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1120&q=80',
  studioName:    'Eclipse Media',
  studioBrand: {
    logo:   { url: 'https://dummyimage.com/200x80/141413/F7F4EE&text=ECLIPSE' },
    colors: { primary: '#B45309', ink: '#141413' },
    voice:  {
      tagline:   'תיעוד אמיתי. רגעים שאי-אפשר לביים.',
      signature: 'גיא · Eclipse Media',
      language:  'he',
    },
    social: {
      instagram: 'https://instagram.com/eclipse.media',
      website:   'https://eclipse-media.co.il',
      email:     'studio@eclipse-media.co.il',
    },
  },
  customMessage: 'תודה רבה על האירוע המהמם.\nהגלריה מוכנה — תהנו!',
})

const outPath = resolve(repoRoot, 'docs/email-preview-sample.html')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, sample.html, 'utf8')

console.log(`subject: ${sample.subject}`)
console.log(`branded: ${sample.branded}`)
console.log(`html bytes: ${sample.html.length}`)
console.log(`text bytes: ${sample.text.length}`)
console.log(`wrote: ${outPath}`)

// Smoke-check the fallback path. If the photographer hasn't filled in a
// brand kit the composer must fall back to the legacy plain template so
// existing accounts keep working — assert that here so the contract is
// captured outside of unit tests.
const fallback = composeShareEmail({
  galleryName: 'Untitled gallery',
  galleryUrl:  'https://pixflow-ai.com/gallery/empty-001',
  studioName:  'Untitled Studio',
  studioBrand: null,
})
if (fallback.branded) {
  console.error('FAIL: fallback path rendered as branded')
  process.exit(1)
}
console.log(`fallback branded: ${fallback.branded} (expected false)`)
console.log(`fallback subject: ${fallback.subject}`)
