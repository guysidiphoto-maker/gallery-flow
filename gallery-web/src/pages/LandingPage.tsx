import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InteractiveDemo } from '../components/InteractiveDemo'
import '../landing.css'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// Eclipse Media photos — used ONLY for the interactive demo "sample photos"
const ECLIPSE_STORAGE =
  'https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/dfa8f1a5-f558-4800-a09a-272020476da1'

const DEMO_SAMPLE_PHOTOS = [
  '/thumbs/P25.jpg', '/thumbs/P12.jpg', '/thumbs/IMG_5203.jpg',
  '/thumbs/713230.jpg', '/thumbs/309501.jpg', '/thumbs/166294.jpg',
  '/thumbs/0-6.jpg', '/thumbs/0-2-2.jpg', '/thumbs/2-123.jpg',
  '/thumbs/0-10-scaled.jpg', '/thumbs/0-12.jpg', '/thumbs/0-2-1.jpg',
  '/thumbs/0-2-2-2.jpg', '/thumbs/0-11.jpg', '/thumbs/0-2.jpeg',
].map(p => ECLIPSE_STORAGE + p)

const GALLERY_URL =
  'https://pixflow-ai.com/gallery/dfa8f1a5-f558-4800-a09a-272020476da1'

const DOWNLOAD_URL = 'https://github.com/guysidiphoto-maker/gallery-flow/releases/download/v1.0.2/Pixflow-1.0.2-arm64.dmg'

/* ------------------------------------------------------------------ */
/*  Translations                                                       */
/* ------------------------------------------------------------------ */

