import React, { useState, useEffect, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGallery } from '../store/gallery'
import type { StorySceneDef, StoryOptions, StoryTransition, StoryDuration, StoryStyle, StoryMotionMode } from '../types'
import { toLocalURL } from '../utils/imageUtils'

type Step = 'configure' | 'preview' | 'exporting' | 'done' | 'error'

// ── Style presets ──────────────────────────────────────────────────────────────

interface StylePreset {
  label: string
  description: string
  transition: StoryTransition
  motionMode: StoryMotionMode
}

const STYLE_PRESETS: Record<StoryStyle, StylePreset> = {
  clean: {
    label: 'Clean',
    description: 'Subtle motion, fade transitions',
    transition: 'fade',
    motionMode: 'subtle'
  },
  cinematic: {
    label: 'Cinematic',
    description: 'Dynamic zoom, slow & dramatic',
    transition: 'zoom',
    motionMode: 'dynamic'
  },
  'fast-social': {
    label: 'Fast Social',
    description: 'Snappy slides, quick pace',
    transition: 'slide',
    motionMode: 'subtle'
  },
  elegant: {
    label: 'Elegant',
    description: 'No motion, pure fades',
    transition: 'fade',
    motionMode: 'none'
  }
}

// ── Scene preview card ─────────────────────────────────────────────────────────

