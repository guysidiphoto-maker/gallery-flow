import React, { useState } from 'react'

interface Props {
  onClose: () => void
}

// ── SVG Illustrations ─────────────────────────────────────────────────────────

function IllustrationFolder() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="welcome-illustration">
      {/* Folder */}
      <rect x="30" y="55" width="160" height="100" rx="8" fill="#1e2a3a" stroke="#0a84ff" strokeWidth="1.5" />
      <path d="M30 75 Q30 63 42 63 L90 63 L100 55 L178 55 Q190 55 190 67 L190 75 Z" fill="#1a3a5c" stroke="#0a84ff" strokeWidth="1.5" />
      {/* Images inside */}
      <rect x="48" y="88" width="32" height="24" rx="3" fill="#0a2540" stroke="#1e4a7a" strokeWidth="1" />
      <rect x="48" y="88" width="32" height="24" rx="3" fill="url(#img1)" />
      <rect x="88" y="88" width="32" height="24" rx="3" fill="#0a2540" stroke="#1e4a7a" strokeWidth="1" />
      <rect x="128" y="88" width="32" height="24" rx="3" fill="#0a2540" stroke="#1e4a7a" strokeWidth="1" />
      {/* Mini landscape lines */}
      <polyline points="50,106 56,100 62,104 68,98 76,106" stroke="#0a84ff" strokeWidth="1.5" fill="none" opacity="0.6" />
      <polyline points="90,106 96,99 104,103 112,96 116,106" stroke="#30d158" strokeWidth="1.5" fill="none" opacity="0.6" />
      <polyline points="130,106 136,101 142,105 152,97 156,106" stroke="#ff6b35" strokeWidth="1.5" fill="none" opacity="0.6" />
      {/* More rows */}
      <rect x="48" y="118" width="32" height="24" rx="3" fill="#0a2540" stroke="#1e4a7a" strokeWidth="1" />
      <rect x="88" y="118" width="32" height="24" rx="3" fill="#0a2540" stroke="#1e4a7a" strokeWidth="1" />
      <rect x="128" y="118" width="32" height="24" rx="3" fill="#0a2540" stroke="#1e4a7a" strokeWidth="1" />
      <polyline points="50,136 58,128 64,132 72,126 76,136" stroke="#bf5af2" strokeWidth="1.5" fill="none" opacity="0.6" />
      {/* Cmd+O hint */}
      <rect x="72" y="22" width="76" height="22" rx="6" fill="#0a1929" stroke="#0a84ff" strokeWidth="1" />
      <text x="110" y="37" textAnchor="middle" fill="#0a84ff" fontSize="11" fontFamily="monospace" fontWeight="600">⌘ O</text>
      <line x1="110" y1="44" x2="110" y2="55" stroke="#0a84ff" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
    </svg>
  )
}

function IllustrationOrder() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="welcome-illustration">
      {/* Three image cards */}
      <rect x="18" y="40" width="48" height="60" rx="5" fill="#1a2a3a" stroke="#2a3a4a" strokeWidth="1.5" />
      <rect x="76" y="40" width="48" height="60" rx="5" fill="#1a2a3a" stroke="#0a84ff" strokeWidth="2" />
      <rect x="134" y="40" width="48" height="60" rx="5" fill="#1a2a3a" stroke="#2a3a4a" strokeWidth="1.5" />
      {/* Image thumbnails */}
      <polyline points="24,84 30,74 38,80 48,68 62,84" stroke="#0a84ff" strokeWidth="1.5" fill="none" opacity="0.5" />
      <polyline points="82,84 90,73 100,79 112,65 120,84" stroke="#30d158" strokeWidth="1.5" fill="none" opacity="0.7" />
      <polyline points="140,84 148,75 158,81 168,70 178,84" stroke="#ff6b35" strokeWidth="1.5" fill="none" opacity="0.5" />
      {/* Drag arrow */}
      <path d="M76 70 Q60 70 50 70" stroke="#0a84ff" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#arrow)" />
      <polygon points="20,70 28,66 28,74" fill="#0a84ff" />
      {/* Drag icon on middle card */}
      <circle cx="100" cy="35" r="10" fill="#0a84ff" opacity="0.9" />
      <line x1="96" y1="31" x2="96" y2="39" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="100" y1="31" x2="100" y2="39" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="104" y1="31" x2="104" y2="39" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      {/* Filenames below */}
      <rect x="18" y="108" width="48" height="12" rx="3" fill="#0a1929" />
      <rect x="76" y="108" width="48" height="12" rx="3" fill="#0a84ff" opacity="0.2" />
      <rect x="134" y="108" width="48" height="12" rx="3" fill="#0a1929" />
      <text x="42" y="118" textAnchor="middle" fill="#4a6a8a" fontSize="8" fontFamily="monospace">0002.jpg</text>
      <text x="100" y="118" textAnchor="middle" fill="#0a84ff" fontSize="8" fontFamily="monospace">0001.jpg</text>
      <text x="158" y="118" textAnchor="middle" fill="#4a6a8a" fontSize="8" fontFamily="monospace">0003.jpg</text>
      {/* Apply Order button */}
      <rect x="62" y="140" width="96" height="24" rx="6" fill="#0a84ff" opacity="0.15" stroke="#0a84ff" strokeWidth="1" />
      <text x="110" y="156" textAnchor="middle" fill="#0a84ff" fontSize="11" fontWeight="600">Apply Order ▾</text>
    </svg>
  )
}

