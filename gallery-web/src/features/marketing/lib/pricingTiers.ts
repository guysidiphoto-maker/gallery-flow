// Subscription tiers shown on the homepage and /pricing. Prices mirror the
// `plans` table; keep in sync if pricing changes.

export interface Tier {
  id: string
  name: string
  priceIls: number
  tagline: string
  photosPerMonth: string
  storage: string
  features: string[]
  highlight?: boolean
}

export const TIERS: Tier[] = [
  {
    id: 'pro', name: 'Solo', priceIls: 39, tagline: 'לצלם העצמאי',
    photosPerMonth: '2,000 תמונות בחודש', storage: '75GB אחסון',
    features: ['זיהוי פנים כלול', 'ללא ווטרמרק', 'סטוריז', 'מיתוג אישי'],
  },
  {
    id: 'business', name: 'Pro', priceIls: 75, tagline: 'לעסק שצומח', highlight: true,
    photosPerMonth: '10,000 תמונות בחודש', storage: '400GB אחסון',
    features: ['כל מה שב-Solo', 'דומיין מותאם אישית', 'גלריות ללא הגבלה', 'תמיכה מועדפת'],
  },
  {
    id: 'agency', name: 'Studio', priceIls: 120, tagline: 'לסטודיו ולצוות',
    photosPerMonth: '30,000 תמונות בחודש', storage: '1.5TB אחסון',
    features: ['כל מה שב-Pro', 'כלי ה-AI לסושיאל', 'ניהול מספר צלמים', 'ליווי אישי'],
  },
]
