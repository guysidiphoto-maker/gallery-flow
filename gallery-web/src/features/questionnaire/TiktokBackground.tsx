import type { CSSProperties } from 'react'

// The TikTok music-note glyph.
const NOTE_PATH = 'M50 2 C50 2 62 8 68 18 L68 18 L56 18 C56 18 53 12 50 10 L50 55 C50 72 38 82 24 78 C10 74 4 60 10 48 C16 36 30 32 42 38 C46 40 48 43 48 47 L48 10 Z'

// Position (%), size (px), rotation (deg), timing (s) and 3D drift (px) per logo.
const LOGOS = [
  { x: 5,  y: -5,  size: 180, rot: -25, dur: 22, delay: 0,  drift: { x: 30, y: 40, z: 80 } },
  { x: 70, y: 5,   size: 140, rot: 15,  dur: 26, delay: 1.5, drift: { x: -25, y: 35, z: 60 } },
  { x: 40, y: 30,  size: 100, rot: 45,  dur: 18, delay: 3,  drift: { x: 40, y: -30, z: 120 } },
  { x: 80, y: 45,  size: 160, rot: -10, dur: 24, delay: 0.5, drift: { x: -35, y: 25, z: 90 } },
  { x: 15, y: 55,  size: 120, rot: 30,  dur: 20, delay: 4,  drift: { x: 20, y: -40, z: 70 } },
  { x: 55, y: 70,  size: 90,  rot: -40, dur: 28, delay: 2,  drift: { x: -30, y: 20, z: 100 } },
  { x: -5, y: 80,  size: 150, rot: 20,  dur: 23, delay: 5,  drift: { x: 35, y: -25, z: 50 } },
  { x: 85, y: 85,  size: 110, rot: -35, dur: 19, delay: 1,  drift: { x: -20, y: 45, z: 110 } },
  { x: 35, y: 95,  size: 130, rot: 10,  dur: 25, delay: 3.5, drift: { x: 25, y: -35, z: 85 } },
  { x: 60, y: -10, size: 85,  rot: 50,  dur: 21, delay: 6,  drift: { x: -40, y: 30, z: 65 } },
]

/** Floating 3D TikTok logos with a pink/cyan glitch offset. */
export function TiktokBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden perspective-[1200px] perspective-origin-center">
      {LOGOS.map((logo, i) => (
        <div
          key={i}
          className="q-logo"
          style={{
            left: `${logo.x}%`, top: `${logo.y}%`,
            width: logo.size, height: logo.size,
            '--rot': `${logo.rot}deg`,
            '--dx': `${logo.drift.x}px`, '--dy': `${logo.drift.y}px`, '--dz': `${logo.drift.z}px`,
            '--dur': `${logo.dur}s`, '--delay': `${logo.delay}s`,
            '--glow': `${logo.size / 5}px`,
          } as CSSProperties}
        >
          {(['pink', 'cyan'] as const).map(tone => (
            <svg key={tone} viewBox="0 0 80 90" width={logo.size} height={logo.size} className={`q-glitch q-glitch-${tone}`}>
              <path d={NOTE_PATH} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ))}
        </div>
      ))}
    </div>
  )
}
