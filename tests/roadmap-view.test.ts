import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { anchorOf } from '../components/navigation'
import { planFor } from '../components/timeline'
import { isFiltered, parseView, RESTORING, restores, restoringScript, results, sameFilters, statusCounts, viewSearch } from '../lib/roadmap-view'

const milestones = [
  { id: 'v0.7.0', items: [{ id: 'CFG-01', area: 'CFG', status: 'planned' }, { id: 'DOC-01', area: 'DOC', status: 'in-progress' }] },
  { id: 'v0.6.8', items: [{ id: 'RUN-11', area: 'RUN', status: 'done' }, { id: 'RUN-24', area: 'RUN', status: 'done' }, { id: 'MEM-16', area: 'MEM', status: 'done' }] },
  { id: 'backlog', items: [{ id: 'RUN-99', area: 'RUN', status: 'proposed' }] },
]
const ids = (f: Parameters<typeof results>[1]) => results(milestones, f).map((r) => r.item.id)

test('the URL holds three filters, the expanded milestones and the open item, in one order', () => {
  const view = parseView('?expanded=v0.6.8&state=done&item=RUN-24&milestone=v0.6.8&expanded=earlier&area=RUN')
  assert.deepEqual(view, { milestone: 'v0.6.8', area: 'RUN', state: 'done', expanded: ['v0.6.8', 'earlier'], item: 'RUN-24' })
  assert.equal(viewSearch(view), '?milestone=v0.6.8&area=RUN&state=done&expanded=v0.6.8&expanded=earlier&item=RUN-24')
  assert.equal(viewSearch(parseView('')), '')
  assert.deepEqual(parseView('?milestone=&area='), { milestone: undefined, area: undefined, state: undefined, expanded: [], item: undefined })
})

test('the filters are independent and combined: an item meets each one set', () => {
  assert.deepEqual(ids({}), ['CFG-01', 'DOC-01', 'RUN-11', 'RUN-24', 'MEM-16', 'RUN-99'])
  assert.deepEqual(ids({ milestone: 'v0.6.8' }), ['RUN-11', 'RUN-24', 'MEM-16'])
  assert.deepEqual(ids({ area: 'RUN' }), ['RUN-11', 'RUN-24', 'RUN-99'])
  assert.deepEqual(ids({ milestone: 'v0.6.8', area: 'RUN' }), ['RUN-11', 'RUN-24'])
  assert.deepEqual(ids({ milestone: 'v0.6.8', area: 'RUN', state: 'done' }), ['RUN-11', 'RUN-24'])
  assert.deepEqual(ids({ milestone: 'v0.6.8', state: 'planned' }), [])
  assert.deepEqual(ids({ state: 'implemented' }), [])
})

test('filters compare by value, and an empty one is no filter', () => {
  assert.equal(isFiltered({}), false)
  assert.equal(isFiltered({ area: 'RUN' }), true)
  assert.equal(sameFilters({ area: 'RUN' }, { area: 'RUN', milestone: undefined }), true)
  assert.equal(sameFilters({ area: 'RUN' }, { area: 'MEM' }), false)
})

test('status counts follow the given order and leave out statuses no item has', () => {
  const order = ['done', 'implemented', 'in-progress', 'planned', 'proposed']
  assert.deepEqual(statusCounts(milestones[0].items, order), [['in-progress', 1], ['planned', 1]])
  assert.deepEqual(statusCounts(milestones[1].items, order), [['done', 3]])
})

// The page script that holds the Roadmap back, run as a browser would, before the Roadmap is read.
function runScript(plans: string[], search: string, hash: string) {
  const added: { id: string; textContent: string; removed?: boolean }[] = []
  const onLoad: (() => void)[] = []
  const timers: (() => void)[] = []
  const document = {
    createElement: () => ({ id: '', textContent: '', remove() { (this as { removed?: boolean }).removed = true } }),
    head: { appendChild: (e: (typeof added)[number]) => added.push(e) },
  }
  runInNewContext(restoringScript(plans), {
    location: { search, hash },
    document,
    URLSearchParams,
    decodeURIComponent,
    addEventListener: (type: string, run: () => void) => type === 'load' && onLoad.push(run),
    setTimeout: (run: () => void) => timers.push(run),
  })
  return { added, load: () => (onLoad.forEach((run) => run()), timers.forEach((run) => run())) }
}

test('the Roadmap waits for its first view exactly where the URL names another than the page is written with', () => {
  const planOf = { 'v0-7-0': 'v0.7.0', 'cfg-01': 'v0.7.0', '安装': 'v0.6.9', backlog: 'backlog' }
  const plans = Object.keys(planOf)
  const cases: [string, string][] = [
    ['', ''],
    ['?expanded=v0.6.8', ''],
    ['?expanded=', ''],
    ['?state=done', ''],
    ['?milestone=v0.7.0&area=RUN', ''],
    ['?area=', ''],
    ['?item=RUN-24', ''],
    ['?item=RUN-24&expanded=v0.6.8', ''],
    ['?other=1', ''],
    ['', '#v0-7-0'],
    ['', '#cfg-01'],
    ['', `#${encodeURIComponent('安装')}`],
    ['', '#planning-notes'],
    ['', '#constructor'],
    ['', '#__proto__'],
    ['', '#%'],
    ['', '#%E4%B8'],
    ['?state=done', '#%'],
  ]
  for (const [search, hash] of cases) {
    const view = parseView(search)
    // What the Timeline shows first: a full plan, results, or the timeline with milestones expanded.
    const first = planFor(planOf, anchorOf(hash)) ? 'plan' : isFiltered(view) ? 'results' : view.expanded.length ? 'expanded' : 'as written'
    assert.equal(restores(search, anchorOf(hash), plans), first !== 'as written', `${search}${hash}`)
    const { added } = runScript(plans, search, hash)
    assert.equal(added.length, first === 'as written' ? 0 : 1, `${search}${hash} script`)
    if (added.length) {
      assert.equal(added[0].id, RESTORING)
      // A full plan hides the page's head too; results and the timeline keep it.
      assert.equal(added[0].textContent.includes(':not(.roadmap-head)'), first !== 'plan', `${search}${hash} style`)
    }
  }
})

test("the Roadmap's wait ends a few seconds after the load if the page's script never shows the view", () => {
  const { added, load } = runScript([], '?state=done', '')
  assert.equal(added[0].removed, undefined)
  load()
  assert.equal(added[0].removed, true)
})

test('the page script holds the anchors as data, never as markup', () => {
  const script = restoringScript(['a</script><script>alert(1)</script>'])
  assert.ok(!script.includes('</script>'))
  assert.equal(runScript(['a</script>'], '', `#${encodeURIComponent('a</script>')}`).added.length, 1)
})
