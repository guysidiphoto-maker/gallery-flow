// MetadataEnrichment — inline "סווג אירוע / Classify event" editor rendered on
// a tender gallery card. Writes through POST /api/gallery-metadata (owner JWT,
// server-side validation + audit). Gradual enrichment: every field is optional,
// NULL/empty = Unclassified, and nothing is ever required or fabricated.

import { useState } from 'react'
import { authedFetch } from '../../lib/authedFetch'
import {
  EVENT_TYPES, EVENT_SIZE_BUCKETS, VENUE_TYPES, TIMES_OF_DAY, METADATA_LIMITS,
} from './metadata'
import { t, type Locale } from './strings'

export interface GalleryMetadataValues {
  event_type: string | null
  event_location: string | null
  event_date: string | null
  event_size_bucket: string | null
  industry: string | null
  venue_type: string | null
  time_of_day: string | null
  event_keywords: string[]
}

interface Props {
  galleryId: string
  values: GalleryMetadataValues
  locale?: Locale
  onSaved: (next: GalleryMetadataValues) => void
  onClose: () => void
}

const field: React.CSSProperties = {
  width: '100%', padding: '8px 10px', boxSizing: 'border-box',
  background: 'rgba(0,0,0,.35)', border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 8, color: '#fff', fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.65)',
  letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4, display: 'block',
}

export function MetadataEnrichment({ galleryId, values, locale = 'he', onSaved, onClose }: Props) {
  const [form, setForm] = useState<GalleryMetadataValues>({ ...values })
  const [keywordsText, setKeywordsText] = useState((values.event_keywords ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  const set = <K extends keyof GalleryMetadataValues>(key: K, value: GalleryMetadataValues[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    setStatus('idle')
    const keywords = keywordsText
      .split(',').map(s => s.trim()).filter(Boolean)
      .slice(0, METADATA_LIMITS.keywords_max)
      .map(k => k.slice(0, METADATA_LIMITS.keyword))
    const payload = {
      action: 'update_gallery_metadata',
      galleryId,
      event_type: form.event_type,
      event_location: form.event_location,
      event_date: form.event_date,
      event_size_bucket: form.event_size_bucket,
      industry: form.industry,
      venue_type: form.venue_type,
      time_of_day: form.time_of_day,
      event_keywords: keywords,
    }
    try {
      const res = await authedFetch('/api/gallery-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setStatus('error'); return }
      setStatus('saved')
      onSaved({ ...form, event_keywords: keywords })
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const enumChips = (
    label: string,
    options: readonly string[],
    current: string | null,
    labelFor: (key: string) => string,
    onPick: (v: string | null) => void,
  ) => (
    <div>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {options.map(opt => {
          const active = current === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onPick(active ? null : opt)}
              style={{
                padding: '5px 11px', borderRadius: 50, fontSize: 11.5, fontWeight: 500,
                background: active ? 'linear-gradient(135deg, rgba(99,102,241,.3), rgba(168,85,247,.22))' : 'rgba(255,255,255,.05)',
                color: active ? '#fff' : 'rgba(255,255,255,.75)',
                border: `1px solid ${active ? 'rgba(129,140,248,.45)' : 'rgba(255,255,255,.12)'}`,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
              }}
            >
              {labelFor(opt)}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{
      padding: 14, borderTop: '1px solid rgba(255,255,255,.06)',
      background: 'rgba(0,0,0,.25)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#c7d2fe' }}>
          {t(locale, 'tender.classify')}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
            color: 'rgba(255,255,255,.7)', borderRadius: 7, padding: '3px 10px',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t(locale, 'tender.classify.close')}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
        {t(locale, 'tender.classify.hint')}
      </div>

      {enumChips(
        t(locale, 'tender.filters.event_type'), EVENT_TYPES.map(e => e.key),
        form.event_type,
        key => {
          const et = EVENT_TYPES.find(e => e.key === key)
          return et ? `${et.icon} ${locale === 'he' ? et.he : et.en}` : key
        },
        v => set('event_type', v),
      )}

      {enumChips(
        t(locale, 'tender.filters.size'), EVENT_SIZE_BUCKETS,
        form.event_size_bucket,
        key => t(locale, `tender.size.${key}` as Parameters<typeof t>[1]),
        v => set('event_size_bucket', v),
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {enumChips(
          t(locale, 'tender.filters.venue'), VENUE_TYPES,
          form.venue_type,
          key => t(locale, `tender.venue.${key}` as Parameters<typeof t>[1]),
          v => set('venue_type', v),
        )}
        {enumChips(
          t(locale, 'tender.filters.time'), TIMES_OF_DAY,
          form.time_of_day,
          key => t(locale, `tender.time.${key}` as Parameters<typeof t>[1]),
          v => set('time_of_day', v),
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={labelStyle}>{t(locale, 'tender.filters.industry')}</span>
          <input
            type="text"
            value={form.industry ?? ''}
            maxLength={METADATA_LIMITS.industry}
            onChange={e => set('industry', e.target.value || null)}
            placeholder={t(locale, 'tender.filters.industry.placeholder')}
            style={field}
          />
        </div>
        <div>
          <span style={labelStyle}>{t(locale, 'tender.filters.location')}</span>
          <input
            type="text"
            value={form.event_location ?? ''}
            maxLength={METADATA_LIMITS.event_location}
            onChange={e => set('event_location', e.target.value || null)}
            placeholder={t(locale, 'tender.filters.location.placeholder')}
            style={field}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={labelStyle}>{t(locale, 'tender.classify.date')}</span>
          <input
            type="date"
            value={form.event_date ?? ''}
            onChange={e => set('event_date', e.target.value || null)}
            style={{ ...field, colorScheme: 'dark' }}
          />
        </div>
        <div>
          <span style={labelStyle}>{t(locale, 'tender.filters.keywords')}</span>
          <input
            type="text"
            value={keywordsText}
            onChange={e => setKeywordsText(e.target.value)}
            placeholder={t(locale, 'tender.filters.keywords.placeholder')}
            style={field}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: '8px 18px', borderRadius: 9, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            boxShadow: '0 4px 14px rgba(99,102,241,.35)',
          }}
        >
          {saving ? t(locale, 'tender.classify.saving') : t(locale, 'tender.classify.save')}
        </button>
        {status === 'saved' && (
          <span style={{ fontSize: 11.5, color: '#6ee7b7' }}>{t(locale, 'tender.classify.saved')}</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 11.5, color: '#fca5a5' }}>{t(locale, 'tender.classify.failed')}</span>
        )}
      </div>
    </div>
  )
}
