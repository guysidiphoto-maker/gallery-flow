import { pill } from './pill'

export function SelfieWelcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="max-w-[400px] text-center">
      <div className="mb-5 text-[48px] opacity-90">📸</div>
      <h1 className="mb-3 text-[30px] leading-[1.3] font-extrabold">
        מצא את התמונות שלך
      </h1>
      <p className="mb-10 text-[15px] leading-[1.7] text-white/55">
        צלמו סלפי ונמצא את כל התמונות שלכם מהאירוע
      </p>
      <button className={pill(true)} onClick={onStart}>בואו נתחיל</button>
    </div>
  )
}
