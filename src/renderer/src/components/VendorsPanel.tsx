import React, { useState } from 'react'
import { useVendors, type Vendor } from '../store/vendors'
import { useGallery } from '../store/gallery'

const VENDOR_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4']
const CATEGORIES = ['Venue', 'Catering', 'DJ/Music', 'Decor', 'Lighting', 'Photo Booth', 'Flowers', 'AV/Tech', 'Other']

export function VendorsPanel() {
  const { vendors, tags, isPanelOpen, activeVendorFilter, editingVendorId, addVendor, renameVendor, updateVendor, deleteVendor, tagImages, untagImages, setActiveVendorFilter, setEditingVendorId, togglePanel } = useVendors()
  const { images, selectedImageIds } = useGallery()
  const [newName, setNewName] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  if (!isPanelOpen) return null

  const selectedIds = Array.from(selectedImageIds || [])

  const handleAdd = () => {
    if (!newName.trim()) return
    addVendor(newName.trim())
    setNewName('')
  }

  const handleTagSelected = (vendorId: string) => {
    if (selectedIds.length === 0) return
    tagImages(selectedIds, vendorId)
  }

  const handleUntagSelected = (vendorId: string) => {
    if (selectedIds.length === 0) return
    untagImages(selectedIds, vendorId)
  }

  const copyCode = (vendor: Vendor) => {
    const url = `${window.location.origin}/vendor/${vendor.accessCode}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(vendor.id)
      setTimeout(() => setCopiedCode(null), 1500)
    })
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 300,
      background: 'rgba(14,14,24,.98)', borderLeft: '1px solid rgba(255,255,255,.06)',
      backdropFilter: 'blur(20px)', zIndex: 500, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.9)', margin: 0 }}>Vendors</h3>
        <button onClick={togglePanel} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,.3)',
          cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Add vendor */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Add vendor..."
            style={{
              flex: 1, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
              color: '#fff', background: 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.08)', borderRadius: 7, outline: 'none',
            }}
          />
          <button onClick={handleAdd} style={{
            padding: '7px 12px', borderRadius: 7, border: 'none',
            background: newName.trim() ? '#6366f1' : 'rgba(255,255,255,.05)',
            color: newName.trim() ? '#fff' : 'rgba(255,255,255,.3)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Add
          </button>
        </div>
        {selectedIds.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#818cf8', fontWeight: 500 }}>
            {selectedIds.length} photos selected — click a vendor to tag
          </div>
        )}
      </div>

      {/* Filter: All */}
      <div style={{ padding: '8px 16px 4px' }}>
        <button
          onClick={() => setActiveVendorFilter(null)}
          style={{
            width: '100%', padding: '6px 10px', borderRadius: 6,
            background: activeVendorFilter === null ? 'rgba(255,255,255,.06)' : 'transparent',
            border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          All Photos ({images.length})
        </button>
      </div>

      {/* Vendor list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {vendors.map((v, i) => {
          const color = VENDOR_COLORS[i % VENDOR_COLORS.length]
          const count = tags.filter(t => t.vendorId === v.id).length
          const isActive = activeVendorFilter === v.id
          const isEditing = editingVendorId === v.id

          return (
            <div key={v.id} style={{ marginBottom: 2 }}>
              <div
                onClick={() => {
                  if (selectedIds.length > 0) {
                    handleTagSelected(v.id)
                  } else {
                    setActiveVendorFilter(isActive ? null : v.id)
                  }
                }}
                style={{
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? 'rgba(255,255,255,.06)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.03)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Color dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: color, flexShrink: 0,
                }} />

                {/* Name + count */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.8)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {v.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>
                    {count} photos{v.category ? ` · ${v.category}` : ''}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  {/* Copy link */}
                  <button
                    onClick={e => { e.stopPropagation(); copyCode(v) }}
                    title="Copy vendor portal link"
                    style={{
                      width: 24, height: 24, borderRadius: 5, border: 'none',
                      background: copiedCode === v.id ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.04)',
                      color: copiedCode === v.id ? '#10b981' : 'rgba(255,255,255,.3)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, transition: 'all .15s',
                    }}
                  >
                    {copiedCode === v.id ? '✓' : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    )}
                  </button>
                  {/* Edit */}
                  <button
                    onClick={e => { e.stopPropagation(); setEditingVendorId(isEditing ? null : v.id) }}
                    style={{
                      width: 24, height: 24, borderRadius: 5, border: 'none',
                      background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.3)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Edit panel */}
              {isEditing && (
                <div style={{
                  margin: '4px 0 8px', padding: 12,
                  background: 'rgba(255,255,255,.03)', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,.06)',
                }}>
                  <input
                    type="text" defaultValue={v.name}
                    onBlur={e => renameVendor(v.id, e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12,
                      color: '#fff', background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, outline: 'none',
                      fontFamily: 'inherit', marginBottom: 6,
                    }}
                    placeholder="Vendor name"
                  />
                  <select
                    value={v.category}
                    onChange={e => updateVendor(v.id, { category: e.target.value })}
                    style={{
                      width: '100%', padding: '6px 8px', fontSize: 11,
                      color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, outline: 'none',
                      fontFamily: 'inherit', marginBottom: 6,
                    }}
                  >
                    <option value="">Category...</option>
                    {CATEGORIES.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                    <span style={{ color: 'rgba(255,255,255,.3)', padding: '4px 0' }}>Code: {v.accessCode}</span>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => { deleteVendor(v.id); setEditingVendorId(null) }}
                      style={{
                        padding: '4px 8px', borderRadius: 4, border: 'none',
                        background: 'rgba(239,68,68,.1)', color: '#ef4444',
                        fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {vendors.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,.25)', fontSize: 12 }}>
            Add vendors to tag photos for them
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,.04)',
        fontSize: 10, color: 'rgba(255,255,255,.2)', lineHeight: 1.4,
      }}>
        Select photos → click vendor to tag. Each vendor gets a unique download link.
      </div>
    </div>
  )
}