function SceneThumb({ scene, index }: { scene: StorySceneDef; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <div ref={setNodeRef} style={style} className="story-scene-card" {...attributes} {...listeners}>
      <div className="story-scene-card__frame">
        {scene.type === 'portrait' && (
          <img src={scene.imageUrls[0]} alt="" className="story-scene-card__img story-scene-card__img--cover" />
        )}
        {scene.type === 'landscape-3' && (
          <div className="story-scene-card__stack3">
            {scene.imageUrls.map((url, i) => <img key={i} src={url} alt="" />)}
          </div>
        )}
        {scene.type === 'landscape-2' && (
          <div className="story-scene-card__stack2">
            {scene.imageUrls.map((url, i) => <img key={i} src={url} alt="" />)}
          </div>
        )}
        {scene.type === 'landscape-1' && (
          <div className="story-scene-card__l1">
            <img src={scene.imageUrls[0]} alt="" className="story-scene-card__l1-bg" />
            <img src={scene.imageUrls[0]} alt="" className="story-scene-card__l1-fg" />
          </div>
        )}
      </div>
      <div className="story-scene-card__meta">
        <span className="story-scene-card__num">{index + 1}</span>
        <span className="story-scene-card__dur">{scene.duration.toFixed(1)}s</span>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function StoryModal() {
  const { images, topPickIds, closeStoryModal } = useGallery()

  // Top picks in gallery order (not pick-press order)
  const topPickImages = images.filter(img => topPickIds.has(img.id))

  const [step, setStep] = useState<Step>('configure')
  const [options, setOptions] = useState<StoryOptions>({
    transition: 'fade',
    totalDuration: 20,
    style: 'clean',
    motionMode: 'subtle'
  })
  const [scenes, setScenes] = useState<StorySceneDef[]>([])
  const [actualDuration, setActualDuration] = useState(0)
  const [isBuilding, setIsBuilding] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStage, setExportStage] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'exporting') closeStoryModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, closeStoryModal])

  // Subscribe to render progress
  useEffect(() => {
    const unsub = window.api.onStoryProgress(({ percent, stage }) => {
      setExportProgress(percent)
      setExportStage(stage)
    })
    return unsub
  }, [])

  // Apply style preset
  const applyStyle = useCallback((style: StoryStyle) => {
    const preset = STYLE_PRESETS[style]
    setOptions(o => ({
      ...o,
      style,
      transition: preset.transition,
      motionMode: preset.motionMode
    }))
  }, [])

  // Build scenes when moving to preview step
  const handlePreview = useCallback(async () => {
    setIsBuilding(true)
    const imagePaths = topPickImages.map(img => img.path)
    const result = await window.api.buildStoryScenes(imagePaths, options.totalDuration) as {
      scenes: StorySceneDef[]
      totalDuration: number
      sceneCount: number
      error?: string
    }
    setIsBuilding(false)
    if (result.error) {
      setErrorMsg(result.error)
      setStep('error')
      return
    }
    setScenes(result.scenes)
    setActualDuration(result.totalDuration)
    setStep('preview')
  }, [topPickImages, options.totalDuration])

  const handleExport = useCallback(async () => {
    const defaultName = `story_${new Date().toISOString().slice(0, 10)}.mp4`
    const path = await window.api.chooseExportPath(defaultName)
    if (!path) return

    setOutputPath(path)
    setExportProgress(0)
    setExportStage('Starting…')
    setStep('exporting')

    const result = await window.api.renderStory(
      scenes.map(s => ({ type: s.type, imagePaths: s.imagePaths, duration: s.duration })),
      options,
      path
    )

    if (result.success) {
      setStep('done')
    } else {
      setErrorMsg(result.error ?? 'Unknown error')
      setStep('error')
    }
  }, [scenes, options])

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (over && active.id !== over.id) {
      setScenes(prev => {
        const oi = prev.findIndex(s => s.id === active.id)
        const ni = prev.findIndex(s => s.id === over.id)
        return arrayMove(prev, oi, ni)
      })
    }
  }

  const activeScene = activeId ? scenes.find(s => s.id === activeId) : null

  return (
    <div className="modal-backdrop">
      <div className="modal modal--story">
        {/* Header */}
        <div className="modal__header">
          <div>
            <h2>Create Story Video</h2>
            <p className="modal__subtitle">
              {topPickImages.length} top pick image{topPickImages.length !== 1 ? 's' : ''} · 9:16 vertical · H.264 MP4
            </p>
          </div>
          {step !== 'exporting' && (
            <button className="btn btn--ghost btn--icon story-modal__close" onClick={closeStoryModal}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="story-steps">
          {(['configure', 'preview', 'exporting'] as const).map((s, i) => (
            <div key={s} className={`story-step ${step === s || (step === 'done' && s === 'exporting') ? 'active' : ''} ${i < ['configure', 'preview', 'exporting'].indexOf(step) ? 'done' : ''}`}>
              <div className="story-step__dot">{i + 1}</div>
              <span>{s === 'configure' ? 'Configure' : s === 'preview' ? 'Preview' : 'Export'}</span>
            </div>
          ))}
        </div>

        {/* ── Step 1: Configure ── */}
        {step === 'configure' && (
          <div className="modal__body">
            {/* Style selector */}
            <div className="story-option-group">
              <label className="story-option-label">Style</label>
              <div className="story-style-grid">
                {(Object.entries(STYLE_PRESETS) as [StoryStyle, StylePreset][]).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`story-style-card ${options.style === key ? 'active' : ''}`}
                    onClick={() => applyStyle(key)}
                  >
                    <span className="story-style-card__name">{preset.label}</span>
                    <span className="story-style-card__desc">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="story-option-group">
              <label className="story-option-label">Duration</label>
              <div className="story-option-pills">
                {([15, 20, 30] as StoryDuration[]).map(d => (
                  <button
                    key={d}
                    className={`story-pill ${options.totalDuration === d ? 'active' : ''}`}
                    onClick={() => setOptions(o => ({ ...o, totalDuration: d }))}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="story-option-group">
              <label className="story-option-label">Motion</label>
              <div className="story-option-pills">
                {(['none', 'subtle', 'dynamic'] as StoryMotionMode[]).map(m => (
                  <button
                    key={m}
                    className={`story-pill ${options.motionMode === m ? 'active' : ''}`}
                    onClick={() => setOptions(o => ({ ...o, motionMode: m }))}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="story-info-box">
              <div className="story-info-box__row">
                <span>Images</span><strong>{topPickImages.length}</strong>
              </div>
              <div className="story-info-box__row">
                <span>Output</span><strong>1080×1920 · 30fps · H.264</strong>
              </div>
              <div className="story-info-box__row">
                <span>Motion</span><strong>{STYLE_PRESETS[options.style].description}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && (
          <div className="modal__body">
            <div className="story-preview-header">
              <span>{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>
              <span className="story-preview-dur">{actualDuration}s total</span>
              <span className="story-preview-hint">Drag to reorder</span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={scenes.map(s => s.id)} strategy={horizontalListSortingStrategy}>
                <div className="story-scenes-strip">
                  {scenes.map((scene, i) => (
                    <SceneThumb key={scene.id} scene={scene} index={i} />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeScene ? <SceneThumb scene={activeScene} index={scenes.findIndex(s => s.id === activeId)} /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}

        {/* ── Step 3: Exporting ── */}
        {(step === 'exporting' || step === 'done' || step === 'error') && (
          <div className="modal__body story-export-body">
            {step === 'exporting' && (
              <>
                <div className="story-export-anim">
                  <div className="spinner story-spinner" />
                </div>
                <p className="story-export-stage">{exportStage}</p>
                <div className="progress-bar story-progress">
                  <div className="progress-bar__fill" style={{ width: `${exportProgress}%` }} />
                </div>
                <p className="story-export-pct">{exportProgress}%</p>
              </>
            )}

            {step === 'done' && (
              <div className="story-done">
                <div className="story-done__icon">✓</div>
                <p className="story-done__title">Video ready!</p>
                <p className="story-done__path" title={outputPath}>{outputPath.split('/').pop()}</p>
                <button
                  className="btn btn--accent"
                  onClick={() => window.api.revealInFinder(outputPath)}
                >
                  Show in Finder
                </button>
              </div>
            )}

            {step === 'error' && (
              <div className="story-error">
                <div className="story-error__icon">⚠</div>
                <p className="story-error__title">Export failed</p>
                <p className="story-error__msg">{errorMsg}</p>
                <button className="btn btn--ghost" onClick={() => setStep('preview')}>
                  ← Back
                </button>
              </div>
            )}
          </div>
        )}

        {/* Building indicator */}
        {isBuilding && (
          <div className="modal__body story-building">
            <div className="spinner" />
            <span>Analyzing images…</span>
          </div>
        )}

        {/* Footer */}
        <div className="modal__footer">
          {step === 'configure' && (
            <>
              <button className="btn btn--ghost" onClick={closeStoryModal}>Cancel</button>
              <button
                className="btn btn--accent"
                onClick={handlePreview}
                disabled={isBuilding || topPickImages.length === 0}
              >
                {isBuilding ? 'Analyzing…' : 'Preview Scenes →'}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button className="btn btn--ghost" onClick={() => setStep('configure')}>← Back</button>
              <button className="btn btn--accent" onClick={handleExport}>
                Export MP4 →
              </button>
            </>
          )}

          {step === 'done' && (
            <button className="btn btn--accent" onClick={closeStoryModal}>Done</button>
          )}
        </div>
      </div>
    </div>
  )
}
