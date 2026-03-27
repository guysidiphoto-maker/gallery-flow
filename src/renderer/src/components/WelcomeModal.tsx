import React, { useState } from 'react'

interface Props {
  onClose: () => void
}

interface Slide {
  icon: React.ReactNode
  tag: string
  title: string
  body: React.ReactNode
}

const slides: Slide[] = [
  {
    tag: 'Gallery Order',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    title: 'סדר התמונות = שמות הקבצים',
    body: (
      <>
        <p>
          כשאתה גורר תמונה למיקום אחר בגלריה, אתה קובע את הסדר שבו היא תופיע.
          לחיצה על <strong>Apply Order</strong> בטולבר תשנה את שמות הקבצים בתיקיית המקור
          כדי לשקף את הסדר הזה — <em>0001.jpg, 0002.jpg…</em>
        </p>
        <p>
          כך כשתשלח את התיקייה ללקוח או תעלה לפלטפורמה, הסדר שבחרת ישמר אוטומטית.
          אפשר גם להוסיף prefix לשמות, למשל <em>wedding_0001.jpg</em>.
        </p>
      </>
    )
  },
  {
    tag: 'Top Picks',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    title: 'T = תמונה קדימה',
    body: (
      <>
        <p>
          לחיצה על <strong>T</strong> על תמונה מסמנת אותה כ-Top Pick —
          היא קופצת לתחילת הגלריה, ושמה ישתנה כך שתופיע ראשונה לאחר Apply Order.
          הבחירה עוברת אוטומטית לתמונה הבאה כדי לא לשבור את הפלואו.
        </p>
        <p>
          כל התמונות שסימנת כ-Top Picks מוצגות עם כוכב זהב ומאוחסנות יחד.
          הן הבסיס לכל הייצוא — סטורי, אינסטגרם, וסקשנים.
        </p>
      </>
    )
  },
  {
    tag: 'Story & Social',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    title: 'ייצוא ל-Story ואינסטגרם',
    body: (
      <>
        <p>
          <strong>Create Story</strong> — ייצור סרטון 9:16 מ-Top Picks שלך, עם אנימציית Ken Burns,
          מעברים ואפקטי תנועה. אפשר לבחור סגנון, משך ולסדר את הסצנות לפני הייצוא.
        </p>
        <p>
          <strong>Social</strong> — מייצא את ה-Top Picks כתמונות 1080×1350 (פורמט 4:5 לאינסטגרם)
          ויוצר מדריך פרסום ויזואלי שמראה את הסדר המומלץ לפוסטים.
        </p>
      </>
    )
  },
  {
    tag: 'Export to Folder',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <polyline points="9 14 12 17 15 14" />
      </svg>
    ),
    title: 'לשמור בחזרה לתיקייה',
    body: (
      <>
        <p>
          כשסיימת לסדר, לסמן Top Picks וליצור Sections —
          לחץ <strong>Apply Order</strong> בטולבר.
          הפעולה משנה את שמות הקבצים ישירות <em>בתיקיית המקור</em> במחשב שלך,
          כך שהשינויים קיימים גם מחוץ לאפליקציה.
        </p>
        <p>
          אם יש לך סקשנים, לחץ <strong>Publish Sections</strong> — הוא יעתיק את
          התמונות לתיקיות מחולקות לפי שם הסקשן, מוכנות לשליחה ללקוח.
        </p>
      </>
    )
  }
]

export function WelcomeModal({ onClose }: Props) {
  const [idx, setIdx] = useState(0)
  const slide = slides[idx]
  const isLast = idx === slides.length - 1

  return (
    <div className="modal-backdrop welcome-backdrop">
      <div className="modal welcome-modal">

        {/* Progress dots */}
        <div className="welcome-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`welcome-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}`}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>

        {/* Slide content */}
        <div className="welcome-body">
          <div className="welcome-top">
            <div className="welcome-icon">{slide.icon}</div>
            <span className="welcome-tag">{slide.tag}</span>
          </div>
          <h2 className="welcome-title">{slide.title}</h2>
          <div className="welcome-text">{slide.body}</div>
        </div>

        {/* Footer */}
        <div className="welcome-footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Skip
          </button>
          <div className="welcome-footer__right">
            {idx > 0 && (
              <button className="btn btn--ghost" onClick={() => setIdx(i => i - 1)}>
                ← Back
              </button>
            )}
            <button
              className="btn btn--accent welcome-next"
              onClick={() => isLast ? onClose() : setIdx(i => i + 1)}
            >
              {isLast ? "Let's go →" : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
