import { useEffect, useState } from 'react'
import { useAuth } from '@/shared/lib/auth'
import { setSentryUser } from '@/shared/lib/sentryContext'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { useToast } from '@/shared/ui/Toast'
import { useConfirm } from '@/shared/ui/useConfirm'
import { Icon } from '@/shared/ui/Icon'
import { ClientsManager } from '@/features/clients/ClientsManager'
import ImportCenter from '@/features/importer/ImportCenter'
import FirstRunTour from './tour/FirstRunTour'
import OwnerOverview from './overview/OwnerOverview'
import GlobalSearch from './search/GlobalSearch'
import { bg, border, textPrimary } from './styles'
import { TOKEN_BILLING_ON } from './lib/billing'
import type { DashboardView } from './types'
import { useBusiness } from './hooks/useBusiness'
import { useGalleries } from './hooks/useGalleries'
import { useTokenBalance } from './hooks/useTokenBalance'
import { useCustomDomain } from './hooks/useCustomDomain'
import { useGalleryActions } from './hooks/useGalleryActions'
import { useShareGallery } from './hooks/useShareGallery'
import { useCreateGallery } from './hooks/useCreateGallery'
import { DashboardLoading } from './DashboardLoading'
import { SignInScreen } from './SignInScreen'
import { DashboardSidebar } from './DashboardSidebar'
import { GalleriesView } from './galleries/GalleriesView'
import { CreateGalleryModal } from './galleries/CreateGalleryModal'
import { ShareGalleryModal } from './galleries/ShareGalleryModal'
import { EmailPreviewModal } from './galleries/EmailPreviewModal'
import { BuyTokensModal } from './galleries/BuyTokensModal'
import { EditorContext } from './editor/EditorContext'
import { useGalleryEditor } from './editor/useGalleryEditor'
import { UploadReviewModal } from './editor/photos/UploadReviewModal'
import { PhotoLightbox } from './editor/photos/PhotoLightbox'
import { StoryGenerateModal } from './editor/stories/StoryGenerateModal'

