import { ViewerSpinner } from './ViewerSpinner'

const centered = 'flex min-h-screen items-center justify-center text-[14px] tracking-[0.02em] text-white/40'

export function GalleryLoading() {
  return (
    <div className={centered}>
      <ViewerSpinner />
    </div>
  )
}

/** Localized dead-link state; the raw English error key never reaches guests. */
export function GalleryNotFound() {
  const isRtl = document.documentElement.dir === 'rtl'
  const headline = isRtl ? 'הגלריה לא נמצאה' : 'Gallery not found'
  const body = isRtl
    ? 'הקישור לא תקין או שהגלריה הוסרה. אם קיבלת אותו מהצלם, פנה אליו לבדיקה.'
    : 'The link is invalid or the gallery was removed. If you received it from the photographer, please contact them.'
  return (
    <div className={`${centered} flex-col p-6 text-center`} dir={isRtl ? 'rtl' : 'ltr'}>
      <h1 className="mb-3 font-gallery-heading text-[28px] font-bold tracking-[-0.02em] text-white/98">{headline}</h1>
      <p className="mb-6 max-w-[420px] text-[14px] leading-[1.6] text-white/65">{body}</p>
    </div>
  )
}
