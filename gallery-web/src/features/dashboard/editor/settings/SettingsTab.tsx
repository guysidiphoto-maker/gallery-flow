import { Eyebrow } from '@/shared/ui'
import { EventDetailsSection } from './EventDetailsSection'
import { PresetsSection } from './PresetsSection'
import { DownloadsSection } from './DownloadsSection'
import { PrivacySection } from './PrivacySection'
import { FaceRecognitionSection } from './FaceRecognitionSection'
import { LayoutSection } from './LayoutSection'
import { ThemeColorSection } from './ThemeColorSection'
import { WatermarkSection } from './WatermarkSection'
import { ZipBackupSection } from './ZipBackupSection'
import { CustomDomainSection } from './CustomDomainSection'

export function SettingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Eyebrow className="mb-2.5 block">הגדרות</Eyebrow>
        <h3 className="text-[22px] font-medium tracking-[-0.015em] text-ink">הגדרות גלריה</h3>
      </div>

      <EventDetailsSection />
      <PresetsSection />
      <DownloadsSection />
      <PrivacySection />
      <FaceRecognitionSection />
      <LayoutSection />
      <ThemeColorSection />
      <WatermarkSection />
      <ZipBackupSection />
      <CustomDomainSection />
    </div>
  )
}
