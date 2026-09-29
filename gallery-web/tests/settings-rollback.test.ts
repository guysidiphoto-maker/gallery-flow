// settings-rollback.test.ts — a failed optimistic delivery_settings write must
// undo only its own keys. Run:  npx tsx tests/settings-rollback.test.ts

import { rollbackSettingsPatch } from '../src/features/dashboard/lib/settingsRollback.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// A failed write to `a` while a concurrent write to `b` succeeded.
{
  const prev = { a: 1, b: 1 }
  const current = { a: 2, b: 5 }
  const out = rollbackSettingsPatch(current, prev, { a: 2 })
  ok('restores only the patched key', eq(out, { a: 1, b: 5 }), JSON.stringify(out))
}

// A newer write to the same key already replaced the optimistic value.
{
  const out = rollbackSettingsPatch({ a: 3 }, { a: 1 }, { a: 2 })
  ok('keeps a newer value of the same key', eq(out, { a: 3 }), JSON.stringify(out))
}

// A key that did not exist before is removed again.
{
  const out = rollbackSettingsPatch({ a: 1, n: 'x' }, { a: 1 }, { n: 'x' })
  ok('removes a key that was absent', eq(out, { a: 1 }) && !('n' in out), JSON.stringify(out))
}

// Multi-key patch: each key checked on its own.
{
  const out = rollbackSettingsPatch({ a: 2, b: 9 }, { a: 1, b: 1 }, { a: 2, b: 2 })
  ok('multi-key patch rolls back only untouched keys', eq(out, { a: 1, b: 9 }), JSON.stringify(out))
}

// Object values compare by identity (the optimistic value is the patch's own object).
{
  const cover = { path: 'x' }
  const out = rollbackSettingsPatch({ cover }, { cover: null }, { cover })
  ok('object value restored when unchanged', eq(out, { cover: null }), JSON.stringify(out))
}

{
  const current = { a: 3 }
  ok('no-op returns the same object', rollbackSettingsPatch(current, { a: 1 }, { a: 2 }) === current)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
