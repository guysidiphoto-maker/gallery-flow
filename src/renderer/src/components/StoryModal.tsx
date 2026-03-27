import React, { useState, useEffect, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGallery } from '../store/gallery'
import type { StorySceneDef, StoryOptions, StoryDuration, StoryStyle, StoryMotionMode, StoryTransitionStyle, StoryColorMatch } from '../types'
import { toLocalURL } from '../utils/imageUtils'

type Step = 'configure' | 'preview' | 'exporting' | 'done' | 'error'

// ── Style presets ──────────────────────────────────────────────────────────────

interface StylePreset {
  label: string
  description: string
  icon: string
  motionMode: StoryMotionMode
  transitionStyle: StoryTransitionStyle
  colorMatch: StoryColorMatch
}

const STYLE_PRESETS: Record<StoryStyle, StylePreset> = {
  clean: {
    label: 'Clean',
    description: 'Subtle Ken Burns · Fade cuts',
    icon: '✦',
    motionMode: 'subtle',
    transitionStyle: 'clean',
    colorMatch: 'off'
  },
  cinematic: {
    label: 'Cinematic',
    description: 'Dynamic zoom · Flow-matched cuts',
    icon: '◈',
    motionMode: 'dynamic',
    transitionStyle: 'cinematic',
    colorMatch: 'subtle'
  },
  'fast-social': {
    label: 'Fast Social',
    description: 'Energetic motion · Snappy slides',
    icon: '▶',
    motionMode: 'subtle',
    transitionStyle: 'energetic',
    colorMatch: 'off'
  },
  elegant: {
    label: 'Elegant',
    description: 'Still frames · Pure fades',
    icon: '◇',
    motionMode: 'none',
    transitionStyle: 'clean',
    colorMatch: 'subtle'
  }
}

// ── Scene preview card ─────────────────────────────────────────────────────────

function SceneThumb({ scene, index }: { scene: StorySceneDef; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1
  }

  return (
    <div ref={setNodeRef} style={style} className="story-scene-card" {...attributes} {...listeners}>
      <div className="story-scene-card__phone">
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
          <div className="story-scene-card__overlay">
            <span className="story-scene-card__dur">{scene.duration.toFixed(1)}s</span>
          </div>
        </div>
      </div>
      <div className="story-scene-card__num">#{index + 1}</div>
    </div>
  )
}

// ── Animated checkmark SVG ─────────────────────────────────────────────────────

