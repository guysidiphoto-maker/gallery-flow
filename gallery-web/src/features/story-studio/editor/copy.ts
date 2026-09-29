import type { MotionEffect, StoryLength, StoryTemplate, TransitionType } from "../sceneplan";

export type Pace = "relaxed" | "balanced" | "energetic";
export type OrderMode = "locked" | "suggested";

// Hebrew UI copy — plain, non-technical wording for photographers.
export const HE = {
  template: "סגנון",
  length: "אורך",
  pace: "קצב",
  order: "סדר",
  orderLocked: "הסדר שלי",
  orderSuggested: "עריכה מוצעת",
  regenerate: "צור מחדש אוטומטית",
  reset: "איפוס לעריכה של פיקספלו",
  resetConfirm: "לאפס את כל השינויים ולחזור לעריכה האוטומטית?",
  undo: "בטל",
  redo: "בצע שוב",
  addPhoto: "הוסף תמונה",
  duplicate: "שכפל",
  remove: "הסר",
  duration: "משך",
  motion: "תנועה",
  transition: "מעבר",
  fitFull: "מילוי מלא",
  fitContain: "התאמה (עם רקע)",
  focal: "נקודת מיקוד (לחצו על התמונה)",
  caption: "כותרת על התמונה",
  eventTitle: "שם האירוע",
  eventDate: "תאריך / כיתוב פתיח",
  scene: "סצנה",
  saving: "שומר…",
  saved: "נשמר",
  failed: "שמירה נכשלה",
  seconds: "שנ׳",
  total: "אורך כולל",
  storySettings: "כותרת וסיום",
  showOutro: "כרטיס סיום ממותג",
  showLogo: "הצג לוגו",
  captionPos: "מיקום הכיתוב",
  posTop: "למעלה",
  posCenter: "מרכז",
  posBottom: "למטה",
  addPhotoTitle: "הוספת תמונות מהגלריה",
  noMorePhotos: "כל התמונות כבר בסטורי",
  reorderHint: "חצים ← → להזזת הסצנה",
  music: "מוזיקה",
  noMusic: "ללא מוזיקה",
  volume: "עוצמה",
  fadeIn: "עליה הדרגתית",
  fadeOut: "דעיכה",
};

export const TEMPLATE_HE: Record<StoryTemplate, string> = {
  "editorial-clean": "נקי ואלגנטי",
  "cinematic-energy": "קולנועי",
  "fast-highlights": "מהיר לרשתות",
};
export const LENGTH_HE: Record<StoryLength, string> = { short: "קצר", standard: "רגיל", extended: "ארוך" };
export const PACE_HE: Record<Pace, string> = {
  relaxed: "רגוע",
  balanced: "מאוזן",
  energetic: "אנרגטי",
};
export const MOTION_HE: Record<MotionEffect, string> = {
  none: "ללא (סטטי)",
  "push-in": "זום פנימה",
  "pull-out": "זום החוצה",
  pan: "תנועה צידית",
  "focus-zoom": "זום למיקוד",
  "punch-in": "זום נקישה",
  parallax: "פרלקס (עומק)",
  reveal: "חשיפה מכיוון",
};
export const TRANSITION_HE: Record<TransitionType, string> = {
  cut: "חיתוך חד",
  "cross-dissolve": "מעבר רך",
  slide: "החלקה",
  "soft-blur": "טשטוש רך",
  "light-leak": "הבזק אור",
  whip: "החלקה מהירה",
  "fade-color": "עמעום דרך צבע",
  "masked-reveal": "חשיפה במסכה",
  "match-cut": "חיתוך תואם",
};
