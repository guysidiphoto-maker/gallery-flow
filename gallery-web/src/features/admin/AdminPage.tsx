// Owner-only admin dashboard (/admin). The real security boundary is the `admin`
// edge function (JWT + ADMIN_USER_IDS allowlist); non-admins get 403 and see no data.
import { useAuth, signInWithGoogle } from '@/shared/lib/auth'
import { Button, Input, cn } from '@/shared/ui'
import { PAGE_SIZE, useAdminUsers } from './useAdminUsers'
import { AdminShell } from './components/AdminShell'
import { UsersTable } from './components/UsersTable'
import { AuditTable } from './components/AuditTable'
import { GrantCreditsModal } from './components/GrantCreditsModal'
import { btnGhost, btnPrimary, h1, input } from './components/adminStyles'

export function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const { rows, total, offset, search, setSearch, loading, denied, err, audit, load, grant, toast } =
    useAdminUsers(user, authLoading)

  if (authLoading) return <AdminShell><p className="text-muted">טוען…</p></AdminShell>
  if (!user) return (
    <AdminShell>
      <h1 className={h1}>ניהול</h1>
      <p className="mb-4 text-muted">נדרשת התחברות.</p>
      <Button className={btnPrimary} onClick={() => signInWithGoogle()}>התחברות</Button>
    </AdminShell>
  )
  if (denied) return (
    <AdminShell>
      <h1 className={h1}>אין הרשאה</h1>
      <p className="text-muted">החשבון שלך אינו מורשה לגשת לאזור הניהול.</p>
    </AdminShell>
  )

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <AdminShell>
      <h1 className={h1}>ניהול משתמשים</h1>

      {toast && (
        <div
          className={cn(
            'mb-4 rounded-sm border px-3.5 py-2.5 text-sm',
            toast.kind === 'ok' ? 'border-sage/40 bg-sage/10 text-sage' : 'border-danger/40 bg-danger/10 text-danger',
          )}
        >
          {toast.text}
        </div>
      )}

      <div className="mb-3.5 flex gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void load(0, search) }}
          placeholder="חיפוש לפי אימייל / שם עסק / מזהה"
          className={input}
        />
        <Button variant="ghost" className={btnGhost} onClick={() => void load(0, search)}>חיפוש</Button>
      </div>

      {err && <p className="mb-3 text-danger">{err}</p>}
      {loading ? <p className="text-muted">טוען…</p> : <UsersTable rows={rows} onGrant={grant.openGrant} />}

      <div className="mt-3 flex items-center gap-3 text-[13px] text-muted">
        <Button variant="ghost" className={btnGhost} disabled={offset === 0} onClick={() => void load(Math.max(offset - PAGE_SIZE, 0), search)}>הקודם</Button>
        <span>עמוד {page} מתוך {pages} · {total.toLocaleString('he-IL')} משתמשים</span>
        <Button variant="ghost" className={btnGhost} disabled={page >= pages} onClick={() => void load(offset + PAGE_SIZE, search)}>הבא</Button>
      </div>

      <h2 className={cn(h1, 'mt-10 text-xl')}>פעולות ניהול אחרונות</h2>
      <AuditTable audit={audit} />

      <GrantCreditsModal grant={grant} />
    </AdminShell>
  )
}
