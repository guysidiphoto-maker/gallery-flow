import { useRef } from 'react'
import { btn, sectionSub, sectionTitle } from '../landing-en/classes'
import type { DemoCopy } from './copy'

interface Props {
  t: DemoCopy
  samplePhotos: string[]
  onLoadSamples: () => void
  onFiles: (files: FileList) => void
}

/** Inline CTA over a blurred wall of the sample photos; opens the fullscreen demo. */
export function DemoLauncher({ t, samplePhotos, onLoadSamples, onFiles }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="relative overflow-hidden rounded-[20px] px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 grid grid-cols-[repeat(5,1fr)] gap-[3px] p-0 opacity-15 blur-[2px]">
        {samplePhotos.slice(0, 15).map((url, i) => (
          <img key={i} src={url} alt="" className="block h-full w-full object-cover" loading="lazy" />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-(image:--mk-lp-demo-veil)" />
      <div className="relative z-1">
        <h2 className={sectionTitle}>{t.title}</h2>
        <p className={sectionSub}>{t.sub}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button className={btn({ variant: 'primary', glow: true, lg: true })} onClick={onLoadSamples}>{t.loadSample}</button>
          <button className={btn({ variant: 'ghost', lg: true })} onClick={() => fileRef.current?.click()}>{t.chooseFiles}</button>
        </div>
      </div>
      <input
        ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { if (e.target.files) onFiles(e.target.files) }}
      />
    </div>
  )
}
