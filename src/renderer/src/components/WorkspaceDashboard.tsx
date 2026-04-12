import React, { useState, useEffect, useMemo, useRef } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ProjectData, ClientData } from '../App'
import type { ImageFile } from '../types'
import { getProjectsByClient, getProjectCover } from '../App'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fetchPlanUsage, type PlanUsage } from '../lib/usage'
import { formatBytes } from '../lib/eta'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientColor(name: string): string {
  const colors = ['#6366f1', '#ec4899', '#8b5cf6', '#a855f7', '#3b82f6', '#d946ef', '#818cf8', '#f43f5e', '#7c3aed', '#c084fc']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  return (words.length >= 2
    ? words[0].charAt(0) + words[1].charAt(0)
    : name.substring(0, 2)
  ).toUpperCase()
}

function relativeTime(iso?: string): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 4) return `${wk}w`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(day / 365)}y`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function statusDot(status?: 'draft' | 'publishing' | 'live'): string {
  switch (status) {
    case 'live': return '#34d399'
    case 'publishing': return '#fbbf24'
    case 'draft':
    default: return 'rgba(255,255,255,.25)'
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkspaceDashboardProps {
  projects: ProjectData[]
  clients: ClientData[]
  imageRegistry: Record<string, ImageFile>
  onNewProject: () => void
  onSelectProject: (id: string) => void
  onSelectClient: (id: string) => void
  onDeleteProject: (id: string) => void
  onRenameProject: (id: string, name: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceDashboard({
  projects,
  clients,
  imageRegistry,
  onNewProject,
  onSelectProject,
  onSelectClient,
  onDeleteProject,
}: WorkspaceDashboardProps) {
  const [sysName, setSysName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [shareMenuId, setShareMenuId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'draft'>('all')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    const api = (window as unknown as { api?: { getSystemUsername?: () => Promise<string | null> } }).api
    api?.getSystemUsername?.().then(name => {
      if (name) setSysName(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase())
    })
    // Pull the signed-in user email so the account menu can show it.
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  // ── Account menu outside-click ─────────────────────────────────────────────
  useEffect(() => {
    if (!accountMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [accountMenuOpen])

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      // App.tsx onAuthStateChange listener flips us back to the AuthShell.
    } catch (err) {
      console.error('[dashboard] sign out failed:', err)
      setSigningOut(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalPhotos = projects.reduce((sum, p) => sum + p.imageIds.length, 0)
    const live = projects.filter(p => p.publishState?.status === 'live').length
    return { totalPhotos, live, draft: projects.length - live }
  }, [projects])

  // ── Filter + search ────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()

  const filteredProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .filter(p => {
        if (activeFilter === 'live' && p.publishState?.status !== 'live') return false
        if (activeFilter === 'draft' && p.publishState?.status === 'live') return false
        if (q && !p.name.toLowerCase().includes(q) && !(p.clientName || '').toLowerCase().includes(q)) return false
        return true
      })
  }, [projects, activeFilter, q])

  const filteredClients = q
    ? clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        getProjectsByClient(c.id, projects).some(p => p.name.toLowerCase().includes(q))
      )
    : clients

  const sortedClients = useMemo(() => {
    return [...filteredClients].sort((a, b) => {
      const aLast = getProjectsByClient(a.id, projects).map(p => p.updatedAt || p.createdAt).sort().reverse()[0] || ''
      const bLast = getProjectsByClient(b.id, projects).map(p => p.updatedAt || p.createdAt).sort().reverse()[0] || ''
      return bLast.localeCompare(aLast)
    })
  }, [filteredClients, projects])

  const hasAnything = clients.length > 0 || projects.length > 0

  // ── Share menu helpers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!shareMenuId) return
    const handler = () => setShareMenuId(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [shareMenuId])

  const copyLink = (projectId: string) => {
    navigator.clipboard.writeText(`pixflow://gallery/${projectId}`).then(() => {
      setCopiedId(projectId)
      setShareMenuId(null)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => setShareMenuId(null))
  }

  const emailGallery = (p: ProjectData) => {
    const link = `pixflow://gallery/${p.id}`
    const subject = encodeURIComponent(`Gallery: ${p.name}`)
    const body = encodeURIComponent(`Hi,\n\nHere is your gallery "${p.name}":\n${link}\n\nBest regards`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
    setShareMenuId(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#0a0a0f',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: 'rgba(255,255,255,.92)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @keyframes wsd-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .wsd-card { transition: transform .15s, border-color .2s; }
        .wsd-card:hover { transform: translateY(-2px); border-color: rgba(99,102,241,.4); }
        .wsd-card:hover .wsd-card-img { transform: scale(1.05); }
        .wsd-card:hover .wsd-card-actions { opacity: 1; }
        .wsd-card-actions { opacity: 0; transition: opacity .15s; }
        .wsd-card-img { transition: transform .5s ease; }
        .wsd-client-row { transition: background .12s, border-left-color .12s; }
        .wsd-client-row:hover { background: rgba(255,255,255,.04); }
        .wsd-client-row:hover .wsd-client-arrow { opacity: 1; transform: translateX(0); }
        .wsd-client-arrow { opacity: 0; transform: translateX(-4px); transition: opacity .15s, transform .15s; }
        .wsd-cta { transition: background .15s, box-shadow .15s, transform .1s; }
        .wsd-cta:hover { background: #5558e3; box-shadow: 0 8px 24px rgba(99,102,241,.4); }
        .wsd-cta:active { transform: scale(.97); }
        .wsd-secondary { transition: background .12s, border-color .12s; }
        .wsd-secondary:hover { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.18); }
        .wsd-icon-btn { transition: background .12s; }
        .wsd-icon-btn:hover { background: rgba(255,255,255,.12) !important; }
        .wsd-filter-btn { transition: background .12s, color .12s; }
        .wsd-filter-btn:hover { color: rgba(255,255,255,.85); }
        .wsd-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .wsd-scroll::-webkit-scrollbar-track { background: transparent; }
        .wsd-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.06); border-radius: 4px; }
        .wsd-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.12); }
      `}</style>

      {/* ─── Compact top hero strip ──────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '20px 32px 18px',
        borderBottom: '1px solid rgba(255,255,255,.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        animation: 'wsd-fade .35s ease both',
        position: 'relative',
        zIndex: 20,
      }}>
        {/* Avatar + welcome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, position: 'relative' }} ref={accountMenuRef}>
          <button
            onClick={() => setAccountMenuOpen(o => !o)}
            title="Account"
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              boxShadow: '0 4px 14px rgba(99,102,241,.3)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              transition: 'transform .12s, box-shadow .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(99,102,241,.5)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,.3)' }}
          >
            {sysName ? sysName.charAt(0) : '·'}
          </button>

          {/* Account dropdown */}
          {accountMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 46,
              left: 0,
              minWidth: 240,
              background: 'rgba(20,20,28,.97)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 12,
              padding: 6,
              boxShadow: '0 16px 40px rgba(0,0,0,.55)',
              backdropFilter: 'blur(20px)',
              zIndex: 100,
              animation: 'wsd-fade .15s ease both',
            }}>
              <div style={{
                padding: '12px 12px 10px',
                borderBottom: '1px solid rgba(255,255,255,.06)',
                marginBottom: 4,
              }}>
                <div style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,.92)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {sysName || 'Signed in'}
                </div>
                <div style={{
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,.42)',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {userEmail || 'No email on file'}
                </div>
              </div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 7,
                  color: '#f87171',
                  fontSize: 12.5,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  cursor: signingOut ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  textAlign: 'left',
                  opacity: signingOut ? 0.6 : 1,
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { if (!signingOut) e.currentTarget.style.background = 'rgba(248,113,113,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'rgba(255,255,255,.95)',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {sysName ? `Hi, ${sysName}` : 'Hi'}
            </div>
            <div style={{
              fontSize: 11.5,
              color: 'rgba(255,255,255,.4)',
              marginTop: 1,
              whiteSpace: 'nowrap',
            }}>
              {hasAnything ? 'Here\'s your studio at a glance' : 'Let\'s set up your first delivery'}
            </div>
          </div>
        </div>

        {/* Inline stat pills */}
        {hasAnything && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <StatPill value={String(projects.length)} label="galleries" />
            <StatPill value={formatNumber(stats.totalPhotos)} label="photos" />
            <StatPill value={String(clients.length)} label="clients" />
            {stats.live > 0 && <StatPill value={String(stats.live)} label="live" accent="#34d399" />}
          </div>
        )}

        {/* Storage quota indicator */}
        <UsageIndicator />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search */}
        {hasAnything && (
          <div style={{ position: 'relative', width: 240 }}>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.32)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 9,
                color: '#fff',
                fontSize: 12.5,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color .15s, background .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            className="wsd-secondary"
            onClick={onNewProject}
            style={{
              padding: '8px 14px',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 9,
              color: 'rgba(255,255,255,.78)',
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          <button
            className="wsd-cta"
            onClick={onNewProject}
            style={{
              padding: '8px 16px',
              background: '#6366f1',
              border: 'none',
              borderRadius: 9,
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(99,102,241,.3)',
              letterSpacing: '0.01em',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Gallery
          </button>
        </div>
      </div>

      {/* ─── Body: 2-column layout ───────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        animation: 'wsd-fade .4s ease both .04s',
      }}>
        {/* ── Sidebar: Clients ─────────────────────────────────────────── */}
        <aside style={{
          width: 256,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,.05)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{
            padding: '16px 18px 10px',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.42)',
            }}>
              Clients
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
              {clients.length}
            </span>
          </div>

          <div className="wsd-scroll" style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '0 8px 8px',
          }}>
            {sortedClients.length === 0 && (
              <div style={{
                padding: '20px 12px',
                fontSize: 12,
                color: 'rgba(255,255,255,.32)',
                textAlign: 'center',
                lineHeight: 1.5,
              }}>
                No clients yet
              </div>
            )}
            {sortedClients.map(c => {
              const clientProjects = getProjectsByClient(c.id, projects)
              const lastUpdated = clientProjects.map(p => p.updatedAt || p.createdAt).sort().reverse()[0]
              const bg = clientColor(c.name)
              return (
                <div
                  key={c.id}
                  className="wsd-client-row"
                  onClick={() => onSelectClient(c.id)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                >
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                  }}>
                    {initials(c.name)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: 'rgba(255,255,255,.88)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.2,
                    }}>
                      {c.name}
                    </div>
                    <div style={{
                      fontSize: 10.5,
                      color: 'rgba(255,255,255,.36)',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                    }}>
                      {clientProjects.length}
                      {clientProjects.length === 1 ? ' gallery' : ' galleries'}
                      {lastUpdated && ` · ${relativeTime(lastUpdated)}`}
                    </div>
                  </div>
                  <svg
                    className="wsd-client-arrow"
                    width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                    style={{ color: 'rgba(255,255,255,.4)', flexShrink: 0 }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── Main: galleries grid ────────────────────────────────────── */}
        <main style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          {/* Filter tabs */}
          <div style={{
            padding: '14px 28px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            borderBottom: '1px solid rgba(255,255,255,.04)',
          }}>
            {([
              { key: 'all' as const, label: 'All', count: projects.length },
              { key: 'live' as const, label: 'Live', count: stats.live },
              { key: 'draft' as const, label: 'Drafts', count: stats.draft },
            ]).map(tab => {
              const active = activeFilter === tab.key
              return (
                <button
                  key={tab.key}
                  className="wsd-filter-btn"
                  onClick={() => setActiveFilter(tab.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '6px 0',
                    color: active ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.42)',
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    position: 'relative',
                    letterSpacing: '0.01em',
                  }}
                >
                  {tab.label}
                  <span style={{
                    fontSize: 10.5,
                    color: active ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.28)',
                    fontWeight: 500,
                  }}>
                    {tab.count}
                  </span>
                  {active && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: -10,
                      height: 1.5,
                      background: '#6366f1',
                      borderRadius: 1,
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Galleries grid */}
          <div className="wsd-scroll" style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '18px 28px 28px',
          }}>
            {filteredProjects.length === 0 ? (
              <EmptyState
                hasAnything={hasAnything}
                isFiltered={!!q || activeFilter !== 'all'}
                search={search}
                onNewProject={onNewProject}
              />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 14,
              }}>
                {filteredProjects.map(p => {
                  const cover = getProjectCover(p, imageRegistry)
                  const dotColor = statusDot(p.publishState?.status)
                  return (
                    <div key={p.id} style={{ position: 'relative' }}>
                      <div
                        className="wsd-card"
                        onClick={() => onSelectProject(p.id)}
                        style={{
                          background: 'rgba(255,255,255,.025)',
                          border: '1px solid rgba(255,255,255,.06)',
                          borderRadius: 11,
                          overflow: 'hidden',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '1/1',
                          background: 'linear-gradient(135deg, rgba(99,102,241,.1), rgba(168,85,247,.05))',
                          overflow: 'hidden',
                        }}>
                          {cover ? (
                            <img
                              className="wsd-card-img"
                              src={toLocalURL(cover)}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'rgba(255,255,255,.18)',
                            }}>
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            </div>
                          )}

                          {/* Hover actions */}
                          <div
                            className="wsd-card-actions"
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              display: 'flex',
                              gap: 5,
                            }}
                          >
                            <button
                              className="wsd-icon-btn"
                              title="Share gallery"
                              onClick={e => { e.stopPropagation(); setShareMenuId(shareMenuId === p.id ? null : p.id) }}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                background: copiedId === p.id ? 'rgba(52,211,153,.85)' : 'rgba(0,0,0,.55)',
                                border: '1px solid rgba(255,255,255,.14)',
                                color: copiedId === p.id ? '#0a0a0f' : 'rgba(255,255,255,.9)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backdropFilter: 'blur(8px)',
                              }}
                            >
                              {copiedId === p.id ? (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="18" cy="5" r="3" />
                                  <circle cx="6" cy="12" r="3" />
                                  <circle cx="18" cy="19" r="3" />
                                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                </svg>
                              )}
                            </button>
                            <button
                              className="wsd-icon-btn"
                              title="Delete gallery"
                              onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                background: 'rgba(0,0,0,.55)',
                                border: '1px solid rgba(255,255,255,.14)',
                                color: 'rgba(255,255,255,.9)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backdropFilter: 'blur(8px)',
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Card body — compact */}
                        <div style={{ padding: '10px 12px 12px' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 3,
                          }}>
                            <div style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: dotColor,
                              flexShrink: 0,
                              boxShadow: p.publishState?.status === 'live' ? '0 0 8px rgba(52,211,153,.6)' : 'none',
                            }} />
                            <div style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: 'rgba(255,255,255,.92)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flex: 1,
                              letterSpacing: '-0.01em',
                            }}>
                              {p.name}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 10.5,
                            color: 'rgba(255,255,255,.4)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingLeft: 12,
                          }}>
                            <span style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '60%',
                            }}>
                              {p.clientName || 'Unassigned'}
                            </span>
                            <span style={{ whiteSpace: 'nowrap' }}>
                              {p.imageIds.length} · {relativeTime(p.updatedAt || p.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Share popup */}
                      {shareMenuId === p.id && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            top: 40,
                            right: 8,
                            background: 'rgba(20,20,28,.96)',
                            border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 9,
                            padding: 5,
                            boxShadow: '0 12px 32px rgba(0,0,0,.5)',
                            backdropFilter: 'blur(20px)',
                            zIndex: 10,
                            minWidth: 156,
                          }}
                        >
                          <button
                            onClick={() => emailGallery(p)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 5,
                              color: 'rgba(255,255,255,.85)',
                              fontSize: 12,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 9,
                              textAlign: 'left',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            Send via email
                          </button>
                          <button
                            onClick={() => copyLink(p.id)}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 5,
                              color: 'rgba(255,255,255,.85)',
                              fontSize: 12,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 9,
                              textAlign: 'left',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                            Copy link
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ─── Delete confirmation modal ─────────────────────────────────── */}
      {confirmDeleteId && (
        <div
          onClick={() => setConfirmDeleteId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'wsd-fade .15s ease both',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(20,20,28,.96)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 13,
              padding: '24px 26px 20px',
              maxWidth: 340,
              width: '90%',
              boxShadow: '0 24px 60px rgba(0,0,0,.6)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: '#fff' }}>
              Delete this gallery?
            </h3>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Removes the gallery from your workspace. Local files stay where they are.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,.85)',
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteProject(confirmDeleteId); setConfirmDeleteId(null) }}
                style={{
                  padding: '8px 16px',
                  background: '#dc2626',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatPill({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div style={{
      padding: '6px 11px',
      background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(255,255,255,.06)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'baseline',
      gap: 5,
      whiteSpace: 'nowrap',
    }}>
      {accent && (
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: accent,
          alignSelf: 'center',
          boxShadow: `0 0 6px ${accent}88`,
        }} />
      )}
      <span style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'rgba(255,255,255,.95)',
        letterSpacing: '-0.01em',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 10.5,
        color: 'rgba(255,255,255,.42)',
        fontWeight: 500,
      }}>
        {label}
      </span>
    </div>
  )
}

function EmptyState({
  hasAnything,
  isFiltered,
  search,
  onNewProject,
}: {
  hasAnything: boolean
  isFiltered: boolean
  search: string
  onNewProject: () => void
}) {
  if (!hasAnything) {
    return (
      <div style={{
        padding: '80px 32px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'rgba(99,102,241,.10)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: '#6366f1',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'rgba(255,255,255,.95)', letterSpacing: '-0.02em' }}>
          Welcome to Pixflow
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', margin: '0 0 28px', lineHeight: 1.6, maxWidth: 340 }}>
          Create your first project to start organizing and publishing your photos.
        </p>
        <button
          className="wsd-cta"
          onClick={onNewProject}
          style={{
            padding: '12px 28px',
            background: '#6366f1',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(99,102,241,.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            letterSpacing: '0.01em',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Project
        </button>
      </div>
    )
  }
  return (
    <div style={{
      padding: '60px 20px',
      textAlign: 'center',
      color: 'rgba(255,255,255,.42)',
      fontSize: 12.5,
    }}>
      {isFiltered && search ? `No results for "${search}"` : 'No galleries match this filter'}
    </div>
  )
}

// ─── Usage indicator ─────────────────────────────────────────────────────────
// Shows current storage usage as a compact horizontal pill that expands to a
// tooltip on hover with plan details and monthly photo counter.
function UsageIndicator() {
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPlanUsage().then(u => { if (!cancelled) setUsage(u) })
    // Refresh every 60 s — usage changes on publish, but a light poll keeps
    // the indicator honest without plumbing events through the store.
    const id = setInterval(() => {
      fetchPlanUsage().then(u => { if (!cancelled) setUsage(u) })
    }, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!usage) return null

  const limitBytes = usage.storageLimitBytes
  const used = usage.storageUsedBytes
  const pct = limitBytes && limitBytes > 0 ? Math.min(100, (used / limitBytes) * 100) : 0
  const isUnlimited = limitBytes == null
  const isNearLimit = !isUnlimited && pct >= 80
  const isOver = !isUnlimited && pct >= 100

  const barColor = isOver ? '#ef4444' : isNearLimit ? '#f59e0b' : '#6366f1'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginLeft: 10,
        padding: '5px 10px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 999,
        cursor: 'default',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
      </svg>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.72)', fontWeight: 500 }}>
        {isUnlimited
          ? `${formatBytes(used)} used`
          : `${formatBytes(used)} / ${formatBytes(limitBytes!)}`}
      </span>
      {!isUnlimited && (
        <div style={{
          width: 50,
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 2,
            transition: 'width .3s, background .3s',
          }} />
        </div>
      )}

      {hovered && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          padding: '12px 14px',
          background: 'rgba(20,20,28,.98)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10,
          minWidth: 240,
          zIndex: 200,
          boxShadow: '0 12px 36px rgba(0,0,0,.5)',
          fontSize: 11.5,
          color: 'rgba(255,255,255,.75)',
          lineHeight: 1.6,
        }}>
          <div style={{
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,.4)',
            marginBottom: 8,
          }}>
            {usage.planName} Plan
          </div>
          <UsageRow
            label="Storage"
            value={isUnlimited ? `${formatBytes(used)}` : `${formatBytes(used)} of ${formatBytes(limitBytes!)}`}
            sub={isUnlimited ? 'Unlimited' : `${Math.round(pct)}% used`}
            warn={isNearLimit}
          />
          <UsageRow
            label="Galleries"
            value={usage.maxGalleries != null ? `${usage.galleriesCount} / ${usage.maxGalleries}` : `${usage.galleriesCount}`}
            sub={usage.maxGalleries != null ? undefined : 'Unlimited'}
          />
          <UsageRow
            label="Photos this month"
            value={usage.maxPhotosPerMonth != null
              ? `${usage.photosThisMonth} / ${usage.maxPhotosPerMonth}`
              : `${usage.photosThisMonth}`}
            sub={usage.maxPhotosPerMonth != null ? undefined : 'Unlimited'}
          />
          {isNearLimit && (
            <div style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,.06)',
              color: isOver ? '#ef4444' : '#f59e0b',
              fontSize: 11,
            }}>
              {isOver ? 'Storage limit reached — upgrade to keep publishing' : 'You\'re approaching your storage limit'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function UsageRow({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12,
      padding: '3px 0',
    }}>
      <span style={{ color: 'rgba(255,255,255,.45)' }}>{label}</span>
      <span style={{ color: warn ? '#f59e0b' : 'rgba(255,255,255,.9)', fontWeight: 500 }}>
        {value}
        {sub && <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 400, marginLeft: 6 }}>· {sub}</span>}
      </span>
    </div>
  )
}
