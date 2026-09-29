/** Append a stylesheet <link> once per document (Google Fonts for the portfolio typefaces). */
export function ensureStylesheet(href: string) {
  if (typeof document === 'undefined' || document.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}
