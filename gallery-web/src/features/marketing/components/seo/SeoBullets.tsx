/** Dotted bullet list (physical left gutter, matching the server-rendered page). */
export function SeoBullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-2">
      {items.map((b, i) => (
        <li
          key={i}
          className="relative my-3 pl-[26px] text-[17px] text-(--mk-seo-ink) before:absolute before:top-[11px] before:left-1 before:size-[7px] before:rounded-full before:bg-brand-soft"
        >
          {b}
        </li>
      ))}
    </ul>
  )
}