// Photographer dashboard: auth gate, business bootstrap, shell and the
// in-page view switch (overview / galleries / clients / search / import).
export function Dashboard() {
  const { user, loading } = useAuth()
  const { showToast, ToastContainer } = useToast()
  const { locale, t: ownerT } = useOwnerLocale()
  const { confirm, ConfirmHost } = useConfirm()
  // Views switch in place (no route change); galleries stays the default.
  const [activeView, setActiveView] = useState<DashboardView>('galleries')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { businessId, businessSlug, setBusinessId, resolveBusiness } = useBusiness(user)
  const { galleries, setGalleries, coverFallback, loadingGalleries, fetchGalleries } =
    useGalleries(user, businessId, setBusinessId)
  const { tokenBalance, fetchTokenBalance, showBuyTokens, setShowBuyTokens } = useTokenBalance()
  const customDomain = useCustomDomain(businessId)
  const editor = useGalleryEditor({
    businessId, businessSlug, setGalleries, fetchGalleries,
    tokenBalance, fetchTokenBalance, openBuyTokens: () => setShowBuyTokens(true),
    customDomain, showToast, confirm,
  })
  const { editingGallery, setEditingGallery, openGalleryEditor } = editor.session
  const galleryActions = useGalleryActions({
    businessSlug, galleries, setGalleries, fetchGalleries,
    editingGallery, setEditingGallery, openGalleryEditor, showToast, confirm,
  })
  const share = useShareGallery({ showToast, loadActivitySummary: editor.activity.loadActivitySummary })
  const createForm = useCreateGallery({ businessId, showToast, fetchGalleries })

  useEffect(() => {
    if (!user) return
    void (async () => {
      await resolveBusiness()
      fetchGalleries()
      fetchTokenBalance()
    })()
  }, [user])

  // Attach the photographer to every Sentry event for the session.
  useEffect(() => {
    if (!user) return
    setSentryUser({ id: user.id, email: user.email ?? undefined })
  }, [user?.id, user?.email])

  if (loading) return <DashboardLoading />
  if (!user) return <SignInScreen />

  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email

  const editorValue = {
    ...editor,
    coverFallback,
    actions: {
      shareUrl: galleryActions.shareUrl,
      openEmailShare: share.openEmailShare,
      duplicateGallery: galleryActions.duplicateGallery,
      deleteGallery: galleryActions.deleteGallery,
    },
  }

  return (
    <EditorContext.Provider value={editorValue}>
      <div className="dash" style={{
        background: bg, minHeight: '100vh', fontFamily: 'inherit',
        direction: 'rtl', color: textPrimary,
        display: 'flex',
      }}>
        <ToastContainer />

        {/* Owner-only first-run tour; renders nothing until the business resolves. */}
        <FirstRunTour enabled={Boolean(user && businessId)} surface="owner_tour" />

        {/* Rendered outside the editor dialog, whose transform would trap fixed overlays. */}
        {editor.upload.pendingUpload && <UploadReviewModal />}
        {editor.photos.viewerImages && <PhotoLightbox />}

        <DashboardSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeView={activeView}
          onSelectView={(view) => { setActiveView(view); setSidebarOpen(false) }}
          tokenBalance={tokenBalance}
          onBuyTokens={() => setShowBuyTokens(true)}
          avatar={avatar}
          displayName={displayName}
          ownerT={ownerT}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="dash-hamburger"
            aria-label="Open menu"
            style={{
              display: 'none', alignItems: 'center', justifyContent: 'center',
              position: 'fixed', top: 16, insetInlineStart: 16, zIndex: 50,
              width: 40, height: 40, borderRadius: 10,
              background: '#fff',
              border: `1px solid ${border}`,
              color: textPrimary, cursor: 'pointer', padding: 0,
              boxShadow: '0 2px 8px rgba(15,23,42,.08)',
            }}
          >
            <Icon name="menu" size={18} strokeWidth={2} />
          </button>

          <main style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 40px 96px' }}>
            {activeView === 'overview' ? (
              <OwnerOverview
                businessId={businessId}
                businessSlug={businessSlug}
                locale={locale}
                onNavigate={(view) => setActiveView(view)}
                onNewGallery={() => createForm.setShowModal(true)}
              />
            ) : activeView === 'clients' ? (
              <ClientsManager businessSlug={businessSlug} businessId={businessId} />
            ) : activeView === 'search' ? (
              <GlobalSearch
                locale={locale}
                onOpenClient={() => { setActiveView('clients') }}
                onOpenGallery={() => { setActiveView('galleries') }}
              />
            ) : activeView === 'import' ? (
              <ImportCenter
                locale={locale}
                onExit={() => setActiveView('galleries')}
                onOpenGallery={() => { setActiveView('galleries') }}
              />
            ) : (
              <GalleriesView
                galleries={galleries}
                loadingGalleries={loadingGalleries}
                coverFallback={coverFallback}
                actions={galleryActions}
                onOpenGallery={openGalleryEditor}
                onOpenEmailShare={share.openEmailShare}
                onNewGallery={() => createForm.setShowModal(true)}
                editorOpen={editingGallery !== null}
              />
            )}
          </main>

          {createForm.showModal && (
            <CreateGalleryModal form={createForm} tokenBalance={tokenBalance} locale={locale} ownerT={ownerT} />
          )}
          {share.shareGallery && (
            <ShareGalleryModal
              share={share}
              shareUrl={galleryActions.shareUrl}
              activitySummary={editor.activity.activitySummary}
              activityLoading={editor.activity.activityLoading}
            />
          )}
          {share.previewHtml && (
            <EmailPreviewModal html={share.previewHtml} onClose={() => share.setPreviewHtml(null)} />
          )}
          {TOKEN_BILLING_ON && showBuyTokens && (
            <BuyTokensModal tokenBalance={tokenBalance} onClose={() => setShowBuyTokens(false)} showToast={showToast} />
          )}
          {editor.storyGen.showStoryStyleModal && <StoryGenerateModal />}
        </div>

        {/* Styled confirm dialog used by every destructive handler. */}
        <ConfirmHost />
      </div>
    </EditorContext.Provider>
  )
}
