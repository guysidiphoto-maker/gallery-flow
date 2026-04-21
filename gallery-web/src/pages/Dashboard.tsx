import React, { useState, useEffect, useRef } from 'react'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import { supabase } from '../supabase'

interface Gallery {
  id: string
  name: string
  image_count: number
  published_at: string | null
  status: string
}

const accent = '#6366f1'
const bg = '#07070d'
const card = '#111118'
const border = '#1e1e2a'
const textPrimary = '#f1f1f4'
const textSecondary = '#9ca3af'

export function Dashboard() {
  const { user, loading } = useAuth()
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [loadingGalleries, setLoadingGalleries] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchGalleries()
  }, [user])

  async function fetchGalleries() {
    setLoadingGalleries(true)
    const { data } = await supabase
      .from('galleries')
      .select('id, name, image_count, published_at, status')
      .eq('business_id', user!.id)
      .order('created_at', { ascending: false })
    setGalleries(data ?? [])
    setLoadingGalleries(false)
  }

  async function createGallery() {
    if (!newName.trim()) return
    setCreating(true)
    await supabase.from('galleries').insert({
      name: newName.trim(),
      event_date: newDate || null,
      business_id: user!.id,
      status: 'draft',
      image_count: 0,
    })
    setCreating(false)
    setShowModal(false)
    setNewName('')
    setNewDate('')
    fetchGalleries()
  }

  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: textSecondary, fontSize: 16, fontFamily: 'Inter, sans-serif' }}>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', direction: 'rtl' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📸</div>
          <h1 style={{ color: textPrimary, fontSize: 28, fontWeight: 700, marginBottom: 12 }}>ברוכים הבאים ל-Pixflow</h1>
          <p style={{ color: textSecondary, fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>התחברו כדי לנהל את הגלריות שלכם</p>
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#fff', color: '#333', border: 'none', borderRadius: 12,
              padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.08 24.08 0 000 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            התחברות עם Google
          </button>
        </div>
      </div>
    )
  }

  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email

  return (
    <div style={{ background: bg, minHeight: '100vh', fontFamily: 'Inter, sans-serif', direction: 'rtl', color: textPrimary }}>
      {/* Top bar */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: `1px solid ${border}`, background: '#0a0a12',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {avatar && (
            <img src={avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${border}` }} />
          )}
          <span style={{ fontSize: 15, fontWeight: 500 }}>{displayName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: textSecondary, textDecoration: 'none', fontSize: 14 }}>Pixflow</a>
          <button
            onClick={signOut}
            style={{
              background: 'transparent', border: `1px solid ${border}`, borderRadius: 8,
              color: textSecondary, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            התנתקות
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>הגלריות שלי</h1>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: accent, color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            + גלריה חדשה
          </button>
        </div>

        {loadingGalleries ? (
          <div style={{ textAlign: 'center', padding: 60, color: textSecondary }}>טוען גלריות...</div>
        ) : galleries.length === 0 ? (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 20, opacity: 0.6 }}>🖼️</div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12, color: textPrimary }}>אין גלריות עדיין</h2>
            <p style={{ color: textSecondary, fontSize: 15, marginBottom: 28 }}>צרו את הגלריה הראשונה שלכם ושתפו תמונות עם הלקוחות</p>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: `linear-gradient(135deg, ${accent}, #818cf8)`, color: '#fff',
                border: 'none', borderRadius: 14, padding: '16px 40px', fontSize: 17,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              צור גלריה חדשה
            </button>
          </div>
        ) : (
          /* Gallery grid */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {galleries.map((g) => (
              <div
                key={g.id}
                style={{
                  background: card, borderRadius: 14, padding: 24,
                  border: `1px solid ${border}`, transition: 'border-color .2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{g.name}</h3>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                    background: g.status === 'published' ? 'rgba(34,197,94,.15)' : 'rgba(250,204,21,.12)',
                    color: g.status === 'published' ? '#22c55e' : '#facc15',
                  }}>
                    {g.status === 'published' ? 'פורסם' : 'טיוטה'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 13, color: textSecondary }}>
                  <span>{g.image_count ?? 0} תמונות</span>
                  {g.published_at && (
                    <span>{new Date(g.published_at).toLocaleDateString('he-IL')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create gallery modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: card, borderRadius: 18, padding: 36, width: '90%', maxWidth: 420,
              border: `1px solid ${border}`, direction: 'rtl',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 0, marginBottom: 24, color: textPrimary }}>יצירת גלריה חדשה</h2>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: textSecondary, display: 'block', marginBottom: 6 }}>שם הגלריה</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: החתונה של יוסי ומיכל"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${border}`,
                  background: bg, color: textPrimary, fontSize: 14, fontFamily: 'Inter, sans-serif',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 28 }}>
              <span style={{ fontSize: 13, color: textSecondary, display: 'block', marginBottom: 6 }}>תאריך אירוע</span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${border}`,
                  background: bg, color: textPrimary, fontSize: 14, fontFamily: 'Inter, sans-serif',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={createGallery}
                disabled={creating || !newName.trim()}
                style={{
                  flex: 1, background: accent, color: '#fff', border: 'none', borderRadius: 10,
                  padding: '12px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', opacity: creating || !newName.trim() ? 0.5 : 1,
                }}
              >
                {creating ? 'יוצר...' : 'צור גלריה'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, background: 'transparent', color: textSecondary, border: `1px solid ${border}`,
                  borderRadius: 10, padding: '12px 0', fontSize: 15, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
