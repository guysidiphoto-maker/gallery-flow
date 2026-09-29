import { Icon, type IconName } from '@/shared/ui/Icon'
import { bgSubtle, border, card, textMuted, textPrimary, textSecondary } from '../styles'

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'bolt',        title: 'מהיר במיוחד', desc: 'שלוש שכבות איכות לכל תמונה — גלריות נטענות מהר אצל הלקוח, לא משנה כמה תמונות' },
  { icon: 'shield',      title: 'פרטי ובטוח',   desc: 'הגנת סיסמה אמיתית בצד השרת — לא מסך שעוקפים בדפדפן' },
  { icon: 'face-search', title: 'זיהוי פנים',   desc: 'אורחים מצלמים סלפי ומקבלים את התמונות שלהם בלבד' },
]

// First-run onboarding: quiet hero, two CTAs, three feature tiles.
export function GalleriesEmptyState({ onNewGallery }: { onNewGallery: () => void }) {
  return (
    <div style={{
      textAlign: 'center', padding: '40px 24px 100px',
      animation: 'fadeInUp .5s ease both',
      position: 'relative',
    }}>
      <div style={{
        maxWidth: 720, margin: '0 auto 56px',
        padding: '64px 32px 56px',
        background: bgSubtle,
        border: `1px solid ${border}`,
        borderRadius: 2,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase', marginBottom: 18,
        }}>
          Welcome
        </div>
        <h2 style={{
          fontSize: 38, fontWeight: 500, marginBottom: 18, color: textPrimary,
          letterSpacing: '-0.02em', lineHeight: 1.05,
        }}>
          ברוך הבא ל-Pixflow
        </h2>
        <p style={{
          color: textSecondary, fontSize: 16, marginBottom: 14, lineHeight: 1.65,
          maxWidth: 480, marginInline: 'auto',
        }}>
          גלריות מהירות, פרטיות ויפות לאירועים. עם זיהוי פנים אופציונלי שמאפשר לאורחים למצוא את עצמם בסלפי.
        </p>
        <p style={{
          color: textMuted, fontSize: 11, marginBottom: 36,
          fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          100 free tokens · 100 photos
        </p>
        <div style={{
          display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
        }}>
          <button
            onClick={onNewGallery}
            style={{
              background: textPrimary, color: '#fff',
              border: `1px solid ${textPrimary}`, borderRadius: 2,
              padding: '14px 28px', fontSize: 12,
              fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background .2s',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.background = textPrimary }}
          >
            Create first gallery
            <Icon name="plus" size={13} strokeWidth={2} />
          </button>
          <a
            href="/demo"
            target="_blank"
            rel="noopener"
            style={{
              textDecoration: 'none',
              background: 'transparent', color: textPrimary,
              border: `1px solid ${textPrimary}`, borderRadius: 2,
              padding: '14px 28px', fontSize: 12,
              fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background .2s, color .2s',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
          >
            Try demo
            <Icon name="arrow-out" size={13} strokeWidth={2} />
          </a>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 0, maxWidth: 720, margin: '0 auto',
        border: `1px solid ${border}`,
        background: card,
      }}>
        {FEATURES.map((f, i) => (
          <div key={f.title} style={{
            padding: '32px 28px', textAlign: 'right' as const,
            borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
          }}>
            <div style={{
              color: textPrimary, marginBottom: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            }}>
              <Icon name={f.icon} size={20} strokeWidth={1.4} />
            </div>
            <div style={{
              fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: textMuted, marginBottom: 8,
            }}>
              Feature
            </div>
            <div style={{
              fontSize: 16, fontWeight: 500, color: textPrimary,
              marginBottom: 8, letterSpacing: '-0.01em',
            }}>
              {f.title}
            </div>
            <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>
              {f.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
