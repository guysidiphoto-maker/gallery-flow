// reorder-resync.test.ts — after a partly failed reorder the grid shows the
// order the server actually holds. Run:  npx tsx tests/reorder-resync.test.ts

import { applyServerSortOrder, moveItem } from '../src/features/dashboard/lib/reorder.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}
const ids = (xs: { id: string }[]) => xs.map(x => x.id).join(',')

// Optimistic order a,b,c → c,a,b; only c's write (0) and a's (1000) landed.
{
  const optimistic = [
    { id: 'c', sort_order: 0, name: 'C' },
    { id: 'a', sort_order: 1000, name: 'A' },
    { id: 'b', sort_order: 2000, name: 'B' },
  ]
  const server = [{ id: 'c', sort_order: 0 }, { id: 'b', sort_order: 1 }, { id: 'a', sort_order: 1000 }]
  const out = applyServerSortOrder(optimistic, server)
  ok('takes the server order', ids(out) === 'c,b,a', ids(out))
  ok('keeps other fields', out.find(x => x.id === 'b')?.name === 'B')
  ok('does not mutate input', optimistic[2].sort_order === 2000)
}

// Rows missing from the server read (e.g. other sections) keep their order.
{
  const out = applyServerSortOrder(
    [{ id: 'x', sort_order: 5 }, { id: 'y', sort_order: 1 }],
    [{ id: 'y', sort_order: 10 }],
  )
  ok('unknown rows keep sort_order', ids(out) === 'x,y' && out[0].sort_order === 5, ids(out))
}

// moveItem sanity (the optimistic side of the same flow).
{
  const out = moveItem([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c', 'a')
  ok('moveItem moves to target index', out !== null && ids(out) === 'c,a,b')
  ok('moveItem null on missing id', moveItem([{ id: 'a' }], 'a', 'z') === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