const t = {
  en: {
    brand: 'Pixflow',
    navFeatures: 'Features',
    navPricing: 'Pricing',
    navDownload: 'Download',
    langLabel: 'עב',

    heroBadge: 'Mac only. Built for speed.',
    heroH1: 'Your galleries are about to get dangerously good.',
    heroSub:
      'Drag 5,000 photos. Organize in minutes. Publish a gallery your clients will obsess over. AI does the boring stuff.',
    ctaDownload: 'Download for Mac',
    ctaDemo: 'See it in action',
    heroNote: 'Free plan available. macOS only — because we don\u2019t compromise on speed.',

    howTitle: 'Folder to live gallery. Under 5 minutes.',
    step1Num: '01',
    step1Title: 'Drop your folder',
    step1Desc:
      '5,000 photos? 10,000? Drag it in. Pixflow eats it for breakfast.',
    step2Num: '02',
    step2Title: 'Curate like a pro',
    step2Desc:
      'Press T = top pick. Drag into sections. Batch rename. Undo everything. Done.',
    step3Num: '03',
    step3Title: 'One click. Live.',
    step3Desc:
      'Password-protected gallery with your brand, AI-generated stories, and download controls. Your client gets a link.',

    galleryTitle: 'This is a real gallery',
    gallerySub: 'Published with Pixflow. Eclipse Media, 88 photos.',
    galleryCta: 'Yours will look just as good',

    featuresTitle: 'Everything. Nothing extra.',
    f1t: 'Instant import',
    f1d: 'Drag a folder. Thousands of photos load in seconds. Not minutes — seconds.',
    f2t: 'Top Picks',
    f2d: 'Press T. Star appears. Photo jumps to top. Your best work, front and center.',
    f3t: 'Smart Sections',
    f3d: 'Ceremony. Reception. Getting Ready. Drag photos into groups. Clients see the story.',
    f4t: 'One-click publish',
    f4d: 'Live gallery in 60 seconds. Password, branding, download settings — all baked in.',
    f5t: 'AI Stories',
    f5d: '3 cinematic video stories generated from your top picks. Automatically. Ready for Instagram.',
    f6t: 'Dark client gallery',
    f6d: 'Premium dark theme. Sections. Stories. Downloads. Looks incredible on every device.',

    builtForTitle: 'Built for event photographers',
    builtForSub: 'Everything you need to import, curate, and deliver galleries your clients love \u2014 with AI handling the repetitive work.',
    bf1t: 'Fast folder import',
    bf1d: 'Drag in a full shoot and start curating in seconds \u2014 no upload wizard.',
    bf2t: 'Curate and publish',
    bf2d: 'Pick your best shots, group them into sections, and publish a branded, password-protected gallery.',
    bf3t: 'AI does the busywork',
    bf3d: 'Auto-generated story sequences and section ordering from your top picks, ready to share.',

    pricingTitle: 'Pricing that makes sense',
    monthly: 'Monthly',
    annual: 'Annual',
    save: '',
    starterName: 'Solo',
    starterPrice: '$39/mo',
    starterF: [
      '2,000 face-recognition photos/mo',
      '75 GB storage',
      'Free uploads (within storage limit)',
      'Face recognition included',
      'No watermark',
      'AI Stories',
    ],
    starterCta: 'Start with Solo',
    proName: 'Pro',
    proPrice: '$75',
    proPriceAnnual: '$75',
    proF: [
      'Everything in Solo',
      '10,000 face-recognition photos/mo',
      '400 GB storage',
      'Unlimited galleries',
      'Custom domain',
      'Priority support',
    ],
    proCta: 'Get Started',
    proBadge: 'Most Popular',
    bizName: 'Studio',
    bizPrice: '$120',
    bizPriceAnnual: '$120',
    bizF: [
      'Everything in Pro',
      '30,000 face-recognition photos/mo',
      '1.5 TB storage',
      'AI social tools',
      'Multi-photographer',
      'Dedicated support',
    ],
    bizCta: 'Get Started',

    faqTitle: 'Frequently asked questions',
    faq: [
      {
        q: 'What platforms does Pixflow support?',
        a: 'Pixflow is currently available for macOS (Apple Silicon & Intel). Windows support is coming soon.',
      },
      {
        q: 'Can my clients download photos?',
        a: 'Yes. You control download permissions per gallery. Clients can download individual photos or the entire gallery.',
      },
      {
        q: 'How does AI Stories work?',
        a: 'Pixflow uses your top picks to auto-generate cinematic story sequences in 3 styles. Perfect for Instagram and client sharing.',
      },
      {
        q: 'Is there a free plan?',
        a: 'Yes — start free with 100 face-recognition photos per month. Uploads are not charged per photo (subject to your plan’s storage). Upgrade to Solo, Pro, or Studio as you grow.',
      },
      {
        q: 'Can I use my own domain?',
        a: 'Custom domains are available on the Business plan. Pro plan galleries use your-name.pixflow-ai.com.',
      },
      {
        q: 'How do I migrate from another platform?',
        a: 'Just drag your existing photo folders into Pixflow. No import wizards, no CSV files. It just works.',
      },
    ],

    finalCta: 'Stop wasting time on delivery. Start impressing clients.',
    finalSub: 'Mac only. Free plan. No credit card.',
    finalCtaBtn: 'Download Pixflow',
    footerProduct: 'Product',
    footerCompany: 'Company',
    footerLegal: 'Legal',
    footerTerms: 'Terms',
    footerPrivacy: 'Privacy',
    footerAbout: 'About',
    footerBlog: 'Blog',
    footerContact: 'Contact',
    footerChangelog: 'Changelog',
    cancel: 'Cancel anytime',
    per: '/mo',
  },
  he: {
    brand: 'Pixflow',
    navFeatures: 'פיצ\'רים',
    navPricing: 'מחירים',
    navDownload: 'הורדה',
    langLabel: 'EN',

    heroBadge: 'Mac בלבד. בנוי למהירות.',
    heroH1: 'הגלריות שלך עומדות להיות ברמה אחרת.',
    heroSub:
      'תגרור 5,000 תמונות. תסדר בדקות. תפרסם גלריה שהלקוחות שלך לא יפסיקו לדבר עליה. ה-AI עושה את העבודה השחורה.',
    ctaDownload: 'הורדה ל-Mac',
    ctaDemo: 'תראה איך זה עובד',
    heroNote: 'חינם להתחלה. רק macOS — כי אנחנו לא מתפשרים על מהירות.',

    howTitle: 'מתיקיה לגלריה באוויר. פחות מ-5 דקות.',
    step1Num: '01',
    step1Title: 'תזרוק תיקיה',
    step1Desc:
      '5,000 תמונות? 10,000? תגרור פנימה. Pixflow בולע את זה ארוחת בוקר.',
    step2Num: '02',
    step2Title: 'תעשה קסם',
    step2Desc:
      'T = מועדף. גרור לסקשנים. שנה שמות. Undo על הכל. נגמר.',
    step3Num: '03',
    step3Title: 'לחיצה אחת. באוויר.',
    step3Desc:
      'גלריה עם סיסמה, מיתוג שלך, סטוריז AI, ושליטה בהורדות. הלקוח מקבל לינק ונדלק.',

    galleryTitle: 'זו גלריה אמיתית',
    gallerySub: 'פורסמה עם Pixflow. Eclipse Media, 88 תמונות.',
    galleryCta: 'שלך תיראה בדיוק ככה',

    featuresTitle: 'הכל. בלי מיותר.',
    f1t: 'ייבוא מיידי',
    f1d: 'תגרור תיקיה. אלפי תמונות נטענות בשניות. לא דקות — שניות.',
    f2t: 'מועדפים',
    f2d: 'לחיצה T. כוכב מופיע. תמונה קופצת למעלה. העבודה הטובה שלך בחזית.',
    f3t: 'סקשנים חכמים',
    f3d: 'חופה. קבלת פנים. הכנות. תגרור תמונות לקבוצות. הלקוחות רואים סיפור.',
    f4t: 'פרסום בלחיצה',
    f4d: 'גלריה חיה תוך 60 שניות. סיסמה, מיתוג, הגדרות הורדה — הכל בפנים.',
    f5t: 'סטוריז AI',
    f5d: '3 סרטוני סטוריז קולנועיים נוצרים מהמועדפים. אוטומטית. מוכנים לאינסטגרם.',
    f6t: 'גלריית לקוח כהה',
    f6d: 'עיצוב כהה פרימיום. סקשנים. סטוריז. הורדות. נראה רצח בכל מכשיר.',

    builtForTitle: 'בנוי לצלמי אירועים',
    builtForSub: 'כל מה שצריך כדי לייבא, לסדר ולמסור גלריות שהלקוחות אוהבים — כשה-AI עושה את העבודה החוזרת.',
    bf1t: 'ייבוא תיקיה מהיר',
    bf1d: 'גורר צילום שלם ומתחיל לסדר בשניות — בלי אשף העלאה.',
    bf2t: 'סידור ופרסום',
    bf2d: 'בוחר את הטובות, מקבץ לסקשנים, ומפרסם גלריה ממותגת ומוגנת בסיסמה.',
    bf3t: 'ה-AI עושה את העבודה השחורה',
    bf3d: 'סטוריז וסידור סקשנים נוצרים אוטומטית מהמועדפים שלך, מוכנים לשיתוף.',

    pricingTitle: 'תמחור בלי סיפורים',
    monthly: 'חודשי',
    annual: 'שנתי',
    save: '',
    starterName: 'Solo',
    starterPrice: '$39 לחודש',
    starterF: [
      '2,000 תמונות זיהוי פנים/חודש',
      '75 GB אחסון',
      'העלאות ללא חיוב לפי תמונה (בכפוף לאחסון)',
      'זיהוי פנים כלול',
      'בלי ווטרמרק',
      'סטוריז AI',
    ],
    starterCta: 'מתחילים עם Solo',
    proName: 'Pro',
    proPrice: '$75',
    proPriceAnnual: '$75',
    proF: [
      'כל מה שב-Solo',
      '10,000 תמונות זיהוי פנים/חודש',
      '400 GB אחסון',
      'גלריות ללא הגבלה',
      'דומיין מותאם',
      'תמיכה מועדפת',
    ],
    proCta: 'מתחילים',
    proBadge: 'הכי פופולרי',
    bizName: 'Studio',
    bizPrice: '$120',
    bizPriceAnnual: '$120',
    bizF: [
      'כל מה שב-Pro',
      '30,000 תמונות זיהוי פנים/חודש',
      '1.5 TB אחסון',
      'כלי AI לסושיאל',
      'ניהול מספר צלמים',
      'ליווי אישי',
    ],
    bizCta: 'מתחילים',

    faqTitle: 'שאלות נפוצות',
    faq: [
      {
        q: 'באילו פלטפורמות Pixflow עובד?',
        a: 'כרגע Pixflow זמין ל-macOS (Apple Silicon ו-Intel). תמיכה ב-Windows בקרוב.',
      },
      {
        q: 'הלקוחות יכולים להוריד תמונות?',
        a: 'כן. אתה שולט בהרשאות הורדה לכל גלריה. לקוחות יכולים להוריד תמונות בודדות או את כל הגלריה.',
      },
      {
        q: 'איך סטוריז AI עובד?',
        a: 'Pixflow משתמש במועדפים שלך כדי לייצר אוטומטית סטוריז קולנועיים ב-3 סגנונות. מושלם לאינסטגרם ושיתוף ללקוחות.',
      },
      {
        q: 'יש תוכנית חינמית?',
        a: 'כן — מתחילים בחינם עם 100 תמונות זיהוי פנים בחודש. אין חיוב לפי תמונה על העלאות (בכפוף למגבלת האחסון במסלול). משדרגים ל-Solo, Pro או Studio לפי הצורך.',
      },
      {
        q: 'אפשר להשתמש בדומיין שלי?',
        a: 'דומיינים מותאמים זמינים בתוכנית ביזנס. בתוכנית פרו הגלריות על your-name.pixflow-ai.com.',
      },
      {
        q: 'איך מעבירים מפלטפורמה אחרת?',
        a: 'פשוט גורר את תיקיות התמונות הקיימות ל-Pixflow. בלי אשפים, בלי CSV. זה פשוט עובד.',
      },
    ],

    finalCta: 'תפסיק לבזבז זמן על משלוחים. תתחיל להרשים לקוחות.',
    finalSub: 'Mac בלבד. חינם להתחלה. בלי כרטיס אשראי.',
    finalCtaBtn: 'להוריד את Pixflow',
    footerProduct: 'מוצר',
    footerCompany: 'חברה',
    footerLegal: 'משפטי',
    footerTerms: 'תנאי שימוש',
    footerPrivacy: 'פרטיות',
    footerAbout: 'אודות',
    footerBlog: 'בלוג',
    footerContact: 'צור קשר',
    footerChangelog: 'שינויים',
    cancel: 'מבטלים מתי שרוצים',
    per: '/חודש',
  },
} as const

