import { textMuted, textPrimary } from '../../styles'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase', marginBottom: 10,
        }}>Settings</div>
        <h3 style={{
          fontSize: 22, fontWeight: 500, margin: 0,
          letterSpacing: '-0.015em', color: textPrimary,
        }}>הגדרות גלריה</h3>
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
