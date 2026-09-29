import type { ChangeEvent, RefObject } from 'react'
import { pill } from './pill'

interface Props {
  cameraAvailable: boolean
  videoRef: RefObject<HTMLVideoElement>
  fileRef: RefObject<HTMLInputElement>
  onCapture: () => void
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void
}

export function SelfieCamera({ cameraAvailable, videoRef, fileRef, onCapture, onUpload }: Props) {
  return (
    <div className="text-center">
      <h2 className="mb-6 text-[22px] font-bold">צלמו סלפי</h2>

      {cameraAvailable ? (
        <>
          <div className="relative mx-auto mb-8 size-[220px] overflow-hidden rounded-full border-[3px] border-brand/35">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="size-full object-cover [transform:scaleX(-1)]"
            />
          </div>
          <button
            onClick={onCapture}
            className="mx-auto flex size-[72px] cursor-pointer items-center justify-center rounded-full border-4 border-white bg-white/15"
            aria-label="Capture"
          >
            <div className="size-[52px] rounded-full bg-white" />
          </button>
        </>
      ) : (
        <div className="mt-5">
          <p className="mb-5 text-[14px] text-white/50">
            לא הצלחנו לגשת למצלמה. העלו תמונה במקום.
          </p>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onUpload} className="hidden" />

      <button onClick={() => fileRef.current?.click()} className={pill(false, 'mt-7 px-7 py-2.5 text-[14px]')}>
        העלאת תמונה מהגלריה
      </button>
    </div>
  )
}
