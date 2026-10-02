// Shared typography/blocks for the dark SEO landing + blog pages.
export const seo = {
  eyebrow: 'mb-[18px] text-[12px] font-semibold tracking-[0.16em] text-brand-soft uppercase',
  h1: 'mb-5 text-[clamp(32px,6vw,50px)] leading-[1.08] font-bold tracking-[-0.02em]',
  intro: 'mb-8 max-w-[640px] text-[clamp(17px,2.4vw,20px)] text-white/56',
  section: 'border-t border-white/8 py-10 first-of-type:border-t-0',
  h2: 'mb-[14px] text-[clamp(22px,3.4vw,28px)] leading-[1.2] font-bold tracking-[-0.01em]',
  body: 'text-[17px] text-white/56',
  muted: 'text-[16px] text-white/56',
  related: 'mt-2 flex flex-wrap gap-2.5',
  chip: 'inline-block rounded-full border border-white/8 bg-(--mk-night-card) px-4 py-[9px] text-[14px] text-(--mk-seo-ink) transition-[border-color] duration-150 hover:border-brand-soft',
}

export const BLOG_NAV = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
  { href: '/demo', label: 'Demo' },
]