function IllustrationTopPick() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="welcome-illustration">
      {/* Before: image at bottom */}
      <rect x="130" y="110" width="64" height="52" rx="5" fill="#1a2a3a" stroke="#2a3a4a" strokeWidth="1.5" opacity="0.5" />
      <text x="162" y="140" textAnchor="middle" fill="#3a5a7a" fontSize="9" fontFamily="monospace">IMG_089.jpg</text>
      {/* Arrow up */}
      <line x1="162" y1="106" x2="162" y2="72" stroke="#ffd60a" strokeWidth="2" strokeDasharray="4 3" />
      <polygon points="162,58 156,72 168,72" fill="#ffd60a" />
      {/* T key */}
      <rect x="148" y="108" width="28" height="28" rx="6" fill="#1a2a3a" stroke="#ffd60a" strokeWidth="1.5" />
      <text x="162" y="127" textAnchor="middle" fill="#ffd60a" fontSize="14" fontWeight="700">T</text>
      {/* After: image at top with star */}
      <rect x="26" y="28" width="80" height="64" rx="5" fill="#1c2e1c" stroke="#30d158" strokeWidth="2" />
      <polyline points="34,80 44,64 56,72 68,56 84,72 96,80" stroke="#30d158" strokeWidth="1.5" fill="none" opacity="0.7" />
      {/* Star badge */}
      <circle cx="95" cy="37" r="11" fill="#1a1a0a" stroke="#ffd60a" strokeWidth="1.5" />
      <text x="95" y="42" textAnchor="middle" fill="#ffd60a" fontSize="13">★</text>
      {/* Filename */}
      <rect x="26" y="98" width="80" height="12" rx="3" fill="#0a2a1a" />
      <text x="66" y="108" textAnchor="middle" fill="#30d158" fontSize="8" fontFamily="monospace">0001.jpg ★</text>
      {/* Other cards faded */}
      <rect x="114" y="28" width="42" height="32" rx="4" fill="#141e28" stroke="#1a2a3a" strokeWidth="1" opacity="0.5" />
      <rect x="162" y="28" width="32" height="32" rx="4" fill="#141e28" stroke="#1a2a3a" strokeWidth="1" opacity="0.5" />
    </svg>
  )
}

function IllustrationStory() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="welcome-illustration">
      {/* Phone frame */}
      <rect x="72" y="18" width="76" height="144" rx="12" fill="#0d0d0d" stroke="#2a2a2a" strokeWidth="2" />
      <rect x="76" y="26" width="68" height="128" rx="7" fill="#111827" />
      {/* Image inside phone */}
      <rect x="76" y="26" width="68" height="128" rx="7" fill="#0a1929" />
      <polyline points="82,118 96,96 110,106 124,86 140,100 144,118" stroke="#0a84ff" strokeWidth="2" fill="none" opacity="0.5" />
      {/* Ken Burns motion arrow */}
      <path d="M90 60 Q110 52 130 60" stroke="#0a84ff" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
      <polygon points="130,56 134,62 126,62" fill="#0a84ff" opacity="0.8" />
      {/* Stars = top picks */}
      <text x="88" y="50" fill="#ffd60a" fontSize="10" opacity="0.8">★</text>
      <text x="100" y="44" fill="#ffd60a" fontSize="12">★</text>
      <text x="114" y="48" fill="#ffd60a" fontSize="10" opacity="0.8">★</text>
      {/* Duration badge */}
      <rect x="84" y="130" width="52" height="16" rx="4" fill="#0a84ff" opacity="0.2" />
      <text x="110" y="141" textAnchor="middle" fill="#0a84ff" fontSize="9" fontWeight="600">20s · 9:16 · H.264</text>
      {/* Side labels */}
      <text x="18" y="98" fill="#4a6a8a" fontSize="9" fontFamily="monospace">1080</text>
      <line x1="34" y1="26" x2="34" y2="154" stroke="#1a2a3a" strokeWidth="1" strokeDasharray="3 2" />
      <text x="176" y="98" fill="#4a6a8a" fontSize="9" fontFamily="monospace">1920</text>
      <line x1="172" y1="26" x2="172" y2="154" stroke="#1a2a3a" strokeWidth="1" strokeDasharray="3 2" />
    </svg>
  )
}

