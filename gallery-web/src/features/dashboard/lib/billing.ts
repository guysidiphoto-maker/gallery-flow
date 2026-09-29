// Token-pack buying is hidden until checkout is live (the create-checkout edge
// function isn't deployed, so "buy" would dead-end). The balance stays visible.
// Flip VITE_FEATURE_GALLERY_BILLING=true once checkout ships.
export const TOKEN_BILLING_ON = import.meta.env.VITE_FEATURE_GALLERY_BILLING === 'true'
