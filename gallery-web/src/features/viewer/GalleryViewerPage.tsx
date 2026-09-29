import { lazy, Suspense, useState } from 'react'
import { storageUrl, displayUrl } from '@/shared/lib/supabase'
import { gateCoverBackgroundUrl } from '@/shared/gallery/coverImage'
import { t } from '@/shared/i18n/viewerStrings'
import type { GalleryImage, Story } from '@/shared/types'
import './viewer.css'
import { isIOSUA, isMobileUA, resolveViewerSettings } from './lib/viewerSettings'
import { pickHeroFallback, pickWelcomeImages } from './lib/galleryImages'
import { useGalleryRoute } from './hooks/useGalleryRoute'
import { useGalleryData } from './hooks/useGalleryData'
import { useGalleryBranding } from './hooks/useGalleryBranding'
import { usePublicSession } from './hooks/usePublicSession'
import { useClientAccess } from './hooks/useClientAccess'
import { useFaceMatches } from './hooks/useFaceMatches'
import { useSectionNav } from './hooks/useSectionNav'
import { useCoverUrls } from './hooks/useCoverUrls'
import { useDownloads } from './hooks/useDownloads'
import { usePreloadThumbs, useVisibleImages } from './hooks/useVisibleImages'
import { GalleryLoading, GalleryNotFound } from './components/GalleryStatus'
import { PasswordGate } from './components/PasswordGate'
import { WelcomeScreen } from './components/welcome/WelcomeScreen'
import { RoleSelectScreen } from './components/RoleSelectScreen'
import { FaceSearchOverlay } from './components/FaceSearchOverlay'
import { SkipLink } from './components/SkipLink'
import { TurnstileOverlay } from './components/TurnstileOverlay'
import { FeedHeader } from './components/FeedHeader'
import { Hero } from './components/hero/Hero'
import { DefaultHeroContent } from './components/hero/DefaultHeroContent'
import { FaceMatchHeroContent } from './components/hero/FaceMatchHeroContent'
import { StoriesRow } from './components/StoriesRow'
import { SectionNav } from './components/SectionNav'
import { GalleryToolbar } from './components/toolbar/GalleryToolbar'
import { GalleryGrids, type SharedGridProps } from './components/GalleryGrids'
import { GalleryFooter } from './components/GalleryFooter'
import { Viewer } from './components/Lightbox'
import { DownloadToasts } from './components/downloads/DownloadToasts'
import { DownloadEmailGate } from './components/DownloadEmailGate'
import { DownloadProgress } from './components/downloads/DownloadProgress'
import { MobileDownloadBar } from './components/downloads/MobileDownloadBar'

// Opened only on a story tap, so the autoplay player stays out of the initial bundle.
const StoryPlayer = lazy(() =>
  import('./components/StoryPlayer').then(m => ({ default: m.StoryPlayer })),
)

const storyUrl = (st: Story) => storageUrl('gallery-stories', st.storage_path)

