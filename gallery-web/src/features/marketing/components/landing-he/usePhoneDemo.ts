import { useEffect, useState } from 'react'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Drives the looping guest flow: 0 welcome → 1 camera → 2 flash → 3 searching → 4 found. */
export function usePhoneDemo(active: boolean, lineCount: number) {
  const [step, setStep] = useState(0)
  const [line, setLine] = useState(0)
  const [thumbs, setThumbs] = useState(0)

  useEffect(() => {
    if (!active) { setStep(0); setLine(0); setThumbs(0); return }
    let stop = false
    const run = async () => {
      while (!stop) {
        setStep(0); setLine(0); setThumbs(0); await wait(1800)
        if (stop) return; setStep(1); await wait(2200)
        if (stop) return; setStep(2); await wait(280)
        if (stop) return; setStep(3)
        for (let i = 0; i < lineCount; i++) { await wait(500); if (stop) return; setLine(i + 1) }
        await wait(350); if (stop) return; setStep(4)
        for (let i = 0; i < 12; i++) { await wait(60); if (stop) return; setThumbs(i + 1) }
        await wait(3200)
      }
    }
    run()
    return () => { stop = true }
  }, [active, lineCount])

  return { step, line, thumbs }
}
