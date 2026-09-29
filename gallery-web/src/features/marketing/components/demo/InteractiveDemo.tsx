import { DEMO_COPY, type DemoLang } from './copy'
import { DemoFullscreen } from './DemoFullscreen'
import { DemoLauncher } from './DemoLauncher'
import { useDemoState } from './useDemoState'

interface Props { samplePhotos: string[]; lang: DemoLang; galleryUrl: string }

/** Try-the-editor demo: an inline launcher that opens a fullscreen mock app. */
export function InteractiveDemo({ samplePhotos, lang, galleryUrl }: Props) {
  const t = DEMO_COPY[lang]
  const demo = useDemoState(samplePhotos)

  if (!demo.fullscreen) {
    return <DemoLauncher t={t} samplePhotos={samplePhotos} onLoadSamples={demo.loadSamples} onFiles={demo.addFiles} />
  }
  return <DemoFullscreen t={t} lang={lang} demo={demo} galleryUrl={galleryUrl} />
}
