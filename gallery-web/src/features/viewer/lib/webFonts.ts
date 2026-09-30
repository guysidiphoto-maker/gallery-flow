// The /gallery/:id share bootstrap loads only a few Google Fonts, so a gallery's
// picked font can be missing there. Add a stylesheet for any family not yet linked.
const GOOGLE_FAMILIES = new Set([
  'Inter', 'Inter Tight', 'Noto Sans Hebrew', 'Heebo', 'Noto Serif', 'Cormorant Garamond', 'Playfair Display',
])

export function ensureWebFonts(stacks: string[]): void {
  for (const stack of stacks) {
    for (const raw of stack.split(',')) {
      const name = raw.trim().replace(/^['"]|['"]$/g, '')
      if (!GOOGLE_FAMILIES.has(name)) continue
      const family = name.replace(/ /g, '+')
      if (document.querySelector(`link[href*="family=${family}:"], link[href*="family=${family}&"]`)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }
}
