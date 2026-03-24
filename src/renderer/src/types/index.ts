export interface ImageFile {
  /** Stable ID — original path at load time, never changes */
  id: string
  /** Current filename on disk */
  filename: string
  /** Full absolute path */
  path: string
  /** Parent folder */
  folderPath: string
  /** Lowercase extension including dot: ".jpg" */
  ext: string
  /** File size in bytes */
  size: number
  /** Last-modified timestamp ms */
  mtimeMs: number
  /** Birth/creation timestamp ms */
  birthtimeMs: number
  /** EXIF capture time (loaded lazily) */
  captureTime?: number | null
  /** Camera model (loaded lazily) */
  cameraModel?: string | null
}

export interface RenameOperation {
  imageId: string
  oldPath: string
  oldFilename: string
  newPath: string
  newFilename: string
}

export interface RenameHistoryEntry {
  id: string
  timestamp: number
  description: string
  operations: RenameOperation[]
}

export interface DuplicateGroup {
  ids: string[]
  reason: 'identical-size' | 'similar-hash'
}

export type SortMode = 'filename' | 'date-asc' | 'date-desc' | 'shuffle'

// ─── Story Video ─────────────────────────────────────────────────────────────

export type StoryDuration = 15 | 20 | 30
export type StorySceneType = 'portrait' | 'landscape-3' | 'landscape-2' | 'landscape-1'
export type StoryStyle = 'clean' | 'cinematic' | 'fast-social' | 'elegant'
export type StoryMotionMode = 'none' | 'subtle' | 'dynamic'
export type StoryMotionType = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'drift-up' | 'drift-down'
export type StoryTransitionStyle = 'clean' | 'cinematic' | 'energetic'
export type StoryColorMatch = 'off' | 'subtle' | 'strong'

export interface StoryOptions {
  totalDuration: StoryDuration
  style: StoryStyle
  motionMode: StoryMotionMode
  transitionStyle: StoryTransitionStyle
  colorMatch: StoryColorMatch
}

/** A scene definition returned from the main process after probing image dimensions */
export interface StorySceneDef {
  id: string
  type: StorySceneType
  /** Motion type assigned to this scene for Ken Burns effect */
  motionType: StoryMotionType
  /** Absolute paths to images in this scene (already converted from HEIC if needed) */
  imagePaths: string[]
  /** localfile:// URLs for display in the renderer */
  imageUrls: string[]
  /** Computed scene duration in seconds */
  duration: number
  /** Original image widths (for preview layout hints) */
  widths: number[]
  heights: number[]
}

export interface StoryBuildResult {
  scenes: StorySceneDef[]
  totalDuration: number  // actual computed duration (may differ slightly from requested)
  sceneCount: number
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export type SectionNamingMode = 'sequential' | 'original' | 'custom-prefix'

export interface Section {
  id: string
  name: string
  imageIds: string[]          // ordered list of image IDs belonging to this section
  namingMode: SectionNamingMode
  customPrefix: string        // used when namingMode === 'custom-prefix'
}

// ─── Social / Instagram Mode ──────────────────────────────────────────────────

export type SocialPostType = 'single' | 'carousel' | 'split-tile'
export type SplitLayout = '2h' | '3h' | '2v' | '4' | '6' | '9'

export interface CropState {
  panX: number   // CSS pixels offset from center (applied at display scale)
  panY: number
  zoom: number   // 1.0 to 2.0
}

export interface SocialPost {
  id: string
  type: SocialPostType
  /** imageIds this post contains:
   *  - single: [imageId]
   *  - carousel: [imageId, imageId, ...]
   *  - split-tile: [sourceImageId] */
  imageIds: string[]
  // Split tile metadata
  splitGroupId?: string
  splitLayout?: SplitLayout
  splitTileIndex?: number
  splitTotalTiles?: number
}

export interface SocialExportScene {
  postNumber: number       // 1-based visual grid position
  type: SocialPostType
  imagePaths: string[]     // source image paths
  splitLayout?: SplitLayout
  splitTileIndex?: number
  isCarousel?: boolean
  cropState?: CropState
  imageDims?: { width: number; height: number }
}
