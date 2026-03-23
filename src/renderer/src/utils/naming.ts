/**
 * Smart Naming System
 *
 * Filename format:  NNNN[_NNN[_NNN[...]]].<ext>
 *
 * Examples:
 *   0001.jpg
 *   0002.jpg
 *   0002_001.jpg   ← inserted after 0002
 *   0002_001_001.jpg  ← inserted after 0002_001
 *   0002_002.jpg   ← second insert after 0002
 *
 * Sort correctness guaranteed because:
 *   - "0002" < "0002_001"  (shorter string sorts first when prefix matches)
 *   - "0002_001" < "0003"  (0002 < 0003 at position 3)
 *   - "0002_001_001" < "0002_002"  (001 < 002 at the sub-level)
 */

export interface ParsedFilename {
  components: string[]   // e.g. ['0002', '001'] for "0002_001.jpg"
  ext: string            // e.g. '.jpg' (always lowercase)
}

export function parseFilename(filename: string): ParsedFilename {
  const lastDot = filename.lastIndexOf('.')
  const ext = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : ''
  const base = lastDot >= 0 ? filename.slice(0, lastDot) : filename
  const components = base.split('_')
  return { components, ext }
}

/**
 * Generate a filename that sorts immediately after `prevFilename`.
 *
 * If prevFilename is null, generates a name that sorts before all
 * standard NNNN.ext names (useful for Move-to-Top).
 *
 * @param prevFilename  The file to insert after (null = insert at beginning)
 * @param ext           Extension for the new file (e.g. '.jpg')
 * @param existingNames Set of lowercased filenames currently on disk
 */
export function generateInsertAfterName(
  prevFilename: string | null,
  ext: string,
  existingNames: Set<string>
): string {
  const normExt = ext.toLowerCase()

  if (prevFilename === null) {
    // Insert before everything: use 0000_NNN which sorts before 0001
    for (let i = 1; i <= 999; i++) {
      const name = `0000_${pad3(i)}${normExt}`
      if (!existingNames.has(name.toLowerCase())) return name
    }
    // 0000_001..999 all taken — go one level deeper on the highest slot
    return generateInsertAfterName(`0000_999${normExt}`, normExt, existingNames)
  }

  const { components } = parseFilename(prevFilename)

  // Try appending _001, _002, ... _999
  for (let i = 1; i <= 999; i++) {
    const name = [...components, pad3(i)].join('_') + normExt
    if (!existingNames.has(name.toLowerCase())) return name
  }

  // All 999 slots taken — go deeper on the last occupied _999 slot
  // Find highest existing slot and recurse on it
  for (let i = 999; i >= 1; i--) {
    const candidate = [...components, pad3(i)].join('_') + normExt
    if (existingNames.has(candidate.toLowerCase())) {
      return generateInsertAfterName(candidate, normExt, existingNames)
    }
  }

  // Should never reach here unless something went very wrong
  throw new Error(`Cannot generate insert name after "${prevFilename}" — all slots exhausted`)
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

/**
 * Generate sequential names for "Apply current order to filenames".
 * Returns pairs of [originalPath, newFilename].
 * Does NOT write to disk — caller is responsible for confirming and applying.
 */
export function generateSequentialNames(
  images: Array<{ path: string; filename: string; ext: string }>,
  prefix = '',
  startAt = 1
): Array<{ oldPath: string; newFilename: string }> {
  const digits = Math.max(4, String(images.length + startAt - 1).length)

  return images.map((img, i) => {
    const num = String(i + startAt).padStart(digits, '0')
    return {
      oldPath: img.path,
      newFilename: `${prefix}${num}${img.ext.toLowerCase()}`
    }
  })
}

/**
 * Check whether a proposed rename is safe (no collision, not a no-op).
 */
export function validateRename(
  oldFilename: string,
  newFilename: string,
  existingNames: Set<string>
): { valid: boolean; error?: string } {
  if (oldFilename.toLowerCase() === newFilename.toLowerCase()) {
    return { valid: true } // no-op, safe
  }
  if (existingNames.has(newFilename.toLowerCase())) {
    return { valid: false, error: `"${newFilename}" already exists in this folder` }
  }
  return { valid: true }
}

/**
 * Given a folder, check if a proposed sequential rename set is safe.
 * Returns any conflicts found.
 */
export function findRenameConflicts(
  operations: Array<{ oldPath: string; newFilename: string }>,
  existingFilenames: Set<string>
): string[] {
  const conflicts: string[] = []
  const pendingNew = new Set<string>()
  const pendingOld = new Set(operations.map(op => {
    const parts = op.oldPath.split('/')
    return parts[parts.length - 1].toLowerCase()
  }))

  for (const op of operations) {
    const newLower = op.newFilename.toLowerCase()

    // Conflict if target exists AND is not one of the files being renamed away
    if (existingFilenames.has(newLower) && !pendingOld.has(newLower)) {
      conflicts.push(op.newFilename)
    }
    if (pendingNew.has(newLower)) {
      conflicts.push(`duplicate target: ${op.newFilename}`)
    }
    pendingNew.add(newLower)
  }

  return conflicts
}
