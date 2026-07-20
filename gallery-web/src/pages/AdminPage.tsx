// Owner-only admin dashboard (/admin). The real security boundary is the
// `admin` Edge Function (JWT + ADMIN_USER_IDS allowlist) — this page just calls
// it. A non-admin gets 403 from the server and sees the access-denied state; no
// privileged data is ever exposed to a non-admin browser.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth, signInWithGoogle } from '../lib/auth'

const PAGE_SIZE = 25

type UserRow = {
  business_id: string
  email: string | null
  business_name: string
  slug: string | null
  created_at: string | null
  plan_id: string | null
  plan_name: string | null
  subscription_status: string | null
  balance: number
  gallery_count: number
}
type GrantRow = {
  ledger_id: string
  business_id: string
  business_name: string | null
  amount: number
  admin_email: string | null
  reason: string | null
  request_id: string | null
  created_at: string
}

// Read the status + JSON body from a supabase-js FunctionsHttpError.
async function invokeAdmin(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } })
  if (error) {
    let status = 0, detail = ''
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.status === 'number') {
      status = ctx.status
      try { detail = JSON.stringify(await ctx.json()) } catch { /* ignore */ }
    }
    return { data: null, status, detail, error }
  }
  return { data, status: 200, detail: '', error: null }
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—')