function IllustrationSocial() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="welcome-illustration">
      {/* Instagram grid: 3 portrait images */}
      {[0,1,2].map(i => (
        <g key={i}>
          <rect x={22 + i * 60} y="22" width="50" height="63" rx="4" fill="#1a2a3a" stroke="#2a3a4a" strokeWidth="1.5" />
          <polyline
            points={`${26+i*60},74 ${32+i*60},62 ${40+i*60},68 ${50+i*60},54 ${68+i*60},74`}
            stroke={['#0a84ff','#30d158','#ff6b35'][i]}
            strokeWidth="1.5" fill="none" opacity="0.6"
          />
          <text x={47+i*60} y="94" textAnchor="middle" fill="#2a4a6a" fontSize="7" fontFamily="monospace">
            {`108${i+1}.jpg`}
          </text>
        </g>
      ))}
      {/* Dimension badge */}
      <rect x="62" y="104" width="96" height="18" rx="5" fill="#0a1929" stroke="#1a2a3a" strokeWidth="1" />
      <text x="110" y="116" textAnchor="middle" fill="#4a8aaa" fontSize="9" fontFamily="monospace">1080 × 1350 (4:5)</text>
      {/* Posting guide */}
      <rect x="22" y="130" width="176" height="36" rx="5" fill="#0a1929" stroke="#1a2a3a" strokeWidth="1" />
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x={28 + i*28} y="136" width="20" height="24" rx="3" fill="#1a2a3a" stroke="#2a4a6a" strokeWidth="1" />
      ))}
      <text x="110" y="178" textAnchor="middle" fill="#3a5a7a" fontSize="8">posting guide</text>
    </svg>
  )
}

function IllustrationExport() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="welcome-illustration">
      {/* Source folder */}
      <rect x="20" y="30" width="80" height="56" rx="6" fill="#1a2a3a" stroke="#2a3a4a" strokeWidth="1.5" />
      <path d="M20 48 Q20 38 30 38 L54 38 L62 30 L90 30 Q100 30 100 40 L100 48 Z" fill="#152a3a" stroke="#2a3a4a" strokeWidth="1.5" />
      <text x="60" y="72" textAnchor="middle" fill="#4a6a8a" fontSize="9">Source Folder</text>
      {/* Files in source */}
      <text x="28" y="60" fill="#2a5a7a" fontSize="7" fontFamily="monospace">0001.jpg</text>
      <text x="28" y="70" fill="#2a5a7a" fontSize="7" fontFamily="monospace">0002.jpg</text>
      <text x="28" y="80" fill="#2a5a7a" fontSize="7" fontFamily="monospace">0003.jpg</text>
      {/* Arrow: apply order */}
      <path d="M100 57 L120 57" stroke="#0a84ff" strokeWidth="2" />
      <polygon points="120,53 128,57 120,61" fill="#0a84ff" />
      {/* Updated source */}
      <rect x="128" y="30" width="74" height="56" rx="6" fill="#0a1f0a" stroke="#30d158" strokeWidth="1.5" />
      <path d="M128 48 Q128 38 138 38 L158 38 L166 30 L192 30 Q202 30 202 40 L202 48 Z" fill="#0a1a0a" stroke="#30d158" strokeWidth="1.5" />
      <text x="165" y="72" textAnchor="middle" fill="#30d158" fontSize="9">Updated ✓</text>
      <text x="136" y="60" fill="#20a040" fontSize="7" fontFamily="monospace">wedding_0001.jpg</text>
      <text x="136" y="70" fill="#20a040" fontSize="7" fontFamily="monospace">wedding_0002.jpg</text>
      <text x="136" y="80" fill="#20a040" fontSize="7" fontFamily="monospace">wedding_0003.jpg</text>
      {/* Sections below */}
      <rect x="20" y="110" width="176" height="50" rx="6" fill="#1a1a0a" stroke="#ffd60a" strokeWidth="1" opacity="0.7" />
      <text x="110" y="126" textAnchor="middle" fill="#aa9000" fontSize="8" fontWeight="600">Publish Sections</text>
      {['ceremony/','portraits/','reception/'].map((s,i) => (
        <text key={i} x={30 + i*66} y="148" fill="#806800" fontSize="7" fontFamily="monospace">{s}</text>
      ))}
      <text x="110" y="155" textAnchor="middle" fill="#604800" fontSize="7">→ copies to subfolders</text>
    </svg>
  )
}

