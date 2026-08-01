// wizardTypes.ts — shared shapes passed between ImportCenter and its steps.

import type { ImporterKey } from './strings'
import type { ImportCollection } from './importApi'
import type { ZipListing } from './importApi'

export type T = (key: ImporterKey, vars?: Record<string, string | number>) => string

export type StepIndex = 1 | 2 | 3 | 4 | 5

/** A ZIP the user picked, plus its client-side listing and current mapping. */
export interface ZipSlot {
  id: string
  file: File
  listing: ZipListing | null
  error: string | null
  /** import_collections.id this ZIP is mapped to, or null. */
  collectionId: string | null
}

/** Per-collection run outcome, accumulated during Step 4 and shown in Step 5. */
export interface CollectionOutcome {
  collectionId: string
  sourceName: string
  galleryId: string | null
  gallerySlug: string | null
  uploaded: number
  skippedDuplicate: number
  failed: number
  failures: Array<{ filename: string; error: string }>
}

export type DuplicatePolicy = 'skip' | 'replace' | 'create_copy'

export interface WizardCommon {
  t: T
  dir: 'rtl' | 'ltr'
  locale: 'he' | 'en'
}

export type { ImportCollection }