function AnimatedCheck() {
  return (
    <svg className="story-done__check" viewBox="0 0 52 52">
      <circle className="story-done__check-circle" cx="26" cy="26" r="24" fill="none" />
      <path className="story-done__check-mark" fill="none" d="M14 27 L22 35 L38 19" />
    </svg>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function StoryModal() {
  const { images, topPickIds, closeStoryModal } = useGallery()

  const topPickImages = images.filter(img => topPickIds.has(img.id))

  const [step, setStep] = useState<Step>('configure')
  const [options, setOptions] = useState<StoryOptions>({
    totalDuration: 20,
    style: 'clean',
    motionMode: 'subtle',
    transitionStyle: 'clean',
    colorMatch: 'off'
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step !== 'exporting') closeStoryModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, closeStoryModal])

  useEffect(() => {
    const unsub = window.api.onStoryProgress(({ percent, stage }) => {
      setExportProgress(percent)
      setExportStage(stage)
    })
    return unsub
  }, [])

  const applyStyle = useCallback((style: StoryStyle) => {
    const preset = STYLE_PRESETS[style]
    setOptions(o => ({
      ...o,
      style,
      motionMode: preset.motionMode,
      transitionStyle: preset.transitionStyle,
      colorMatch: preset.colorMatch
    }))
  }, [])

  const handlePreview = useCallback(async () => {
    setIsBuilding(true)
    const imagePaths = topPickImages.map(img => img.path)
    const result = await window.api.buildStoryScenes(imagePaths, options.totalDuration, options.motionMode) as {
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
      scenes.map(s => ({ type: s.type, imagePaths: s.imagePaths, duration: s.duration, motionType: s.motionType })),
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

  const stepIndex = { configure: 0, preview: 1, exporting: 2, done: 2, error: 2 }[step]

  return (
    <div className="modal-backdrop story-backdrop">
      <div className="modal modal--story">

        {/* Cinematic header stripe */}
        <div className="story-header-stripe">
          <div className="story-header-stripe__glow" />
          <div className="story-header-content">
            <div className="story-header-left">
              <div className="story-header-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 2L16 7M8 2L8 7M2 12h20" />
                  <circle cx="8" cy="17" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="17" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div>
                <h2 className="story-header-title">Create Story Video</h2>
                <div className="story-header-meta">
                  <span className="story-header-badge">{topPickImages.length} picks</span>
                  <span className="story-header-badge">9:16</span>
                  <span className="story-header-badge">H.264</span>
                </div>
              </div>
            </div>
            {step !== 'exporting' && (
              <button className="btn btn--ghost btn--icon story-modal__close" onClick={closeStoryModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="story-steps">
          {(['configure', 'preview', 'exporting'] as const).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`story-step ${stepIndex === i ? 'active' : ''} ${stepIndex > i ? 'done' : ''}`}>
                <div className="story-step__dot">
                  {stepIndex > i ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i + 1}
                </div>
                <span>{s === 'configure' ? 'Style' : s === 'preview' ? 'Scenes' : 'Export'}</span>
              </div>
              {i < 2 && <div className={`story-step-line ${stepIndex > i ? 'done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── Step 1: Configure ── */}
        {step === 'configure' && (
          <div className="modal__body">
            <div className="story-option-group">
              <label className="story-option-label">Visual Style</label>
              <div className="story-style-grid">
                {(Object.entries(STYLE_PRESETS) as [StoryStyle, StylePreset][]).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`story-style-card ${options.style === key ? 'active' : ''}`}
                    onClick={() => applyStyle(key)}
                  >
                    <span className="story-style-card__icon">{preset.icon}</span>
                    <span className="story-style-card__name">{preset.label}</span>
                    <span className="story-style-card__desc">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="story-options-row">
              <div className="story-option-group story-option-group--inline">
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

              <div className="story-option-group story-option-group--inline">
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
            </div>

            <div className="story-options-row">
              <div className="story-option-group story-option-group--inline">
                <label className="story-option-label">Transitions</label>
                <div className="story-option-pills">
                  {(['clean', 'cinematic', 'energetic'] as StoryTransitionStyle[]).map(t => (
                    <button
                      key={t}
                      className={`story-pill ${options.transitionStyle === t ? 'active' : ''}`}
                      onClick={() => setOptions(o => ({ ...o, transitionStyle: t }))}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="story-option-group story-option-group--inline">
                <label className="story-option-label">Color Match</label>
                <div className="story-option-pills">
                  {(['off', 'subtle', 'strong'] as StoryColorMatch[]).map(c => (
                    <button
                      key={c}
                      className={`story-pill ${options.colorMatch === c ? 'active' : ''}`}
                      onClick={() => setOptions(o => ({ ...o, colorMatch: c }))}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && (
          <div className="modal__body">
            <div className="story-preview-header">
              <span className="story-preview-count">{scenes.length} scenes</span>
              <span className="story-preview-dur">{actualDuration}s</span>
              <span className="story-preview-style">{STYLE_PRESETS[options.style].label}</span>
              <span className="story-preview-hint">drag to reorder</span>
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

        {/* ── Step 3: Exporting / Done / Error ── */}
        {(step === 'exporting' || step === 'done' || step === 'error') && (
          <div className="modal__body story-export-body">
            {step === 'exporting' && (
              <>
                <div className="story-export-ring">
                  <svg viewBox="0 0 80 80" className="story-ring-svg">
                    <circle className="story-ring-track" cx="40" cy="40" r="34" />
                    <circle
                      className="story-ring-fill"
                      cx="40" cy="40" r="34"
                      style={{ strokeDashoffset: 214 - (214 * exportProgress / 100) }}
                    />
                  </svg>
                  <span className="story-ring-pct">{exportProgress}%</span>
                </div>
                <p className="story-export-stage">{exportStage}</p>
              </>
            )}

            {step === 'done' && (
              <div className="story-done">
                <AnimatedCheck />
                <p className="story-done__title">Your story is ready</p>
                <p className="story-done__path" title={outputPath}>{outputPath.split('/').pop()}</p>
                <button
                  className="btn btn--accent story-done__reveal"
                  onClick={() => window.api.revealInFinder(outputPath)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
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
            <div className="story-building-dots">
              <span /><span /><span />
            </div>
            <span>Analyzing scenes…</span>
          </div>
        )}

        {/* Footer */}
        <div className="modal__footer">
          {step === 'configure' && (
            <>
              <button className="btn btn--ghost" onClick={closeStoryModal}>Cancel</button>
              <button
                className="btn btn--accent story-cta"
                onClick={handlePreview}
                disabled={isBuilding || topPickImages.length === 0}
              >
                {isBuilding ? 'Analyzing…' : <>Preview Scenes <span className="story-cta-arrow">→</span></>}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button className="btn btn--ghost" onClick={() => setStep('configure')}>← Back</button>
              <button className="btn btn--accent story-cta" onClick={handleExport}>
                Export MP4 <span className="story-cta-arrow">→</span>
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