export function GalleryViewerPage() {
  const route = useGalleryRoute()
  const { gallery, images, setImages, sections, stories, error, unlocked, handleUnlock } = useGalleryData(route)
  const settings = resolveViewerSettings(gallery)
  const { lang, imgBucket, galleryTitle, studioName, downloadsEnabled, faceSearchAvailable, facePrivacyMode } = settings
  const txt = t(lang)
  const isMobile = isMobileUA()

  const [showWelcome, setShowWelcome] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [viewerList, setViewerList] = useState<GalleryImage[] | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [storyPlayerIndex, setStoryPlayerIndex] = useState<number | null>(null)

  const client = useClientAccess(gallery, unlocked, settings.clientSelectionEnabled, settings.clientCode)
  const face = useFaceMatches({ facePrivacyMode, setImages, closeWelcome: () => setShowWelcome(false) })
  const nav = useSectionNav({
    sections, images, galleryBasePath: route?.basePath ?? null, faceFilterActive: face.faceFilterActive, showWelcome,
  })
  const session = usePublicSession(gallery?.id)
  useGalleryBranding(gallery, lang)
  const covers = useCoverUrls(settings.rec, images, imgBucket, settings.coverEnabled)
  usePreloadThumbs(showWelcome, images, imgBucket)
  const downloads = useDownloads({ gallery, settings, images, viewerIndex, viewerList, isMobile, txt })
  const view = useVisibleImages({
    images, sections, hiddenImageIds: client.hiddenImageIds, viewerRole: client.viewerRole,
    faceMatchIds: face.faceMatchIds, faceFilterActive: face.faceFilterActive,
  })

  if (error) return <GalleryNotFound />
  if (!gallery) return <GalleryLoading />

  if (settings.accessType === 'password' && !unlocked) {
    return (
      <PasswordGate
        galleryId={gallery.id}
        galleryName={galleryTitle}
        onUnlock={handleUnlock}
        requireToken={settings.signedGateOn}
        lang={lang}
        coverUrl={gateCoverBackgroundUrl(settings.rec, imgBucket)}
      />
    )
  }

  // Private face mode has no bulk images until a selfie matches, so the cover stands alone.
  const isPrivateFaceMode = faceSearchAvailable && facePrivacyMode === 'private'
  const faceOverlayProps = {
    galleryId: gallery.id,
    images,
    privacyMode: facePrivacyMode,
    onClose: face.closeFaceSearch,
    onSelfieCapture: face.setFaceSelfieUrl,
    onMatches: face.onMatches,
    onBrowseAll: face.onBrowseAll,
  }

  if (showWelcome && (images.length > 0 || isPrivateFaceMode)) {
    const bounded = (path: string) => displayUrl(imgBucket, path, 1280, 65)
    return (
      <>
        <WelcomeScreen
          style={images.length === 0 ? 'cinematic' : settings.welcomeStyle}
          galleryTitle={galleryTitle}
          galleryDescription={settings.galleryDescription}
          welcomeMessage={settings.welcomeMessage || ''}
          textAnimation={settings.textAnimation}
          animationSpeed={settings.animationSpeed}
          eventDate={settings.eventDate}
          eventLocation={settings.eventLocation}
          clientName={settings.clientName || ''}
          studioName={studioName}
          studioWebsite={settings.studioWebsite}
          images={pickWelcomeImages(images, sections)}
          coverImageUrl={covers.resolvedCoverUrl}
          coverCrop={settings.coverCrop}
          gateCoverUrl={isPrivateFaceMode ? gateCoverBackgroundUrl(settings.rec, imgBucket) : null}
          storageUrl={bounded}
          onEnter={() => setShowWelcome(false)}
          faceSearchAvailable={faceSearchAvailable}
          facePrivacyMode={faceSearchAvailable ? facePrivacyMode : null}
          onFindMyPhotos={face.openFaceSearch}
          lang={lang}
          headingFont={settings.headingFont}
          bodyFont={settings.bodyFont}
        />
        {face.showFaceSearch && <FaceSearchOverlay {...faceOverlayProps} storageUrl={bounded} lang={lang} />}
      </>
    )
  }

  if (settings.clientSelectionEnabled && client.viewerRole === 'none') {
    return (
      <RoleSelectScreen
        txt={txt}
        studioName={studioName}
        galleryTitle={galleryTitle}
        codeInput={client.clientCodeInput}
        codeError={client.clientCodeError}
        onGuest={client.chooseGuest}
        onCodeChange={client.changeClientCode}
        onCodeSubmit={client.submitClientCode}
      />
    )
  }

  const isClient = client.viewerRole === 'client'
  const showStoriesSection = settings.showStories !== false && stories.length > 0
  const wantsOriginal = settings.downloadQuality === 'original' && images.some(img => img.original_path)
  const downloadLabel = isMobile
    ? (wantsOriginal ? txt.saveOriginal : txt.save)
    : (wantsOriginal ? txt.downloadOriginal : txt.download)

  // Cover first, else a flattering photo as a small blurred render (never the multi-MB original).
  const heroFallback = pickHeroFallback(images)
  const heroBgUrl = covers.resolvedCoverUrl || covers.coverUrl
    || (heroFallback ? displayUrl(imgBucket, heroFallback.storage_path, 1280, 60) : null)

  const clearSelection = () => { setSelectMode(false); setSelectedIds(new Set()) }
  const gridProps: SharedGridProps = {
    imgBucket,
    layoutMode: settings.layoutMode,
    imageSpacing: settings.imageSpacing,
    cornerStyle: settings.cornerStyle,
    onDownload: downloadsEnabled ? downloads.handleImageDownload : undefined,
    onWarmDownload: downloads.warmTileDownload,
    selectMode,
    selectedIds,
    onToggleSelect: id => setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    }),
    clientMode: isClient,
    hiddenIds: client.hiddenImageIds,
    onToggleHide: isClient ? client.toggleHideImage : undefined,
    watermark: settings.watermarkEnabled && settings.watermarkText
      ? { text: settings.watermarkText, position: settings.watermarkPosition }
      : null,
  }

  return (
    <>
      <SkipLink label={lang === 'he' ? 'דלג לגלריה' : 'Skip to gallery'} />
      {session.turnstileSiteKey && <TurnstileOverlay siteKey={session.turnstileSiteKey} onToken={session.onTurnstileToken} />}
      {settings.isFeedMode && <FeedHeader galleryTitle={galleryTitle} studioName={studioName} />}

      <Hero bgUrl={heroBgUrl} hasCustomCover={!!(covers.resolvedCoverUrl || covers.coverUrl)} hidden={settings.isFeedMode}>
        {face.faceMatchIds && face.faceSelfieUrl ? (
          <FaceMatchHeroContent
            selfieUrl={face.faceSelfieUrl}
            studioName={studioName}
            galleryTitle={galleryTitle}
            welcomeMessage={settings.welcomeMessage}
            textAnimation={settings.textAnimation}
            animationSpeed={settings.animationSpeed}
            isPrivate={facePrivacyMode === 'private'}
            matchCount={face.faceMatchIds.size}
            totalCount={images.length}
            faceFilterActive={face.faceFilterActive}
            onFilterChange={face.setFaceFilterActive}
          />
        ) : (
          <DefaultHeroContent
            studioName={studioName}
            galleryTitle={galleryTitle}
            clientName={settings.clientName}
            photoCount={images.length}
            secured={settings.accessType === 'password' || facePrivacyMode === 'private'}
          />
        )}
      </Hero>

      {showStoriesSection && <StoriesRow stories={stories} storyUrl={storyUrl} onOpen={setStoryPlayerIndex} />}

      {(sections.length > 0 || downloadsEnabled || showStoriesSection || faceSearchAvailable) && (
        <SectionNav
          sections={sections.filter(sec => images.some(im => im.section_id === sec.id))}
          sectionCounts={sections.reduce<Record<string, number>>((acc, sec) => {
            acc[sec.id] = images.filter(im => im.section_id === sec.id).length
            return acc
          }, {})}
          showAllPill={nav.pagedMode && view.anySectionHasContent && view.unsectionedImages.length > 0}
          allPillLabel={txt.morePhotos}
          allPillCount={view.unsectionedImages.length}
          totalCount={images.length}
          activeId={nav.activeSectionAnchor}
          onJump={nav.jumpTo}
          centerToolbar={null}
          toolbar={(faceSearchAvailable || downloadsEnabled) ? (
            <GalleryToolbar
              txt={txt}
              isMobile={isMobile}
              faceSearchAvailable={faceSearchAvailable}
              downloadsEnabled={downloadsEnabled}
              hasFaceMatches={!!face.faceMatchIds}
              faceFilterActive={face.faceFilterActive}
              selectMode={selectMode}
              selectedCount={selectedIds.size}
              dlProgress={downloads.dlProgress}
              onFindMyPhotos={face.openFaceSearch}
              onShowAll={() => { face.setFaceFilterActive(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}
              onToggleSelect={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              onDownloadSelected={() => {
                downloads.handleBatchDownload(images.filter(img => selectedIds.has(img.id)))
                clearSelection()
              }}
              onDownloadAll={() => downloads.handleBatchDownload(images)}
              onCancelSelect={clearSelection}
            />
          ) : null}
        />
      )}

      {storyPlayerIndex !== null && stories.length > 0 && (
        <Suspense fallback={null}>
          <StoryPlayer
            stories={stories}
            initialIndex={storyPlayerIndex}
            storyUrl={storyUrl}
            onClose={() => setStoryPlayerIndex(null)}
          />
        </Suspense>
      )}

      <GalleryGrids
        images={images}
        sections={sections}
        visibleImages={view.visibleImages}
        unsectionedImages={view.unsectionedImages}
        anySectionHasContent={view.anySectionHasContent}
        pagedMode={nav.pagedMode}
        activeAnchor={nav.activeSectionAnchor}
        viewerRole={client.viewerRole}
        gridProps={gridProps}
        onOpen={(list, idx) => { setViewerList(list); setViewerIndex(idx) }}
      />

      {(settings.showFooterCredit || !!studioName) && (
        <GalleryFooter studioName={studioName} studioWebsite={settings.studioWebsite} fallbackText={txt.deliveredWith} />
      )}

      {viewerIndex !== null && (
        <Viewer
          images={viewerList ?? images}
          index={viewerIndex}
          imgBucket={imgBucket}
          allowDownloads={downloadsEnabled}
          downloadLabel={downloadLabel}
          onClose={() => { setViewerIndex(null); setViewerList(null) }}
          onNavigate={setViewerIndex}
          onDownload={downloads.handleImageDownload}
        />
      )}

      {face.showFaceSearch && (
        <FaceSearchOverlay {...faceOverlayProps} storageUrl={(path: string) => storageUrl(imgBucket, path)} />
      )}

      <DownloadToasts
        isMobile={isMobile}
        hdNotice={downloads.hdNotice}
        onDismissNotice={downloads.dismissHdNotice}
        savingPhoto={downloads.savingPhoto}
        photoSaved={downloads.photoSaved}
        savingLabel={txt.saving}
        savedLabel={txt.saved}
      />

      {downloads.emailGateOpen && (
        <DownloadEmailGate lang={lang} onSubmit={downloads.submitEmail} onClose={downloads.closeEmailGate} />
      )}

      {downloads.downloadProgress && (
        <DownloadProgress
          isMobile={isMobile}
          label={downloads.dlProgress}
          current={downloads.downloadProgress.current}
          total={downloads.downloadProgress.total}
        />
      )}

      {isMobile && downloadsEnabled && !selectMode && viewerIndex === null && !face.showFaceSearch && !downloads.downloadProgress && (
        <MobileDownloadBar
          hint={isIOSUA() ? txt.tapToShare : txt.tapToSave}
          buttonLabel={isIOSUA() ? txt.saveAll : txt.downloadAll}
          disabled={!!downloads.dlProgress}
          onSaveAll={() => downloads.handleBatchDownload(face.faceFilterActive && face.faceMatchIds ? view.visibleImages : images)}
        />
      )}
    </>
  )
}
