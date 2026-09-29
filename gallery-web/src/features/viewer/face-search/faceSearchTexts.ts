export type FaceSearchLang = 'en' | 'he'

export const faceTexts = {
  en: {
    findYourPhotos: 'Find Your Photos',
    takeSelfie: 'Take a quick selfie and we\'ll find your photos',
    findMyPhotos: 'Find my photos',
    selfiePrivacy: 'Your photos are private — your selfie isn\'t saved',
    cameraTip: 'Take a selfie to find your photos',
    or: 'or',
    uploadPhoto: 'Upload a photo',
    photosFound: 'photos found',
    viewYourPhotos: 'View your photos',
    noMatch: 'No match found',
    tipsTitle: 'Tips for better recognition:',
    tip1: 'Make sure your face is well-lit',
    tip2: 'Remove sunglasses or hats',
    tip3: 'Face the camera directly',
    browseAll: 'Browse all photos',
    tryAgain: 'Try again',
    privateNoMatch: 'Could not identify you',
    privateNoMatchMsg: 'Your photos may not be available in this gallery, or the selfie wasn\'t clear enough',
    talkToPhotographer: 'If this seems wrong — talk to the photographer',
    retake: 'Take photo again',
  },
  he: {
    findYourPhotos: 'מצא את התמונות שלך',
    takeSelfie: 'צלם סלפי מהיר ונמצא את התמונות שלך',
    findMyPhotos: 'מצא את התמונות שלי',
    selfiePrivacy: 'התמונות שלך מוגנות — סלפי לא נשמר',
    cameraTip: 'צלם סלפי כדי למצוא את התמונות שלך',
    or: 'או',
    uploadPhoto: 'העלה תמונה',
    photosFound: 'תמונות נמצאו',
    viewYourPhotos: 'צפה בתמונות שלך',
    noMatch: 'לא נמצאה התאמה',
    tipsTitle: 'טיפים לזיהוי טוב יותר:',
    tip1: 'ודא שהפנים מוארות היטב',
    tip2: 'הסר משקפי שמש או כובע',
    tip3: 'הסתכל ישר למצלמה',
    browseAll: 'עבור על כל התמונות',
    tryAgain: 'נסה שוב',
    privateNoMatch: 'לא הצלחנו לזהות אותך',
    privateNoMatchMsg: 'ייתכן שהתמונות שלך אינן זמינות בגלריה זו, או שהסלפי לא היה ברור מספיק',
    talkToPhotographer: 'אם זה נראה שגוי — דבר עם הצלם',
    retake: 'צלם שוב',
  },
}

export type FaceTexts = (typeof faceTexts)['en']

export const THINKING_LINES_MAP: Record<FaceSearchLang, string[]> = {
  he: [
    'רגע... מחפשים אותך',
    'עוברים על התמונות',
    'יש מצב שתפסנו אותך...',
    'עוד שנייה ויש לנו את זה',
  ],
  en: [
    'Hold on... searching for you',
    'Scanning through the photos',
    'We might have found you...',
    'Almost there!',
  ],
}

/** CSS direction class for copy blocks (kept as CSS, not a `dir` attribute, to match the original DOM). */
export function dirClass(lang: FaceSearchLang): string {
  return lang === 'he' ? '[direction:rtl]' : '[direction:ltr]'
}
