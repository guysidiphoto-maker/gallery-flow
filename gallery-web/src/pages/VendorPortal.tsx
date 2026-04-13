import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, storageUrl } from '../supabase'

interface VendorInfo {
  id: string; name: string; category: string; logo_url: string | null
}

interface TaggedImage {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null
}

interface GalleryInfo {
  id: string; name: string; published_at: string | null
}

// ── Download helper ─────────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Scroll reveal ───────────────────────────────────────────────────────────

function useReveal() {
  const obs = useRef<IntersectionObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!obs.current) {
      obs.current = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = '1';
            (e.target as HTMLElement).style.transform = 'translateY(0)'
            obs.current?.unobserve(e.target)
          }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' })
    }
    el.style.opacity = '0'; el.style.transform = 'translateY(16px)'
    el.style.transition = 'opacity .5s ease, transform .5s ease'
    obs.current.observe(el)
  }, [])
}

// ── Main Component ──────────────────────────────────────────────────────────

export function VendorPortal() {
  // Parse access code from URL: /vendor/{code}
  const code = (() => {
    const path = window.location.pathname.replace(/\/$/, '')
    const m = path.match(/\/vendor\/([^/]+)$/)
    return m ? m[1] : ''
  })()

  const [vendor, setVendor] = useState<VendorInfo | null>(null)
  const [images, setImages] = useState<TaggedImage[]>([])
  const [galleries, setGalleries] = useState<Map<string, GalleryInfo>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [selectAll, setSelectAll] = useState(true)
  const reveal = useReveal()

  useEffect(() => {
    if (!code) { setError('No vendor code in URL'); setLoading(false); return }
    load()
    async function load() {
      // Look up vendor by code
      const { data: vData } = await supabase.rpc('get_vendor_by_code', { p_code: code })
      if (!vData || (Array.isArray(vData) && vData.length === 0)) {
        setError('Invalid vendor code')
        setLoading(false)
        return
      }
      const v = Array.isArray(vData) ? vData[0] : vData
      setVendor(v)

      // Fetch tagged images
      const { data: tags } = await supabase
        .from('image_vendor_tags')
        .select('image_id, gallery_id')
        .eq('vendor_id', v.id)

      if (!tags || tags.length === 0) {
        setError('No photos tagged for you yet')
        setLoading(false)
        return
      }

      const imageIds = tags.map(t => t.image_id)
      const galleryIds = [...new Set(tags.map(t => t.gallery_id))]

      // Fetch images + galleries in parallel
      const [imgsRes, galsRes] = await Promise.all([
        supabase.from('images')
          .select('id, gallery_id, filename, storage_path, thumbnail_path')
          .in('id', imageIds)
          .order('sort_order', { ascending: true }),
        supabase.from('galleries')
          .select('id, name, published_at')
          .in('id', galleryIds),
      ])

      if (imgsRes.data) {
        setImages(imgsRes.data)
        setSelectedIds(new Set(imgsRes.data.map(i => i.id)))
      }

      if (galsRes.data) {
        const gm = new Map<string, GalleryInfo>()
        galsRes.data.forEach(g => gm.set(g.id, g))
        setGalleries(gm)
      }

      setLoading(false)
    }
  }, [code])

  if (loading) return <div className="center-msg"><div className="loader" /></div>
  if (error) return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0f', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
          background: 'rgba(239,68,68,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.7)' }}>{error}</p>
      </div>
    </div>
  )
  if (!vendor) return null

  // Group images by gallery
  const byGallery = new Map<string, TaggedImage[]>()
  images.forEach(img => {
    const arr = byGallery.get(img.gallery_id) || []
    arr.push(img)
    byGallery.set(img.gallery_id, arr)
  })

  const handleDownloadSelected = async () => {
    setDownloading(true)
    const selected = images.filter(i => selectedIds.has(i.id))
    for (const img of selected) {
      await downloadImage(storageUrl('gallery-images', img.storage_path), img.filename)
      await new Promise(r => setTimeout(r, 200))
    }
    setDownloading(false)
  }

  const toggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set())
      setSelectAll(false)
    } else {
      setSelectedIds(new Set(images.map(i => i.id)))
      setSelectAll(true)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,.06)',
        background: 'rgba(10,10,15,.95)', backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 100,
        padding: '16px 24px',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {vendor.logo_url ? (
              <img src={vendor.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
              }}>
                {vendor.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{vendor.name}</h1>
              {vendor.category && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', textTransform: 'capitalize' }}>{vendor.category}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={toggleAll}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(255,255,255,.6)', fontSize: 12, fontFamily: 'inherit',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              {selectAll ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleDownloadSelected}
              disabled={selectedIds.size === 0 || downloading}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: selectedIds.size > 0 ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'rgba(255,255,255,.06)',
                color: selectedIds.size > 0 ? '#fff' : 'rgba(255,255,255,.3)',
                fontSize: 12, fontWeight: 600, cursor: selectedIds.size > 0 ? 'pointer' : 'default',
                fontFamily: 'inherit', boxShadow: selectedIds.size > 0 ? '0 4px 16px rgba(99,102,241,.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {downloading ? 'Downloading...' : `Download ${selectedIds.size} photos`}
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 96px' }}>

        {/* Stats */}
        <div ref={reveal} style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{
            padding: '14px 20px', background: 'rgba(99,102,241,.08)',
            border: '1px solid rgba(99,102,241,.15)', borderRadius: 10, flex: '1 1 100px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#818cf8' }}>{images.length}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Tagged Photos</div>
          </div>
          <div style={{
            padding: '14px 20px', background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, flex: '1 1 100px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{byGallery.size}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Events</div>
          </div>
          <div style={{
            padding: '14px 20px', background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, flex: '1 1 100px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedIds.size}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Selected</div>
          </div>
        </div>

        {/* Images by gallery */}
        {Array.from(byGallery.entries()).map(([galleryId, imgs]) => {
          const gallery = galleries.get(galleryId)
          const d = gallery?.published_at ? new Date(gallery.published_at) : null
          return (
            <div key={galleryId} ref={reveal} style={{ marginBottom: 40 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{gallery?.name || 'Gallery'}</h2>
                {d && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
                    {d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.25)' }}>{imgs.length} photos</span>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 4, borderRadius: 8, overflow: 'hidden',
              }}>
                {imgs.map(img => {
                  const selected = selectedIds.has(img.id)
                  return (
                    <div
                      key={img.id}
                      onClick={() => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(img.id)) next.delete(img.id); else next.add(img.id)
                          return next
                        })
                      }}
                      style={{
                        aspectRatio: '1', overflow: 'hidden', position: 'relative', cursor: 'pointer',
                      }}
                    >
                      <img
                        src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                        alt="" loading="lazy"
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          opacity: selected ? 1 : 0.45,
                          transition: 'opacity .15s, transform .3s',
                        }}
                        onMouseEnter={e => { if (!selected) e.currentTarget.style.opacity = '0.7' }}
                        onMouseLeave={e => { if (!selected) e.currentTarget.style.opacity = '0.45' }}
                      />
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 22, height: 22, borderRadius: '50%',
                        background: selected ? '#6366f1' : 'rgba(0,0,0,.4)',
                        border: selected ? 'none' : '2px solid rgba(255,255,255,.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s',
                      }}>
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.05)' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.15)' }}>Powered by Pixflow</p>
        </div>
      </div>
    </div>
  )
}