export function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [denied, setDenied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [audit, setAudit] = useState<GrantRow[]>([])

  // Grant modal state
  const [target, setTarget] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [granting, setGranting] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Stable request id per open modal → retries/double-clicks are idempotent.
  const requestIdRef = useRef<string>('')

  const load = useCallback(async (nextOffset: number, nextSearch: string) => {
    setLoading(true); setErr(null)
    const { data, status, detail } = await invokeAdmin('list_users', { search: nextSearch, limit: PAGE_SIZE, offset: nextOffset })
    setLoading(false)
    if (status === 403) { setDenied(true); return }
    if (status === 401) { setErr('נא להתחבר מחדש.'); return }
    if (!data) { setErr('שגיאה בטעינת המשתמשים.' + (detail ? ` (${detail})` : '')); return }
    const d = data as { rows: UserRow[]; total: number }
    setRows(d.rows); setTotal(d.total); setOffset(nextOffset)
  }, [])

  const loadAudit = useCallback(async () => {
    const { data } = await invokeAdmin('recent_grants', { limit: 50 })
    if (data) setAudit((data as { rows: GrantRow[] }).rows)
  }, [])

  useEffect(() => {
    if (authLoading || !user) return
    void load(0, '')
    void loadAudit()
  }, [authLoading, user, load, loadAudit])

  const amountNum = useMemo(() => Number(amount), [amount])
  const amountValid = Number.isInteger(amountNum) && amountNum > 0 && amountNum <= 1_000_000

  function openGrant(row: UserRow) {
    setTarget(row); setAmount(''); setReason(''); setToast(null)
    requestIdRef.current = crypto.randomUUID()
  }

  async function confirmGrant() {
    if (!target || !amountValid || granting) return
    setGranting(true); setToast(null)
    const { data, status, detail } = await invokeAdmin('grant_credits', {
      business_id: target.business_id, amount: amountNum, reason, request_id: requestIdRef.current,
    })
    setGranting(false)
    if (status === 403) { setToast({ kind: 'err', text: 'אין לך הרשאת מנהל.' }); return }
    if (!data) { setToast({ kind: 'err', text: 'הענקת הקרדיטים נכשלה.' + (detail ? ` (${detail})` : '') }); return }
    const res = data as { granted: boolean; duplicate: boolean; balance: number }
    // Only trust the server-confirmed balance.
    setRows(prev => prev.map(r => r.business_id === target.business_id ? { ...r, balance: res.balance } : r))
    setToast({ kind: 'ok', text: res.duplicate
      ? `הבקשה כבר בוצעה קודם (ללא חיוב כפול). היתרה: ${res.balance.toLocaleString('he-IL')} קרדיטים.`
      : `הוענקו ${amountNum.toLocaleString('he-IL')} קרדיטים. יתרה חדשה: ${res.balance.toLocaleString('he-IL')}.` })
    setTarget(null)
    void loadAudit()
  }

  // ── render ──────────────────────────────────────────────────────────────
  if (authLoading) return <Shell><p style={{ color: '#767470' }}>טוען…</p></Shell>
  if (!user) return (
    <Shell>
      <h1 style={h1}>ניהול</h1>
      <p style={{ color: '#767470', marginBottom: 16 }}>נדרשת התחברות.</p>
      <button style={btnPrimary} onClick={() => signInWithGoogle()}>התחברות</button>
    </Shell>
  )
  if (denied) return (
    <Shell>
      <h1 style={h1}>אין הרשאה</h1>
      <p style={{ color: '#767470' }}>החשבון שלך אינו מורשה לגשת לאזור הניהול.</p>
    </Shell>
  )

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Shell>
      <h1 style={h1}>ניהול משתמשים</h1>

      {toast && (
        <div style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 6, fontSize: 14,
          background: toast.kind === 'ok' ? '#ECFDF3' : '#FEF3F2', color: toast.kind === 'ok' ? '#067647' : '#B42318',
          border: `1px solid ${toast.kind === 'ok' ? '#ABEFC6' : '#FECDCA'}` }}>{toast.text}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void load(0, search) }}
          placeholder="חיפוש לפי אימייל / שם עסק / מזהה" style={input} />
        <button style={btnGhost} onClick={() => void load(0, search)}>חיפוש</button>
      </div>

      {err && <p style={{ color: '#B42318', marginBottom: 12 }}>{err}</p>}
      {loading ? <p style={{ color: '#767470' }}>טוען…</p> : (
        <div style={{ overflowX: 'auto', border: '1px solid #E4E4E4', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#FAF9F5', textAlign: 'right' }}>
                {['אימייל','שם עסק','מזהה עסק','נרשם','מסלול','סטטוס','גלריות','יתרה','פעולה'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.business_id} style={{ borderTop: '1px solid #EEE' }}>
                  <td style={td}>{r.email ?? '—'}</td>
                  <td style={td}>{r.business_name}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#767470' }}>{r.business_id}</td>
                  <td style={td}>{fmtDate(r.created_at)}</td>
                  <td style={td}>{r.plan_name ?? r.plan_id ?? '—'}</td>
                  <td style={td}>{r.subscription_status ?? '—'}</td>
                  <td style={td}>{r.gallery_count}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.balance.toLocaleString('he-IL')}</td>
                  <td style={td}><button style={btnSmall} onClick={() => openGrant(r)}>הענקת קרדיטים</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td style={td} colSpan={9}>לא נמצאו משתמשים.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 13, color: '#767470' }}>
        <button style={btnGhost} disabled={offset === 0} onClick={() => void load(Math.max(offset - PAGE_SIZE, 0), search)}>הקודם</button>
        <span>עמוד {page} מתוך {pages} · {total.toLocaleString('he-IL')} משתמשים</span>
        <button style={btnGhost} disabled={page >= pages} onClick={() => void load(offset + PAGE_SIZE, search)}>הבא</button>
      </div>

      {/* Audit */}
      <h2 style={{ ...h1, fontSize: 20, marginTop: 40 }}>פעולות ניהול אחרונות</h2>
      <div style={{ overflowX: 'auto', border: '1px solid #E4E4E4', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#FAF9F5', textAlign: 'right' }}>
            {['תאריך','עסק','כמות','מנהל','סיבה','מזהה בקשה'].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {audit.map(g => (
              <tr key={g.ledger_id} style={{ borderTop: '1px solid #EEE' }}>
                <td style={td}>{new Date(g.created_at).toLocaleString('he-IL')}</td>
                <td style={td}>{g.business_name ?? g.business_id}</td>
                <td style={{ ...td, fontWeight: 600 }}>+{g.amount.toLocaleString('he-IL')}</td>
                <td style={td}>{g.admin_email ?? '—'}</td>
                <td style={td}>{g.reason || '—'}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 10, color: '#767470' }}>{g.request_id}</td>
              </tr>
            ))}
            {audit.length === 0 && <tr><td style={td} colSpan={6}>אין פעולות עדיין.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Grant modal */}
      {target && (
        <div onClick={() => !granting && setTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} dir="rtl" style={{ background: '#fff', borderRadius: 10, padding: 28, width: 'min(92vw, 440px)', border: '1px solid #E4E4E4' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>הענקת קרדיטים</h3>
            <p style={{ color: '#767470', fontSize: 13, margin: '0 0 18px' }}>
              {target.business_name} · יתרה נוכחית: <strong>{target.balance.toLocaleString('he-IL')}</strong> קרדיטים
            </p>
            <label style={lbl}>כמות קרדיטים (מספר חיובי שלם)</label>
            <input type="number" min={1} step={1} value={amount} onChange={e => setAmount(e.target.value)} style={input} autoFocus />
            {!amountValid && amount !== '' && <p style={{ color: '#B42318', fontSize: 12, margin: '4px 0 0' }}>יש להזין מספר שלם חיובי עד 1,000,000.</p>}
            <label style={{ ...lbl, marginTop: 14 }}>סיבה פנימית (רשות)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="לדוגמה: חשבון בדיקה / חבר" style={input} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button style={btnGhost} disabled={granting} onClick={() => setTarget(null)}>ביטול</button>
              <button style={{ ...btnPrimary, opacity: amountValid && !granting ? 1 : 0.5 }} disabled={!amountValid || granting} onClick={() => void confirmGrant()}>
                {granting ? 'מעניק…' : `אישור והענקה`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#F2EFE9', color: '#141413', fontFamily: 'system-ui, sans-serif', padding: '32px clamp(16px, 4vw, 48px)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

const h1: React.CSSProperties = { fontSize: 26, fontWeight: 700, margin: '0 0 18px', letterSpacing: '-0.02em' }
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12, color: '#767470', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const input: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #D0D0D0', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#767470', marginBottom: 6 }
const btnPrimary: React.CSSProperties = { background: '#141413', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#141413', border: '1px solid #D0D0D0', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
const btnSmall: React.CSSProperties = { background: '#141413', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
