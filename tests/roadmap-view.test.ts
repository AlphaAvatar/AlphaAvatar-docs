import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { anchorOf } from '../components/navigation'
import { planFor } from '../components/timeline'
import { isFiltered, parseView, RESTORING, restores, restoringScript, results, sameFilters, SLOW, statusCounts, viewSearch } from '../lib/roadmap-view'

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
type Style = { id: string; textContent: string; isConnected: boolean; whole?: boolean; remove(): void; setAttribute(name: string): void }
function runScript(plans: string[], search: string, hash: string) {
  const added: Style[] = []
  const onLoad: (() => void)[] = []
  const onClick: ((e: { target: unknown }) => void)[] = []
  const timers: { run: () => void; ms: number }[] = []
  const scrolled: [string, unknown][] = []
  let reloads = 0
  const document = {
    createElement: (): Style => ({
      id: '',
      textContent: '',
      isConnected: false,
      remove() {
        this.isConnected = false
      },
      setAttribute(name: string) {
        if (name === 'data-whole') this.whole = true
      },
    }),
    head: { appendChild: (e: Style) => (added.push(e), (e.isConnected = true)) },
    addEventListener: (type: string, run: (e: { target: unknown }) => void) => type === 'click' && onClick.push(run),
    getElementById: (id: string) => ({ scrollIntoView: (how: unknown) => scrolled.push([id, how]) }),
  }
  runInNewContext(restoringScript(plans), {
    location: { search, hash, reload: () => reloads++ },
    document,
    URLSearchParams,
    decodeURIComponent,
    addEventListener: (type: string, run: () => void) => type === 'load' && onLoad.push(run),
    setTimeout: (run: () => void, ms: number) => timers.push({ run, ms }),
  })
  // A click inside a button whose data-wait is `wait`, or outside any.
  const click = (wait?: string) => {
    const button = wait ? { getAttribute: (name: string) => (name === 'data-wait' ? wait : null) } : null
    for (const run of onClick) run({ target: { closest: (selector: string) => (selector === '[data-wait]' ? button : null) } })
  }
  const after = (ms: number) => timers.filter((t) => t.ms === ms).forEach((t) => t.run())
  return { added, load: () => onLoad.forEach((run) => run()), after, click, scrolled, reloads: () => reloads }
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

test('a slow view is said so, with or without the load, and offers a reload or the whole Roadmap, never the page as written', () => {
  const hides = (css: string) => css.includes('.rm>:not(.rm-wait):not(.roadmap-head){display:none!important}')
  const notice = '.rm-slow{display:block!important}'

  // No load at all, as when a script never arrives: the wait's own timer.
  const stuck = runScript([], '?state=done', '')
  const style = stuck.added[0]
  stuck.after(SLOW.wait)
  assert.ok(style.isConnected && hides(style.textContent) && style.textContent.includes(notice))
  stuck.click()
  stuck.click('retry')
  assert.equal(stuck.reloads(), 1)
  stuck.click('whole')
  assert.ok(style.whole && !hides(style.textContent) && style.textContent.includes('.rm-wait,.rm .js-only{display:none!important}'))
  stuck.load()
  stuck.after(SLOW.load)
  assert.ok(!hides(style.textContent), 'the whole Roadmap stays once chosen')

  // Loaded, but the view does not open: sooner. The whole Roadmap goes to a plan's anchor.
  const loaded = runScript(['v0-6-8'], '', '#v0-6-8')
  loaded.load()
  loaded.after(SLOW.load)
  assert.ok(loaded.added[0].textContent.includes(notice))
  loaded.click('whole')
  assert.equal(JSON.stringify(loaded.scrolled), '[["v0-6-8",{"behavior":"instant"}]]')

  // Once the Timeline shows the view, neither the timers nor the buttons do anything.
  const opened = runScript([], '?expanded=v0.6.8', '')
  const shown = opened.added[0]
  const text = shown.textContent
  shown.remove()
  opened.load()
  opened.after(SLOW.load)
  opened.after(SLOW.wait)
  opened.click('retry')
  opened.click('whole')
  assert.ok(shown.textContent === text && !shown.whole)
  assert.equal(opened.reloads(), 0)

  // The stylesheet hides nothing once the style is marked, and without :has() offers no whole Roadmap.
  const css = readFileSync('app/styles.css', 'utf8')
  assert.ok(css.includes(`:root:not(:has(> head > #${RESTORING}[data-whole])) .rm [data-off] {\n    display: none !important;`))
  assert.match(css, /@supports not selector\(:has\(\*\)\) \{\s*@media \(scripting: enabled\) \{\s*\.rm \[data-off\] \{\s*display: none !important;\s*\}\s*\}\s*\[data-wait='whole'\] \{\s*display: none !important;/)
})

test('the page script holds the anchors as data, never as markup', () => {
  const script = restoringScript(['a</script><script>alert(1)</script>'])
  assert.ok(!script.includes('</script>'))
  assert.equal(runScript(['a</script>'], '', `#${encodeURIComponent('a</script>')}`).added.length, 1)
})