// ── Slides data ────────────────────────────────────────────────────────────────

interface Slide {
  tag: string
  title: string
  body: React.ReactNode
  illustration: React.ReactNode
}

const slides: Slide[] = [
  {
    tag: '01  Open Folder',
    title: 'פותחים תיקייה',
    body: (
      <>
        <p>לחץ <strong>Open Folder</strong> בטולבר (או <strong>⌘O</strong>) ובחר את תיקיית התמונות שלך.</p>
        <p>האפליקציה תסרוק את כל הקבצים ותציג אותם בגריד. משם מתחיל הכל.</p>
      </>
    ),
    illustration: <IllustrationFolder />
  },
  {
    tag: '02  Gallery Order',
    title: 'סדר = שם קובץ',
    body: (
      <>
        <p>גרור תמונה למיקום אחר בגלריה כדי לשנות את הסדר שלה.</p>
        <p>כשתלחץ <strong>Apply Order</strong>, כל שמות הקבצים יעודכנו ישירות בתיקיית המקור — <em>0001.jpg, 0002.jpg…</em> — כך שהסדר שבחרת ישמר לצמיתות.</p>
      </>
    ),
    illustration: <IllustrationOrder />
  },
  {
    tag: '03  Top Picks',
    title: 'T = תמונה ראשונה',
    body: (
      <>
        <p>לחץ <strong>T</strong> על כל תמונה שאתה רוצה להדגיש — היא תקפוץ לתחילת הגלריה ותסומן בכוכב זהב.</p>
        <p>הבחירה עוברת אוטומטית לתמונה הבאה. כל ה-Top Picks יהיו זמינים לייצוא Story ואינסטגרם.</p>
      </>
    ),
    illustration: <IllustrationTopPick />
  },
  {
    tag: '04  Story Video',
    title: 'סרטון 9:16 אוטומטי',
    body: (
      <>
        <p>לחץ <strong>Create Story</strong> בטולבר — האפליקציה תיצור סרטון וידאו 9:16 מה-Top Picks שלך.</p>
        <p>אפשר לבחור סגנון (Ken Burns, מעברים, קצב), לסדר את הסצנות בגרירה, ולייצא ישירות ל-MP4.</p>
      </>
    ),
    illustration: <IllustrationStory />
  },
  {
    tag: '05  Instagram',
    title: 'ייצוא לאינסטגרם',
    body: (
      <>
        <p>לחץ <strong>Social</strong> בטולבר — האפליקציה תמיר את ה-Top Picks לתמונות <em>1080×1350 (4:5)</em>, הפורמט האידיאלי לפיד אינסטגרם.</p>
        <p>תקבל גם מדריך פרסום ויזואלי שמראה את הסדר המומלץ לפוסטים.</p>
      </>
    ),
    illustration: <IllustrationSocial />
  },
  {
    tag: '06  Export',
    title: 'שמירה לתיקייה',
    body: (
      <>
        <p>בסוף, לחץ <strong>Apply Order</strong> — הקבצים יישמרו בחזרה לתיקיית המקור עם שמות מסודרים.</p>
        <p>אם יצרת <strong>Sections</strong> (אזורים), לחץ <em>Publish Sections</em> — האפליקציה תעתיק את התמונות לתתי-תיקיות מחולקות לפי שם הסקשן, מוכנות לשליחה.</p>
      </>
    ),
    illustration: <IllustrationExport />
  }
]

// ── Main component ─────────────────────────────────────────────────────────────

export function WelcomeModal({ onClose }: Props) {
  const [idx, setIdx] = useState(0)
  const slide = slides[idx]
  const isLast = idx === slides.length - 1

  return (
    <div className="modal-backdrop welcome-backdrop">
      <div className="welcome-modal">

        {/* Left: illustration */}
        <div className="welcome-left">
          <div className="welcome-illustration-wrap">
            {slide.illustration}
          </div>
          {/* Step dots */}
          <div className="welcome-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={`welcome-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
        </div>

        {/* Right: content */}
        <div className="welcome-right">
          <div className="welcome-body">
            <span className="welcome-tag">{slide.tag}</span>
            <h2 className="welcome-title">{slide.title}</h2>
            <div className="welcome-text">{slide.body}</div>
          </div>

          <div className="welcome-footer">
            <button className="btn btn--ghost welcome-skip" onClick={onClose}>Skip</button>
            <div className="welcome-footer__nav">
              {idx > 0 && (
                <button className="btn btn--ghost" onClick={() => setIdx(i => i - 1)}>←</button>
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
    </div>
  )
}
