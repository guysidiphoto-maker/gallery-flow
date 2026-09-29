// TEMPORARY: the dashboard's editorial palette, shared by the split files so
// their inline styles keep working. Delete once the folder moves to Tailwind tokens.

export const accent = '#141413'
export const accentLight = '#000000'
export const bg = '#F2EFE9'
export const bgSubtle = '#FAF9F5'
export const card = '#FBFBF9'
export const cardSolid = '#FFFFFF'
export const border = '#D0D0D0'
export const borderHover = '#141413'
export const textPrimary = '#141413'
export const textSecondary = '#333333'
// Darkened from #BCBCBC to pass WCAG-AA contrast on the cream canvas.
export const textMuted = '#767470'
export const statusLive = '#7B8F6E'

// Keyframes + a few media-query rules the inline styles rely on; injected once.
const styleId = 'dashboard-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes modalIn  { from { opacity:0; transform:scale(.96) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes shimmer  { from { background-position: -400px 0; } to { background-position: 400px 0; } }
    .dash-toggle { min-width:52px !important; width:52px !important; height:30px !important; border-radius:30px !important; border:none !important; cursor:pointer; padding:3px !important; flex-shrink:0; display:flex !important; align-items:center !important; transition:background .2s; }
    .dash-toggle-off { background:rgba(0,0,0,.08) !important; }
    .dash-toggle-on  { background:#2DC479 !important; }
    .dash-toggle-knob { width:24px !important; height:24px !important; border-radius:50% !important; background:#fff !important; box-shadow:0 1px 6px rgba(0,0,0,.35); transition:transform .25s cubic-bezier(.4,.2,.2,1); }
    .dash-toggle-on .dash-toggle-knob { transform:translateX(22px); }
    @keyframes pulse    { 0%,100% { opacity:.4; } 50% { opacity:1; } }
    @keyframes overlayIn { from { opacity:0; } to { opacity:1; } }

    /* Keyboard-only focus ring (WCAG-AA). */
    .dash button:focus-visible,
    .dash a:focus-visible,
    .dash input:focus-visible,
    .dash textarea:focus-visible,
    .dash select:focus-visible {
      outline: 2px solid #141413;
      outline-offset: 2px;
      border-radius: 2px;
    }

    /* Below 900px the sidebar becomes an off-canvas drawer from the inline end. */
    @media (max-width: 900px) {
      .dash-sidebar {
        position: fixed !important;
        inset-inline-end: 0 !important;
        top: 0 !important;
        height: 100vh !important;
        --dash-drawer-hide: translateX(100%);
        transform: var(--dash-drawer-hide);
        transition: transform .25s cubic-bezier(.4,0,.2,1);
        box-shadow: -8px 0 32px rgba(0,0,0,.4);
      }
      [dir="rtl"] .dash-sidebar { --dash-drawer-hide: translateX(-100%); }
      .dash-sidebar.dash-sidebar--open {
        transform: translateX(0);
      }
      .dash-sidebar-backdrop { display: block !important; }
      .dash-hamburger { display: flex !important; }
    }

    /* Honor the OS "reduce motion" preference. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `
  document.head.appendChild(style)
}
