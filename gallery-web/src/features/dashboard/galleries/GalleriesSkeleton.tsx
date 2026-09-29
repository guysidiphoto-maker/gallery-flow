import { border, borderHover, cardSolid } from '../styles'

export function GalleriesSkeleton() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20,
    }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          background: cardSolid, borderRadius: 18, padding: 28,
          border: `1px solid ${border}`, height: 160,
        }}>
          <div style={{
            width: '60%', height: 16, borderRadius: 8,
            background: `linear-gradient(90deg, ${border} 25%, ${borderHover} 50%, ${border} 75%)`,
            backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
            marginBottom: 16,
          }} />
          <div style={{
            width: '40%', height: 12, borderRadius: 6,
            background: `linear-gradient(90deg, ${border} 25%, ${borderHover} 50%, ${border} 75%)`,
            backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
          }} />
        </div>
      ))}
    </div>
  )
}
