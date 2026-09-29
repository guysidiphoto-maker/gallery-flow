import '../styles/marketing.css'
import { useSelfieDemo } from '../components/selfie-demo/useSelfieDemo'
import { SelfieWelcome } from '../components/selfie-demo/SelfieWelcome'
import { SelfieCamera } from '../components/selfie-demo/SelfieCamera'
import { SelfieThinking } from '../components/selfie-demo/SelfieThinking'
import { SelfieFound } from '../components/selfie-demo/SelfieFound'

/** /demo — guest "find your photos by selfie" walkthrough (no real matching). */
export function DemoPage() {
  const d = useSelfieDemo()

  return (
    <div className="mk-root relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-(image:--mk-selfie-bg) p-6 font-(family-name:--mk-font-inter-plain) text-white [direction:rtl]">
      {d.phase === 'welcome' && <SelfieWelcome onStart={() => d.setPhase('camera')} />}
      {d.phase === 'camera' && (
        <SelfieCamera
          cameraAvailable={d.cameraAvailable}
          videoRef={d.videoRef}
          fileRef={d.fileRef}
          onCapture={d.capture}
          onUpload={d.handleFileUpload}
        />
      )}
      {d.phase === 'thinking' && <SelfieThinking selfieUrl={d.selfieUrl} visibleLines={d.visibleLines} />}
      {d.phase === 'found' && <SelfieFound selfieUrl={d.selfieUrl} visibleThumbs={d.visibleThumbs} onReset={d.reset} />}
    </div>
  )
}
