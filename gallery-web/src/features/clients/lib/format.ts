export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'מעולם לא'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const day = 86_400_000
  if (diff < 0) return formatDate(iso)
  if (diff < 60_000) return 'הרגע'
  if (diff < 3_600_000) return `לפני ${Math.floor(diff / 60_000)} דק׳`
  if (diff < day) return `לפני ${Math.floor(diff / 3_600_000)} שע׳`
  if (diff < 7 * day) return `לפני ${Math.floor(diff / day)} ימים`
  return formatDate(iso)
}
