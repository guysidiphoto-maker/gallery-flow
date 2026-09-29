// Deterministic pseudo-random layout so particles never jump between renders.
const PARTICLES = Array.from({ length: 25 }, (_, i) => ({
  x: (7 + i * 3.7 + (i * 17) % 23) % 100,
  y: (15 + i * 4.1 + (i * 13) % 31) % 100,
  size: 2 + (i % 3),
  opacity: 0.15 + (i % 6) * 0.05,
  delay: (i * 0.7) % 10,
  duration: 10 + (i % 5) * 2,
}))

const ORBS = [
  'size-[400px] bg-(image:--mk-lp-orb-1) top-[10%] left-[15%] animate-[mk-lp-orb-float_20s_ease-in-out_infinite]',
  'size-[350px] bg-(image:--mk-lp-orb-2) top-[30%] right-[10%] animate-[mk-lp-orb-float_20s_ease-in-out_-7s_infinite]',
  'size-[300px] bg-(image:--mk-lp-orb-3) bottom-[10%] left-[40%] animate-[mk-lp-orb-float_20s_ease-in-out_-14s_infinite]',
]

/** Hero backdrop: blurred glow, dark veil, drifting orbs and rising particles. */
export function HeroBackdrop() {
  return (
    <>
      <div className="absolute inset-0 scale-115 bg-(image:--mk-lp-hero-bg) blur-[40px] brightness-[0.3]" />
      <div className="absolute inset-0 bg-(image:--mk-lp-hero-overlay)" />
      {ORBS.map(orb => (
        <div key={orb} className={`absolute rounded-full opacity-40 blur-[80px] ${orb}`} />
      ))}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute z-1 animate-[mk-lp-float_12s_linear_infinite] rounded-full bg-white/25"
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
    </>
  )
}