type Lang = keyof typeof t

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

const icons = {
  grid: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  star: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  layers: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  cloud: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  ),
  play: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  monitor: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  menu: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  close: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  chevron: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
}

/* ------------------------------------------------------------------ */
/*  Intersection Observer hook                                         */
/* ------------------------------------------------------------------ */

function useFadeUp() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          obs.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function FadeUp({
  children,
  className = '',
  delay = 0,
  style,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  style?: React.CSSProperties
}) {
  const ref = useFadeUp()
  const mergedStyle: React.CSSProperties | undefined = delay || style
    ? { ...(delay ? { transitionDelay: `${delay}ms` } : null), ...(style || null) }
    : undefined
  return (
    <div
      ref={ref}
      className={`fade-up ${className}`}
      style={mergedStyle}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mockup components                                                  */
/* ------------------------------------------------------------------ */

const MOCK_GRADIENTS = [
  'linear-gradient(135deg, #2d1b69 0%, #11998e 100%)',
  'linear-gradient(135deg, #1a1a2e 0%, #6366f1 100%)',
  'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
  'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)',
  'linear-gradient(135deg, #0d0d0d 0%, #434343 100%)',
]

function AppMockup({ count, stars }: { count?: number; stars?: number[] }) {
  const n = count || 6
  return (
    <div className="lp-mockup">
      <div className="lp-mockup-bar">
        <span className="lp-mockup-dot lp-mockup-dot--red" />
        <span className="lp-mockup-dot lp-mockup-dot--yellow" />
        <span className="lp-mockup-dot lp-mockup-dot--green" />
      </div>
      <div className="lp-mockup-grid">
        {Array.from({ length: n }).map((_, i) => (
          <div className="lp-mockup-img" key={i} style={{ background: MOCK_GRADIENTS[i % MOCK_GRADIENTS.length] }}>
            {stars?.includes(i) && <span className="lp-mockup-star">&#9733;</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function BrowserMockup({
  url,
  children,
}: {
  url: string
  children: React.ReactNode
}) {
  return (
    <div className="lp-browser">
      <div className="lp-browser-bar">
        <span className="lp-mockup-dot lp-mockup-dot--red" />
        <span className="lp-mockup-dot lp-mockup-dot--yellow" />
        <span className="lp-mockup-dot lp-mockup-dot--green" />
        <span className="lp-browser-url">{url}</span>
      </div>
      <div className="lp-browser-body">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  FAQ Accordion                                                      */
/* ------------------------------------------------------------------ */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`lp-faq-item${open ? ' lp-faq-item--open' : ''}`}>
      <button className="lp-faq-q" onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span className="lp-faq-chevron">{icons.chevron}</span>
      </button>
      <div className="lp-faq-a">
        <div className="lp-faq-a-inner">{a}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Landing Page                                                       */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('pixflow-lang')
      if (saved === 'he' || saved === 'en') return saved
    } catch {}
    return 'en'
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [annual, setAnnual] = useState(false)

  const tx = t[lang]
  const isHe = lang === 'he'

  // Generate stable random particles for hero
  const heroParticles = useMemo(() =>
    Array.from({ length: 25 }, (_, i) => ({
      x: (7 + i * 3.7 + (i * 17) % 23) % 100,
      y: (15 + i * 4.1 + (i * 13) % 31) % 100,
      size: 2 + (i % 3),
      opacity: 0.15 + (i % 6) * 0.05,
      delay: (i * 0.7) % 10,
      duration: 10 + (i % 5) * 2,
    })),
  [])

  const toggleLang = useCallback(() => {
    const next = lang === 'en' ? 'he' : 'en'
    setLang(next)
    try {
      localStorage.setItem('pixflow-lang', next)
    } catch {}
  }, [lang])

  // Scroll listener for nav
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }, [])

  return (
    <div className="lp" dir={isHe ? 'rtl' : 'ltr'}>
      {/* -------- NAV -------- */}
      <nav className={`lp-nav${scrolled ? ' lp-nav--scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <span className="lp-nav-brand">{tx.brand}</span>
          <div className="lp-nav-links">
            <button onClick={() => scrollTo('features')}>{tx.navFeatures}</button>
            <button onClick={() => scrollTo('pricing')}>{tx.navPricing}</button>
            <a href={DOWNLOAD_URL} className="lp-nav-dl">{tx.navDownload}</a>
            <button className="lp-nav-lang" onClick={toggleLang}>
              {tx.langLabel}
            </button>
          </div>
          <button
            className="lp-nav-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
          >
            {menuOpen ? icons.close : icons.menu}
          </button>
        </div>
        {menuOpen && (
          <div className="lp-nav-mobile">
            <button onClick={() => scrollTo('features')}>{tx.navFeatures}</button>
            <button onClick={() => scrollTo('pricing')}>{tx.navPricing}</button>
            <a href={DOWNLOAD_URL}>{tx.navDownload}</a>
            <button onClick={toggleLang}>{tx.langLabel}</button>
          </div>
        )}
      </nav>

      {/* -------- HERO -------- */}
      <section className="lp-hero">
        <div
          className="lp-hero-bg"
          style={{ background: 'radial-gradient(ellipse at 40% 30%, rgba(99,102,241,.18) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(139,92,246,.12) 0%, transparent 50%)' }}
        />
        <div className="lp-hero-overlay" />
        <div className="lp-hero-orb lp-hero-orb--1" />
        <div className="lp-hero-orb lp-hero-orb--2" />
        <div className="lp-hero-orb lp-hero-orb--3" />

        {/* Particles */}
        {heroParticles.map((p, i) => (
          <div
            key={i}
            className="lp-hero-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}

        <div className="lp-hero-content">
          <span className="lp-hero-badge">
            <span className="lp-hero-badge-dot" />
            {tx.heroBadge}
          </span>
          <h1 className="lp-hero-h1">
            {tx.heroH1.split(' ').map((word, i) => (
              <span key={i} className="lp-word" style={{ animationDelay: `${0.3 + i * 0.08}s` }}>
                {word}{' '}
              </span>
            ))}
          </h1>
          <p className="lp-hero-sub">{tx.heroSub}</p>
          <div className="lp-hero-ctas">
            <a href={DOWNLOAD_URL} className="btn btn-primary btn-lg btn-glow lp-btn-gradient-border">
              {tx.ctaDownload}
            </a>
            <button
              className="btn btn-ghost btn-lg"
              onClick={() => scrollTo('showcase')}
            >
              {tx.ctaDemo}
            </button>
          </div>
          {'heroNote' in tx && (
            <p className="lp-hero-note">{(tx as { heroNote: string }).heroNote}</p>
          )}
          <div className="lp-hero-mockup-wrap">
            <AppMockup />
          </div>
        </div>
      </section>

      {/* -------- SHOWCASE / HOW IT WORKS -------- */}
      <section className="lp-section" id="showcase">
        <FadeUp className="lp-container">
          <h2 className="lp-section-title">{tx.howTitle}</h2>
          <div className="lp-steps">
            <FadeUp className="lp-step" delay={0}>
              <span className="lp-step-num">{tx.step1Num}</span>
              <h3 className="lp-step-title">{tx.step1Title}</h3>
              <p className="lp-step-desc">{tx.step1Desc}</p>
              <AppMockup />
            </FadeUp>
            <FadeUp className="lp-step" delay={120}>
              <span className="lp-step-num">{tx.step2Num}</span>
              <h3 className="lp-step-title">{tx.step2Title}</h3>
              <p className="lp-step-desc">{tx.step2Desc}</p>
              <AppMockup stars={[1, 4]} />
            </FadeUp>
            <FadeUp className="lp-step" delay={240}>
              <span className="lp-step-num">{tx.step3Num}</span>
              <h3 className="lp-step-title">{tx.step3Title}</h3>
              <p className="lp-step-desc">{tx.step3Desc}</p>
              <BrowserMockup url="pixflow-ai.com/gallery/your-gallery">
                <div className="lp-mockup-grid lp-mockup-grid--sm">
                  {MOCK_GRADIENTS.map((bg, i) => (
                    <div className="lp-mockup-img" key={i} style={{ background: bg }} />
                  ))}
                </div>
              </BrowserMockup>
            </FadeUp>
          </div>
        </FadeUp>
      </section>

      {/* -------- INTERACTIVE DEMO -------- */}
      <section className="lp-section lp-demo-section" id="demo">
        <FadeUp className="lp-container">
          <InteractiveDemo
            samplePhotos={DEMO_SAMPLE_PHOTOS}
            lang={lang}
            galleryUrl={GALLERY_URL}
          />
        </FadeUp>
      </section>

      {/* -------- LIVE GALLERY -------- */}
      <section className="lp-section" id="gallery-embed">
        <FadeUp className="lp-container">
          <h2 className="lp-section-title">{tx.galleryTitle}</h2>
          <p className="lp-section-sub">{tx.gallerySub}</p>
          <div className="lp-gallery-wrap">
            <div className="lp-gallery-glow" />
            <span className="lp-gallery-pill lp-gallery-pill--1">Password Protected</span>
            <span className="lp-gallery-pill lp-gallery-pill--2">Custom Branding</span>
            <span className="lp-gallery-pill lp-gallery-pill--3">AI Stories</span>
            <BrowserMockup url="pixflow-ai.com/gallery/eclipse-media">
              <iframe
                src={GALLERY_URL}
                className="lp-gallery-iframe"
                title="Live gallery"
                loading="lazy"
              />
            </BrowserMockup>
          </div>
          <div className="lp-gallery-cta">
            <p>{tx.galleryCta}</p>
            <a href={DOWNLOAD_URL} className="btn btn-primary btn-glow">
              {tx.ctaDownload}
            </a>
          </div>
        </FadeUp>
      </section>

      {/* -------- FEATURES -------- */}
      <section className="lp-section" id="features">
        <FadeUp className="lp-container">
          <h2 className="lp-section-title">{tx.featuresTitle}</h2>
          <div className="lp-features">
            {[
              { icon: icons.grid, t: tx.f1t, d: tx.f1d },
              { icon: icons.star, t: tx.f2t, d: tx.f2d },
              { icon: icons.layers, t: tx.f3t, d: tx.f3d },
              { icon: icons.cloud, t: tx.f4t, d: tx.f4d },
              { icon: icons.play, t: tx.f5t, d: tx.f5d },
              { icon: icons.monitor, t: tx.f6t, d: tx.f6d },
            ].map((f, i) => (
              <FadeUp className="lp-feature-card" key={i} delay={i * 80}>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </FadeUp>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* -------- BUILT FOR PHOTOGRAPHERS -------- */}
      <section className="lp-section" id="built-for">
        <FadeUp className="lp-container">
          <h2 className="lp-section-title">{tx.builtForTitle}</h2>
          <p className="lp-section-sub">{tx.builtForSub}</p>
          <div className="lp-features">
            {[
              { icon: icons.cloud, t: tx.bf1t, d: tx.bf1d },
              { icon: icons.grid, t: tx.bf2t, d: tx.bf2d },
              { icon: icons.play, t: tx.bf3t, d: tx.bf3d },
            ].map((f, i) => (
              <FadeUp className="lp-feature-card" key={i} delay={i * 80}>
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </FadeUp>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* -------- PRICING -------- */}
      <section className="lp-section" id="pricing">
        <FadeUp className="lp-container">
          <h2 className="lp-section-title">{tx.pricingTitle}</h2>
          <div className="lp-pricing-toggle">
            <span className={!annual ? 'active' : ''}>{tx.monthly}</span>
            <button
              className={`lp-toggle${annual ? ' lp-toggle--on' : ''}`}
              onClick={() => setAnnual(a => !a)}
              aria-label="Toggle annual"
            >
              <span className="lp-toggle-knob" />
            </button>
            <span className={annual ? 'active' : ''}>
              {tx.annual}{' '}
              <span className="lp-pricing-save">{tx.save}</span>
            </span>
          </div>
          <div className="lp-plans">
            {/* Starter */}
            <div className="lp-plan">
              <h3>{tx.starterName}</h3>
              <div className="lp-plan-price">{tx.starterPrice}</div>
              <ul>
                {tx.starterF.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <a href={DOWNLOAD_URL} className="btn btn-ghost lp-plan-cta">
                {tx.starterCta}
              </a>
            </div>
            {/* Pro */}
            <div className="lp-plan lp-plan--popular">
              <span className="lp-plan-badge">{tx.proBadge}</span>
              <h3>{tx.proName}</h3>
              <div className="lp-plan-price">
                {annual ? tx.proPriceAnnual : tx.proPrice}
                <span className="lp-plan-per">{tx.per}</span>
              </div>
              <ul>
                {tx.proF.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <a href={DOWNLOAD_URL} className="btn btn-primary btn-glow lp-plan-cta">
                {tx.proCta}
              </a>
              <p className="lp-plan-cancel">{tx.cancel}</p>
            </div>
            {/* Business */}
            <div className="lp-plan">
              <h3>{tx.bizName}</h3>
              <div className="lp-plan-price">
                {annual ? tx.bizPriceAnnual : tx.bizPrice}
                <span className="lp-plan-per">{tx.per}</span>
              </div>
              <ul>
                {tx.bizF.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <a href={DOWNLOAD_URL} className="btn btn-ghost lp-plan-cta">
                {tx.bizCta}
              </a>
              <p className="lp-plan-cancel">{tx.cancel}</p>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* -------- FAQ -------- */}
      <section className="lp-section" id="faq">
        <FadeUp className="lp-container">
          <h2 className="lp-section-title">{tx.faqTitle}</h2>
          <div className="lp-faq">
            {tx.faq.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </FadeUp>
      </section>

      {/* -------- FINAL CTA -------- */}
      <section className="lp-section lp-final-cta">
        <div className="lp-final-cta-glow" />
        <FadeUp className="lp-container" style={{ textAlign: 'center' }}>
          <h2 className="lp-section-title">{tx.finalCta}</h2>
          {'finalSub' in tx && (
            <p className="lp-section-sub">{(tx as { finalSub: string }).finalSub}</p>
          )}
          <a href={DOWNLOAD_URL} className="btn btn-primary btn-glow lp-btn-final">
            {tx.finalCtaBtn}
          </a>
        </FadeUp>
      </section>

      {/* -------- FOOTER -------- */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-col">
            <h4>{tx.footerProduct}</h4>
            <button onClick={() => scrollTo('features')}>{tx.navFeatures}</button>
            <button onClick={() => scrollTo('pricing')}>{tx.navPricing}</button>
            <a href={DOWNLOAD_URL}>{tx.navDownload}</a>
            <a href="/demo">{tx.footerChangelog}</a>
          </div>
          <div className="lp-footer-col">
            <h4>{tx.footerCompany}</h4>
            <a href="#">{tx.footerAbout}</a>
            <a href="#">{tx.footerBlog}</a>
            <a href="#">{tx.footerContact}</a>
          </div>
          <div className="lp-footer-col">
            <h4>{tx.footerLegal}</h4>
            <a href="/terms">{tx.footerTerms}</a>
            <a href="/privacy">{tx.footerPrivacy}</a>
          </div>
        </div>
        <div className="lp-footer-copy">
          &copy; {new Date().getFullYear()} Pixflow. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
