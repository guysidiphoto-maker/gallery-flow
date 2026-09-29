// Copy + links for the English landing (/en). The HE toggle swaps the whole table.

// Eclipse Media photos, used only as the interactive demo's sample set.
const ECLIPSE_STORAGE =
  'https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/dfa8f1a5-f558-4800-a09a-272020476da1'

export const DEMO_SAMPLE_PHOTOS = [
  '/thumbs/P25.jpg', '/thumbs/P12.jpg', '/thumbs/IMG_5203.jpg',
  '/thumbs/713230.jpg', '/thumbs/309501.jpg', '/thumbs/166294.jpg',
  '/thumbs/0-6.jpg', '/thumbs/0-2-2.jpg', '/thumbs/2-123.jpg',
  '/thumbs/0-10-scaled.jpg', '/thumbs/0-12.jpg', '/thumbs/0-2-1.jpg',
  '/thumbs/0-2-2-2.jpg', '/thumbs/0-11.jpg', '/thumbs/0-2.jpeg',
].map(p => ECLIPSE_STORAGE + p)

export const GALLERY_URL =
  'https://pixflow-ai.com/gallery/dfa8f1a5-f558-4800-a09a-272020476da1'

export const DOWNLOAD_URL = 'https://github.com/guysidiphoto-maker/gallery-flow/releases/download/v1.0.2/Pixflow-1.0.2-arm64.dmg'

export const LANDING_COPY = {
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
    save: 'Save 17%',
    starterName: 'Starter',
    starterPrice: 'Free',
    starterF: [
      '3 galleries',
      '500 photos/mo',
      '2 GB storage',
      'Sections',
      'Top Picks',
      'Pixflow watermark',
    ],
    starterCta: 'Get Started',
    proName: 'Pro',
    proPrice: '$19',
    proPriceAnnual: '$16',
    proF: [
      'Unlimited galleries',
      '5,000 photos/mo',
      '50 GB storage',
      'AI Stories',
      'Custom branding',
      'No watermark',
    ],
    proCta: 'Get Started',
    proBadge: 'Most Popular',
    bizName: 'Business',
    bizPrice: '$39',
    bizPriceAnnual: '$33',
    bizF: [
      'Everything in Pro',
      'Unlimited storage',
      'Priority support',
      'Team accounts',
      'Advanced analytics',
      'Custom domain',
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
        a: 'Yes! The Starter plan is completely free with up to 3 galleries and 500 photos per month.',
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
    save: 'חוסכים 17%',
    starterName: 'סטארטר',
    starterPrice: 'חינם',
    starterF: [
      '3 גלריות',
      '500 תמונות/חודש',
      '2 GB אחסון',
      'סקשנים',
      'מועדפים',
      'ווטרמרק Pixflow',
    ],
    starterCta: 'יאללה, מתחילים',
    proName: 'פרו',
    proPrice: '$19',
    proPriceAnnual: '$16',
    proF: [
      'גלריות ללא הגבלה',
      '5,000 תמונות/חודש',
      '50 GB אחסון',
      'סטוריז AI',
      'מיתוג מותאם',
      'בלי ווטרמרק',
    ],
    proCta: 'מתחילים בחינם',
    proBadge: 'הכי פופולרי',
    bizName: 'ביזנס',
    bizPrice: '$39',
    bizPriceAnnual: '$33',
    bizF: [
      'הכל מפרו',
      'אחסון ללא הגבלה',
      'תמיכה עדיפה',
      'חשבונות צוות',
      'אנליטיקס מתקדם',
      'דומיין מותאם',
    ],
    bizCta: 'מתחילים בחינם',

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
        a: 'כן! תוכנית סטארטר לגמרי בחינם עם עד 3 גלריות ו-500 תמונות בחודש.',
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

export type Lang = keyof typeof LANDING_COPY
export type LandingCopy = (typeof LANDING_COPY)[Lang]
