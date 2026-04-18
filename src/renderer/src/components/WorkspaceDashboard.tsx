import React, { useState, useEffect, useMemo, useRef } from 'react'
import { toLocalURL } from '../utils/imageUtils'
import type { ProjectData, ClientData } from '../App'
import type { ImageFile } from '../types'
import { getProjectsByClient, getProjectCover } from '../App'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { fetchPlanUsage, type PlanUsage } from '../lib/usage'
import { openCheckout } from '../lib/checkout'
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
  onOpenSettings: () => void
  onBulkImport: (clientName: string, folders: Array<{ name: string; path: string }>) => void
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
  onOpenSettings,
  onBulkImport,
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

  // Bulk import state
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [bulkFolders, setBulkFolders] = useState<Array<{ name: string; path: string }>>([])
  const [bulkClientName, setBulkClientName] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)

  const startBulkImport = async () => {
    const parentPath = await (window as unknown as { api: { openFolderDialog: () => Promise<string | null>; listSubfolders: (p: string) => Promise<Array<{ name: string; path: string }>> } }).api.openFolderDialog()
    if (!parentPath) return
    const folders = await (window as unknown as { api: { listSubfolders: (p: string) => Promise<Array<{ name: string; path: string }>> } }).api.listSubfolders(parentPath)
    if (folders.length === 0) return
    setBulkFolders(folders)
    setBulkImportOpen(true)
  }

  const executeBulkImport = async () => {
    if (!bulkClientName.trim() || bulkFolders.length === 0) return
    setBulkImporting(true)
    onBulkImport(bulkClientName.trim(), bulkFolders)
    setBulkImporting(false)
    setBulkImportOpen(false)
    setBulkFolders([])
    setBulkClientName('')
  }

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

  const copyLink = (p: ProjectData) => {
    const url = p.publishState?.publicUrl || `pixflow://gallery/${p.id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(p.id)
      setShareMenuId(null)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => setShareMenuId(null))
  }

  const emailGallery = (p: ProjectData) => {
    const link = p.publishState?.publicUrl || `pixflow://gallery/${p.id}`
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
        @keyframes wsd-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .wsd-card {
          transition: transform .22s cubic-bezier(.4,0,.2,1), border-color .22s, box-shadow .25s;
          border: 1px solid rgba(255,255,255,.05) !important;
        }
        .wsd-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,.12) !important;
          box-shadow: 0 12px 40px rgba(0,0,0,.35);
        }
        .wsd-card:hover .wsd-card-img { transform: scale(1.04); }
        .wsd-card:hover .wsd-card-actions { opacity: 1; }
        .wsd-card-actions { opacity: 0; transition: opacity .2s; }
        .wsd-card-img { transition: transform .6s cubic-bezier(.4,0,.2,1), filter .3s; }
        .wsd-client-row { transition: background .15s, border-left-color .15s; border-radius: 10px; }
        .wsd-client-row:hover { background: rgba(99,102,241,.06) !important; }
        .wsd-client-row:hover .wsd-client-arrow { opacity: 1; transform: translateX(0); }
        .wsd-client-arrow { opacity: 0; transform: translateX(-4px); transition: opacity .15s, transform .15s; }
        .wsd-cta {
          transition: background .15s, box-shadow .15s, transform .1s;
          background: #6366f1 !important;
        }
        .wsd-cta:hover { background: #7577f5 !important; }
        .wsd-cta:active { transform: scale(.97); }
        .wsd-secondary { transition: all .15s; }
        .wsd-secondary:hover { background: rgba(255,255,255,.08) !important; border-color: rgba(255,255,255,.15) !important; }
        .wsd-icon-btn { transition: all .15s; }
        .wsd-icon-btn:hover { background: rgba(255,255,255,.1) !important; }
        .wsd-filter-btn { transition: all .15s; }
        .wsd-filter-btn:hover { color: rgba(255,255,255,.85); background: rgba(255,255,255,.06); }
        .wsd-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .wsd-scroll::-webkit-scrollbar-track { background: transparent; }
        .wsd-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.05); border-radius: 3px; }
        .wsd-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.1); }
      `}</style>

      {/* ─── Title bar (macOS drag region) ──────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        height: 52,
        // @ts-expect-error electron
        WebkitAppRegion: 'drag',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px 0 80px',
        background: 'transparent',
        position: 'relative',
        zIndex: 20,
      }}>
        {/* Avatar + account */}
        <div
          ref={accountMenuRef}
          // @ts-expect-error electron
          style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}
        >
          <button
            onClick={() => setAccountMenuOpen(o => !o)}
            title="Account"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'linear-gradient(135deg,#6366f1,#818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
              transition: 'opacity .15s',
            }}
          >
            {sysName ? sysName.charAt(0) : '·'}
          </button>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,.85)', letterSpacing: '-0.01em' }}>
            {sysName ? `Hi, ${sysName}` : 'Workspace'}
          </span>

          {/* Account dropdown */}
          {accountMenuOpen && (
            <div style={{
              position: 'absolute',
              top: 40,
              left: 0,
              minWidth: 220,
              background: 'rgba(20,20,28,.96)',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 12,
              padding: 5,
              boxShadow: '0 20px 60px rgba(0,0,0,.55)',
              backdropFilter: 'blur(24px)',
              zIndex: 100,
              animation: 'wsd-fade .12s ease both',
            }}>
              <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 3 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sysName || 'Signed in'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.38)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail || 'No email on file'}
                </div>
              </div>
              <button
                onClick={() => { setAccountMenuOpen(false); onOpenSettings() }}
                style={{
                  width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7,
                  color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Business Settings
              </button>
              <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '3px 0' }} />
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                style={{
                  width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 7,
                  color: '#f87171', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                  cursor: signingOut ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  opacity: signingOut ? 0.6 : 1, transition: 'background .12s',
                }}
                onMouseEnter={e => { if (!signingOut) e.currentTarget.style.background = 'rgba(248,113,113,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>

        {/* Stat pills */}
        {hasAnything && (
          // @ts-expect-error electron
          <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
            <StatPill value={String(projects.length)} label="galleries" />
            <StatPill value={formatNumber(stats.totalPhotos)} label="photos" />
            <StatPill value={String(clients.length)} label="clients" />
            {stats.live > 0 && <StatPill value={String(stats.live)} label="live" accent="#34d399" />}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Storage */}
        {/* @ts-expect-error electron */}
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <UsageIndicator />
        </div>

        {/* Search */}
        {hasAnything && (
          // @ts-expect-error electron
          <div style={{ WebkitAppRegion: 'no-drag', position: 'relative', width: 200, marginLeft: 12 }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.28)', pointerEvents: 'none' }}
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
                padding: '7px 10px 7px 30px',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color .15s, background .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.4)'; e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)'; e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
            />
          </div>
        )}

        {/* Import buttons */}
        {/* @ts-expect-error electron */}
        <div style={{ WebkitAppRegion: 'no-drag', marginLeft: 10, display: 'flex', gap: 6 }}>
          <button
            onClick={startBulkImport}
            style={{
              padding: '7px 14px',
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8,
              color: 'rgba(255,255,255,.75)',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Bulk Import
          </button>
          <button
            className="wsd-cta"
            onClick={onNewProject}
            style={{
              padding: '7px 16px',
              background: '#6366f1',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: '0.01em',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
        </div>
      </div>

      {/* ─── Body: 2-column layout ───────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        animation: 'wsd-fade .35s ease both',
      }}>
        {/* ── Sidebar: Clients ─────────────────────────────────────────── */}
        <aside style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,.05)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'rgba(255,255,255,.01)',
        }}>
          <div style={{
            padding: '14px 16px 10px',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.35)',
            }}>
              Clients
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.25)' }}>
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
          {/* Filter tabs (pill style) */}
          <div style={{
            padding: '12px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.05)',
              borderRadius: 10,
              padding: 2,
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
                      background: active ? 'rgba(255,255,255,.08)' : 'none',
                      border: 'none',
                      padding: '5px 14px',
                      borderRadius: 8,
                      color: active ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.38)',
                      fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      letterSpacing: '0.01em',
                      transition: 'all .15s',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,.2)' : 'none',
                    }}
                  >
                    {tab.label}
                    <span style={{
                      fontSize: 10,
                      color: active ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.22)',
                      fontWeight: 500,
                    }}>
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Galleries grid */}
          <div className="wsd-scroll" style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '8px 28px 28px',
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: 16,
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
                          background: 'rgba(255,255,255,.02)',
                          border: '1px solid rgba(255,255,255,.05)',
                          borderRadius: 14,
                          overflow: 'hidden',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '16/10',
                          background: 'rgba(255,255,255,.02)',
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

                        {/* Card body */}
                        <div style={{ padding: '11px 14px 13px' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            marginBottom: 6,
                          }}>
                            <div style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: dotColor,
                              flexShrink: 0,
                              boxShadow: p.publishState?.status === 'live' ? '0 0 10px rgba(52,211,153,.5)' : 'none',
                            }} />
                            <div style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'rgba(255,255,255,.9)',
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
                            fontSize: 11,
                            color: 'rgba(255,255,255,.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingLeft: 14,
                          }}>
                            <span style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '55%',
                            }}>
                              {p.clientName || ''}
                            </span>
                            <span style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {p.imageIds.length} photos · {relativeTime(p.updatedAt || p.createdAt)}
                            </span>
                          </div>
                          {p.eventType && (
                            <div style={{
                              marginTop: 8, paddingLeft: 14,
                            }}>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 50,
                                background: 'rgba(99,102,241,.08)', color: 'rgba(129,140,248,.7)',
                                border: '1px solid rgba(99,102,241,.12)',
                              }}>
                                {p.eventType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            </div>
                          )}
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
                            onClick={() => copyLink(p)}
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

      {/* ─── Bulk Import Modal ─────────────────────────────────── */}
      {bulkImportOpen && (
        <div onClick={() => setBulkImportOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'rgba(20,20,28,.97)', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 16, padding: '28px 30px', maxWidth: 500, width: '90%',
            boxShadow: '0 24px 60px rgba(0,0,0,.6)', backdropFilter: 'blur(20px)',
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px', color: '#fff' }}>
              Bulk Import
            </h3>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.45)', margin: '0 0 20px', lineHeight: 1.5 }}>
              {bulkFolders.length} galleries found. Enter client name and import all at once.
            </p>

            {/* Client name input */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>Client Name</div>
              <input
                value={bulkClientName}
                onChange={e => setBulkClientName(e.target.value)}
                placeholder="e.g. So And Co"
                autoFocus
                style={{
                  width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 9, color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
                onKeyDown={e => { if (e.key === 'Enter' && bulkClientName.trim()) executeBulkImport() }}
              />
            </div>

            {/* Folder list */}
            <div style={{
              maxHeight: 240, overflowY: 'auto', marginBottom: 20,
              background: 'rgba(0,0,0,.2)', borderRadius: 10, padding: 8,
              border: '1px solid rgba(255,255,255,.05)',
            }}>
              {bulkFolders.map((f, i) => (
                <div key={f.path} style={{
                  padding: '6px 10px', fontSize: 12.5, color: 'rgba(255,255,255,.7)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: i < bulkFolders.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#6366f1', flexShrink: 0 }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  {f.name}
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setBulkImportOpen(false)} style={{
                padding: '9px 18px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 8, color: 'rgba(255,255,255,.7)', fontSize: 12.5, fontWeight: 500,
                fontFamily: 'inherit', cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={executeBulkImport}
                disabled={!bulkClientName.trim() || bulkImporting}
                style={{
                  padding: '9px 22px', background: bulkClientName.trim() ? '#6366f1' : 'rgba(255,255,255,.06)',
                  border: 'none', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 600,
                  fontFamily: 'inherit', cursor: bulkClientName.trim() ? 'pointer' : 'default',
                }}
              >
                {bulkImporting ? 'Importing...' : `Import ${bulkFolders.length} Galleries`}
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
      display: 'flex',
      alignItems: 'baseline',
      gap: 4,
      whiteSpace: 'nowrap',
    }}>
      {accent && (
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: accent,
          boxShadow: `0 0 6px ${accent}55`,
          alignSelf: 'center',
        }} />
      )}
      <span style={{
        fontSize: 13,
        fontWeight: 700,
        color: accent || 'rgba(255,255,255,.85)',
        letterSpacing: '-0.02em',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 10.5,
        color: 'rgba(255,255,255,.3)',
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
// Shows current plan, storage bar, galleries, and photos — always visible.
// Includes upgrade button for Starter/Pro users.
function UsageIndicator() {
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [couponCode, setCouponCode] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchPlanUsage().then(u => { if (!cancelled) setUsage(u) })
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
  const canUpgrade = usage.planId === 'starter' || usage.planId === 'pro'

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginLeft: 10,
        padding: '5px 12px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 999,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Plan badge */}
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.5px',
        textTransform: 'uppercase',
        color: usage.planId === 'business' ? '#34d399' : usage.planId === 'pro' ? '#818cf8' : 'rgba(255,255,255,.5)',
        background: usage.planId === 'business' ? 'rgba(52,211,153,.12)' : usage.planId === 'pro' ? 'rgba(129,140,248,.12)' : 'rgba(255,255,255,.06)',
        padding: '2px 7px',
        borderRadius: 4,
      }}>
        {usage.planName}
      </span>

      {/* Storage summary */}
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

      {/* Chevron */}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {/* Expanded dropdown */}
      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            padding: '16px 18px',
            background: 'rgba(20,20,28,.98)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 12,
            minWidth: 280,
            zIndex: 200,
            boxShadow: '0 16px 48px rgba(0,0,0,.6)',
            fontSize: 12,
            color: 'rgba(255,255,255,.75)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'rgba(255,255,255,.92)',
            }}>
              {usage.planName} Plan
            </span>
            {canUpgrade && (
              <button
                onClick={() => openCheckout(usage.planId === 'starter' ? 'pro' : 'business', couponCode || undefined)}
                style={{
                  padding: '5px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Coupon code */}
          {canUpgrade && (
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Coupon code"
                value={couponCode}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  color: '#fff',
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 6,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
              />
            </div>
          )}

          {/* Storage bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>Storage</span>
              <span style={{ color: isNearLimit ? '#f59e0b' : 'rgba(255,255,255,.9)', fontSize: 11, fontWeight: 600 }}>
                {isUnlimited ? formatBytes(used) : `${formatBytes(used)} of ${formatBytes(limitBytes!)}`}
                {isUnlimited && <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 400, marginLeft: 4 }}>Unlimited</span>}
              </span>
            </div>
            {!isUnlimited && (
              <div style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: 3,
                  transition: 'width .3s, background .3s',
                }} />
              </div>
            )}
          </div>

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

          {(isNearLimit || isOver) && (
            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,.06)',
              color: isOver ? '#ef4444' : '#f59e0b',
              fontSize: 11,
            }}>
              {isOver ? 'Storage limit reached — upgrade to keep publishing' : 'Approaching your storage limit'}
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
      padding: '4px 0',
    }}>
      <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>{label}</span>
      <span style={{ color: warn ? '#f59e0b' : 'rgba(255,255,255,.9)', fontWeight: 500, fontSize: 11 }}>
        {value}
        {sub && <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 400, marginLeft: 6 }}>· {sub}</span>}
      </span>
    </div>
  )
}
