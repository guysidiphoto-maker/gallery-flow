import { lazy } from 'react'

// Opened on a tap or only for some galleries, so they stay out of the first viewer bundle.
export const loadLightbox = () => import('./Lightbox')
export const Viewer = lazy(() => loadLightbox().then(m => ({ default: m.Viewer })))
export const StoryPlayer = lazy(() => import('./StoryPlayer').then(m => ({ default: m.StoryPlayer })))
export const DownloadEmailGate = lazy(() => import('./DownloadEmailGate').then(m => ({ default: m.DownloadEmailGate })))
export const TurnstileOverlay = lazy(() => import('./TurnstileOverlay').then(m => ({ default: m.TurnstileOverlay })))
export const RoleSelectScreen = lazy(() => import('./RoleSelectScreen').then(m => ({ default: m.RoleSelectScreen })))
