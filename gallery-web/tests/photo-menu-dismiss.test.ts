// photo-menu-dismiss.test.ts — regression proof for the gallery-editor photo
// action menu dismissal contract. The bug: the per-photo "..." menu could not
// be reliably dismissed by clicking outside it. The fix reuses the shared
// useDismiss primitive; its decision logic is extracted into makeDismissHandlers
// so it can be proven here without a DOM/React runtime. Run:
//   npx tsx tests/photo-menu-dismiss.test.ts

import { makeDismissHandlers } from '../src/components/portal/useDismiss.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// Minimal fake menu container: contains() returns true only for nodes we say
// are inside the popup — mirrors DOM Node.contains().
function fakeContainer(insideNodes: unknown[]) {
  return { contains: (n: unknown) => insideNodes.includes(n) }
}

// --- Clicking OUTSIDE the menu closes it (the actual reported bug) ---
{
  const inside = { id: 'menu-item' }
  const outside = { id: 'elsewhere' }
  let closed = 0
  const { onPointer } = makeDismissHandlers(() => fakeContainer([inside]), () => { closed++ })
  onPointer({ target: outside })
  ok('outside pointer closes the menu', closed === 1, `closed=${closed}`)
}

// --- Clicking INSIDE the menu does NOT close it (action must run first) ---
{
  const inside = { id: 'menu-item' }
  let closed = 0
  const { onPointer } = makeDismissHandlers(() => fakeContainer([inside]), () => { closed++ })
  onPointer({ target: inside })
  ok('inside pointer does not close', closed === 0, `closed=${closed}`)
}

// --- Escape closes the menu ---
{
  let closed = 0
  const { onKey } = makeDismissHandlers(() => fakeContainer([]), () => { closed++ })
  onKey({ key: 'Escape' })
  ok('Escape closes the menu', closed === 1, `closed=${closed}`)
}

// --- Other keys do NOT close (e.g. arrow keys drive in-menu navigation) ---
{
  let closed = 0
  const { onKey } = makeDismissHandlers(() => fakeContainer([]), () => { closed++ })
  onKey({ key: 'ArrowDown' })
  onKey({ key: 'Enter' })
  onKey({ key: 'a' })
  ok('non-Escape keys do not close', closed === 0, `closed=${closed}`)
}

// --- No container yet (menu unmounted / ref null) → never closes, no crash ---
{
  let closed = 0
  const { onPointer } = makeDismissHandlers(() => null, () => { closed++ })
  onPointer({ target: { id: 'whatever' } })
  ok('null container is a safe no-op', closed === 0, `closed=${closed}`)
}

// --- Clicking ANOTHER photo (a different outside node) closes the open menu ---
{
  const inside = { id: 'open-menu' }
  const otherTile = { id: 'other-photo-tile' }
  let closed = 0
  const { onPointer } = makeDismissHandlers(() => fakeContainer([inside]), () => { closed++ })
  onPointer({ target: otherTile })
  ok('clicking another photo closes the menu', closed === 1, `closed=${closed}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
