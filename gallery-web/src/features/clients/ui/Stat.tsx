export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-s border-line px-[22px] py-5">
      <div className="mb-2.5 text-[10px] font-medium tracking-[0.16em] text-muted uppercase">{label}</div>
      <div className="text-2xl leading-none font-normal tracking-[-0.02em] text-ink">{value.toLocaleString('he-IL')}</div>
    </div>
  )
}
