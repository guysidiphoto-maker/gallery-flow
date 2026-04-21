import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../store/session'
import { useGallery } from '../store/gallery'
import type { ProjectData } from '../App'

interface Question {
  id: string
  label: string
  required: boolean
}

interface Questionnaire {
  id: string
  title: string
  description: string | null
  questions: Question[]
  gallery_id: string | null
  background_url: string | null
  send_method: 'none' | 'email' | 'sms'
  is_active: boolean
  created_at: string
}

interface QuestionnaireResponse {
  id: string
  respondent_name: string
  respondent_phone: string | null
  respondent_email: string | null
  answers: Record<string, string>
  created_at: string
}

interface QuestionnaireBuilderProps {
  clientName: string
  projects: ProjectData[]
  onClose: () => void
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const GALLERY_WEB_URL = 'https://pixflow-ai.com'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export function QuestionnaireBuilder({ clientName, projects, onClose }: QuestionnaireBuilderProps) {
  const business = useSession(s => s.business)
  const addToast = useGallery(s => s.addToast)

  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Questionnaire | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<Question[]>([
    { id: genId(), label: '', required: true },
  ])
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>('')
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [sendMethod, setSendMethod] = useState<'none' | 'email' | 'sms'>('none')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [viewingResponses, setViewingResponses] = useState<Questionnaire | null>(null)
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([])
  const [loadingResponses, setLoadingResponses] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const publishedProjects = projects.filter(p => p.publishState?.status === 'live')

  useEffect(() => {
    if (!business?.id) return
    supabase
      .from('questionnaires')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setQuestionnaires(data as Questionnaire[])
        setLoading(false)
      })
  }, [business?.id])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setQuestions([{ id: genId(), label: '', required: true }])
    setSelectedGalleryId('')
    setBackgroundUrl('')
    setSendMethod('none')
    setEditing(null)
    setShowForm(false)
  }

  const startEdit = (q: Questionnaire) => {
    setTitle(q.title)
    setDescription(q.description || '')
    setQuestions(q.questions.length > 0 ? q.questions : [{ id: genId(), label: '', required: true }])
    setSelectedGalleryId(q.gallery_id || '')
    setBackgroundUrl(q.background_url || '')
    setSendMethod(q.send_method || 'none')
    setEditing(q)
    setShowForm(true)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !business?.id) return

    setUploading(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `questionnaires/${business.id}/${genId()}.${ext}`

    const { error } = await supabase.storage
      .from('gallery-images')
      .upload(path, file, { contentType: file.type, upsert: true })

    if (error) {
      addToast('שגיאה בהעלאת תמונה', 'error')
      setUploading(false)
      return
    }

    const url = `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${path}`
    setBackgroundUrl(url)
    setUploading(false)

    // Reset input so same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!business?.id) return
    const trimTitle = title.trim()
    if (!trimTitle) { addToast('נא להזין כותרת לשאלון', 'error'); return }

    const validQuestions = questions.filter(q => q.label.trim())
    if (validQuestions.length === 0) { addToast('נא להוסיף לפחות שאלה אחת', 'error'); return }

    setSaving(true)

    const payload = {
      business_id: business.id,
      gallery_id: selectedGalleryId || null,
      title: trimTitle,
      description: description.trim() || null,
      questions: validQuestions.map(q => ({ ...q, label: q.label.trim() })),
      background_url: backgroundUrl.trim() || null,
      send_method: sendMethod,
      is_active: true,
    }

    if (editing) {
      const { error } = await supabase
        .from('questionnaires')
        .update(payload)
        .eq('id', editing.id)

      if (error) {
        addToast('שגיאה בשמירה', 'error')
        setSaving(false)
        return
      }
      setQuestionnaires(prev => prev.map(q => q.id === editing.id ? { ...q, ...payload } as Questionnaire : q))
    } else {
      const { data, error } = await supabase
        .from('questionnaires')
        .insert(payload)
        .select()
        .single()

      if (error || !data) {
        addToast('שגיאה ביצירת השאלון', 'error')
        setSaving(false)
        return
      }
      setQuestionnaires(prev => [data as Questionnaire, ...prev])
    }

    setSaving(false)
    resetForm()
    addToast(editing ? 'השאלון עודכן' : 'השאלון נוצר בהצלחה', 'success')
  }

  const handleDelete = async (id: string) => {
    await supabase.from('questionnaires').update({ is_active: false }).eq('id', id)
    setQuestionnaires(prev => prev.filter(q => q.id !== id))
    addToast('השאלון נמחק', 'info')
  }

  const viewResponses = async (q: Questionnaire) => {
    setViewingResponses(q)
    setLoadingResponses(true)
    const { data } = await supabase
      .from('questionnaire_responses')
      .select('*')
      .eq('questionnaire_id', q.id)
      .order('created_at', { ascending: false })
    setResponses((data || []) as QuestionnaireResponse[])
    setLoadingResponses(false)
  }

  const copyLink = (id: string) => {
    const url = `${GALLERY_WEB_URL}/q/${id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const addQuestion = () => {
    setQuestions(prev => [...prev, { id: genId(), label: '', required: false }])
  }

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  const updateQuestion = (id: string, field: keyof Question, value: string | boolean) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  // ── Styles ──

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,.1)',
    background: 'rgba(255,255,255,.04)',
    color: '#fff', fontSize: 14, fontFamily: 'inherit',
    outline: 'none', direction: 'rtl',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: 'pointer', WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'left 14px center', paddingLeft: 32,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 6, display: 'block',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '11px 22px', borderRadius: 10,
    border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  }

  const btnSecondary: React.CSSProperties = {
    padding: '9px 16px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(255,255,255,.04)',
    color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 500,
    fontFamily: 'inherit', cursor: 'pointer',
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
    border: `1px solid ${active ? 'rgba(99,102,241,.4)' : 'rgba(255,255,255,.1)'}`,
    background: active ? 'rgba(99,102,241,.12)' : 'transparent',
    color: active ? '#818cf8' : 'rgba(255,255,255,.45)',
    cursor: 'pointer', fontFamily: 'inherit',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 520, maxHeight: '88vh',
        background: '#111118', borderRadius: 16,
        border: '1px solid rgba(255,255,255,.08)',
        boxShadow: '0 32px 80px rgba(0,0,0,.6)',
        overflow: 'auto', padding: '24px 28px',
        direction: 'rtl',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#fff' }}>
            שאלונים — {clientName}
          </h2>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {viewingResponses ? (
          <>
            {/* Responses header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button onClick={() => setViewingResponses(null)} style={{
                width: 28, height: 28, borderRadius: 6, border: 'none',
                background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.5)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>תשובות — {viewingResponses.title}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', display: 'block' }}>
                  {responses.length} תשובות
                </span>
              </div>
            </div>

            {loadingResponses ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>טוען...</p>
            ) : responses.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 13, lineHeight: 1.6, padding: '20px 0' }}>
                אין תשובות עדיין לשאלון הזה.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {responses.map(r => (
                  <div key={r.id} style={{
                    padding: '14px 16px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,.08)',
                    background: 'rgba(255,255,255,.02)',
                  }}>
                    {/* Respondent info */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'rgba(99,102,241,.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 600, color: '#818cf8',
                        }}>
                          {r.respondent_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', display: 'block' }}>{r.respondent_name}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.25)' }}>
                            {r.respondent_phone || ''}{r.respondent_phone && r.respondent_email ? ' · ' : ''}{r.respondent_email || ''}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.2)' }}>
                        {new Date(r.created_at).toLocaleDateString('he-IL')} {new Date(r.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Answers */}
                    {viewingResponses.questions.map(q => {
                      const answer = r.answers[q.id]
                      if (!answer) return null
                      return (
                        <div key={q.id} style={{ marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', display: 'block', marginBottom: 2 }}>{q.label}</span>
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', lineHeight: 1.5 }}>{answer}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : showForm ? (
          <>
            {/* ── Title ── */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>כותרת השאלון</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="לדוגמה: שאלון לפני צילום" style={inputStyle} />
            </div>

            {/* ── Description ── */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>תיאור <span style={{ color: 'rgba(255,255,255,.2)' }}>(לא חובה)</span></label>
              <input value={description} onChange={e => setDescription(e.target.value)}
                placeholder="הסבר קצר שיופיע ללקוח" style={inputStyle} />
            </div>

            {/* ── Gallery link ── */}
            {publishedProjects.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>קישור גלריה <span style={{ color: 'rgba(255,255,255,.2)' }}>(אחרי מילוי השאלון)</span></label>
                <select value={selectedGalleryId} onChange={e => setSelectedGalleryId(e.target.value)} style={selectStyle}>
                  <option value="">ללא גלריה</option>
                  {publishedProjects.map(p => (
                    <option key={p.publishState!.galleryDbId} value={p.publishState!.galleryDbId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Background image ── */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>תמונת רקע</label>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={handleFileUpload} style={{ display: 'none' }} />
              {backgroundUrl ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {/* Thumbnails */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Mobile preview */}
                    <div style={{
                      width: 48, height: 80, borderRadius: 6, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,.12)',
                      background: `url(${backgroundUrl}) center/cover`,
                      position: 'relative',
                    }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} />
                      <span style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: 'rgba(255,255,255,.5)' }}>מובייל</span>
                    </div>
                    {/* Desktop preview */}
                    <div style={{
                      width: 100, height: 60, borderRadius: 6, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,.12)',
                      background: `url(${backgroundUrl}) center/cover`,
                      position: 'relative',
                    }}>
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} />
                      <span style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: 'rgba(255,255,255,.5)' }}>דסקטופ</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <button onClick={() => fileInputRef.current?.click()} style={{ ...btnSecondary, fontSize: 11, padding: '6px 12px' }}>
                      החלף
                    </button>
                    <button onClick={() => setBackgroundUrl('')} style={{
                      ...btnSecondary, fontSize: 11, padding: '6px 12px',
                      color: '#f87171', borderColor: 'rgba(239,68,68,.2)',
                    }}>
                      הסר
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
                  ...btnSecondary, width: '100%', padding: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderStyle: 'dashed', opacity: uploading ? .5 : 1,
                }}>
                  {uploading ? (
                    'מעלה...'
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      העלה תמונת רקע
                    </>
                  )}
                </button>
              )}
            </div>

            {/* ── Send method ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>שליחה אוטומטית אחרי מילוי</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSendMethod('none')} style={pillStyle(sendMethod === 'none')}>ללא</button>
                <button onClick={() => setSendMethod('sms')} style={pillStyle(sendMethod === 'sms')}>SMS</button>
                <button onClick={() => setSendMethod('email')} style={pillStyle(sendMethod === 'email')}>אימייל</button>
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '16px 0' }} />

            {/* ── Built-in fields ── */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>שדות מובנים</label>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(99,102,241,.04)', border: '1px solid rgba(99,102,241,.1)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>שם מלא</span>
                  <span style={{ fontSize: 10, color: 'rgba(99,102,241,.5)', marginRight: 'auto' }}>חובה</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>טלפון</span>
                  <span style={{
                    fontSize: 10, marginRight: 'auto',
                    color: sendMethod === 'sms' ? 'rgba(99,102,241,.5)' : 'rgba(255,255,255,.2)',
                  }}>
                    {sendMethod === 'sms' ? 'חובה (נדרש ל-SMS)' : 'לא חובה'}
                  </span>
                </div>
                {sendMethod === 'email' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)' }}>אימייל</span>
                    <span style={{ fontSize: 10, color: 'rgba(99,102,241,.5)', marginRight: 'auto' }}>חובה (נדרש לשליחת מייל)</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Custom questions ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>שאלות מותאמות</label>
              {questions.map((q, i) => (
                <div key={q.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', minWidth: 16 }}>{i + 1}.</span>
                  <input value={q.label} onChange={e => updateQuestion(q.id, 'label', e.target.value)}
                    placeholder="הקלד שאלה..." style={{ ...inputStyle, flex: 1, padding: '9px 12px', fontSize: 13 }} />
                  <label style={{
                    fontSize: 11, color: 'rgba(255,255,255,.3)', display: 'flex',
                    alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    <input type="checkbox" checked={q.required}
                      onChange={e => updateQuestion(q.id, 'required', e.target.checked)}
                      style={{ width: 13, height: 13, accentColor: '#6366f1' }} />
                    חובה
                  </label>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(q.id)} style={{
                      width: 26, height: 26, borderRadius: 6, border: 'none',
                      background: 'rgba(239,68,68,.08)', color: '#f87171',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addQuestion} style={{ ...btnSecondary, fontSize: 11, padding: '7px 12px', marginTop: 2 }}>
                + הוסף שאלה
              </button>
            </div>

            {/* ── Actions ── */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? .6 : 1 }}>
                {saving ? 'שומר...' : editing ? 'עדכן שאלון' : 'צור שאלון'}
              </button>
              <button onClick={resetForm} style={btnSecondary}>ביטול</button>
            </div>
          </>
        ) : (
          <>
            {/* Create new */}
            <button onClick={() => setShowForm(true)} style={{
              ...btnPrimary, width: '100%', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 24px',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              שאלון חדש
            </button>

            {/* List */}
            {loading ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>טוען...</p>
            ) : questionnaires.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 13, lineHeight: 1.6 }}>
                אין שאלונים עדיין. צור שאלון חדש כדי לשלוח ללקוחות.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionnaires.map(q => (
                  <div key={q.id} style={{
                    padding: '12px 14px', borderRadius: 10,
                    border: '1px solid rgba(255,255,255,.08)',
                    background: 'rgba(255,255,255,.02)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{q.title}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {q.send_method !== 'none' && (
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 5,
                            background: 'rgba(99,102,241,.1)', color: '#818cf8',
                          }}>
                            {q.send_method === 'sms' ? 'SMS' : 'אימייל'}
                          </span>
                        )}
                        {q.background_url && (
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 5,
                            background: 'rgba(34,197,94,.1)', color: '#4ade80',
                          }}>רקע</span>
                        )}
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.25)' }}>
                          {q.questions.length + 2} שדות
                        </span>
                      </div>
                    </div>
                    {q.description && (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', margin: '0 0 6px' }}>{q.description}</p>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={() => copyLink(q.id)} style={{
                        ...btnSecondary, fontSize: 11, padding: '5px 10px',
                        background: copiedId === q.id ? 'rgba(34,197,94,.1)' : undefined,
                        borderColor: copiedId === q.id ? 'rgba(34,197,94,.3)' : undefined,
                        color: copiedId === q.id ? '#22c55e' : undefined,
                      }}>
                        {copiedId === q.id ? 'הועתק!' : 'העתק לינק'}
                      </button>
                      <button onClick={() => viewResponses(q)} style={{ ...btnSecondary, fontSize: 11, padding: '5px 10px' }}>תשובות</button>
                      <button onClick={() => startEdit(q)} style={{ ...btnSecondary, fontSize: 11, padding: '5px 10px' }}>ערוך</button>
                      <button onClick={() => handleDelete(q.id)} style={{
                        ...btnSecondary, fontSize: 11, padding: '5px 10px',
                        color: '#f87171', borderColor: 'rgba(239,68,68,.15)',
                      }}>מחק</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
