import type { t } from '@/shared/i18n/viewerStrings'
import { DownloadIcon } from '../DownloadIcon'
import { ToolbarButton } from './ToolbarButton'

/** Section-nav actions: face search, face-filter reset, select mode and batch downloads. */
export function GalleryToolbar({
  txt, isMobile, faceSearchAvailable, downloadsEnabled, hasFaceMatches, faceFilterActive,
  selectMode, selectedCount, dlProgress,
  onFindMyPhotos, onShowAll, onToggleSelect, onDownloadSelected, onDownloadAll, onCancelSelect,
}: {
  txt: ReturnType<typeof t>
  isMobile: boolean
  faceSearchAvailable: boolean
  downloadsEnabled: boolean
  hasFaceMatches: boolean
  faceFilterActive: boolean
  selectMode: boolean
  selectedCount: number
  dlProgress: string | null
  onFindMyPhotos: () => void
  onShowAll: () => void
  onToggleSelect: () => void
  onDownloadSelected: () => void
  onDownloadAll: () => void
  onCancelSelect: () => void
}) {
  return (
    <>
      {faceSearchAvailable && !selectMode && !hasFaceMatches && (
        <ToolbarButton onClick={onFindMyPhotos}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="8" r="3" />
            <path d="M5.5 20a7 7 0 0 1 13 0" />
          </svg>
          {txt.findMyPhotos}
        </ToolbarButton>
      )}
      {hasFaceMatches && faceFilterActive && !selectMode && (
        <ToolbarButton onClick={onShowAll} aria-label={txt.showAllPhotos}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          {txt.showAllPhotos}
        </ToolbarButton>
      )}
      {downloadsEnabled && (
        <ToolbarButton variant={selectMode ? 'active' : 'default'} onClick={onToggleSelect}>
          {selectMode ? `${selectedCount} ${txt.selected}` : txt.select}
        </ToolbarButton>
      )}
      {selectMode && selectedCount > 0 && (
        <ToolbarButton variant="primary" onClick={onDownloadSelected}>
          <DownloadIcon size={13} strokeWidth={2.2} />
          {isMobile ? txt.save : txt.download} {selectedCount}
        </ToolbarButton>
      )}
      {downloadsEnabled && !selectMode && (
        <ToolbarButton onClick={onDownloadAll} disabled={!!dlProgress}>
          <DownloadIcon size={13} strokeWidth={2.2} />
          {dlProgress || (isMobile ? txt.saveAll : txt.downloadAll)}
        </ToolbarButton>
      )}
      {selectMode && (
        <ToolbarButton variant="ghost" onClick={onCancelSelect}>{txt.cancel}</ToolbarButton>
      )}
    </>
  )
}
