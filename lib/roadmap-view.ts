// What the Roadmap page shows, as its URL holds it: three independent filters combined (an item
// must meet each one set), the milestones expanded on the timeline, and the item whose details
// are open. A full plan is chosen by the URL's anchor instead (see components/timeline.tsx).

export type Filters = { milestone?: string; area?: string; state?: string }
export type View = Filters & { expanded: string[]; item?: string }

export const FILTERS = ['milestone', 'area', 'state'] as const

export function parseView(search: string): View {
  const q = new URLSearchParams(search)
  const value = (key: string) => q.get(key) || undefined
  return { milestone: value('milestone'), area: value('area'), state: value('state'), expanded: q.getAll('expanded'), item: value('item') }
}

// `?…` in a fixed order, or '' for the default view.
export function viewSearch(view: View): string {
  const q = new URLSearchParams()
  for (const key of FILTERS) if (view[key]) q.set(key, view[key]!)
  for (const id of view.expanded) q.append('expanded', id)
  if (view.item) q.set('item', view.item)
  const search = q.toString()
  return search && `?${search}`
}

export const isFiltered = (f: Filters) => FILTERS.some((key) => !!f[key])

export const sameFilters = (a: Filters, b: Filters) => FILTERS.every((key) => (a[key] ?? '') === (b[key] ?? ''))

type Matchable = { area: string; status: string }

export const matches = (milestone: string, item: Matchable, f: Filters) =>
  (!f.milestone || milestone === f.milestone) && (!f.area || item.area === f.area) && (!f.state || item.status === f.state)

// The items meeting every filter, milestone by milestone in the order given.
export function results<M extends { id: string; items: Matchable[] }>(milestones: M[], f: Filters): { milestone: M; item: M['items'][number] }[] {
  return milestones.flatMap((milestone) => milestone.items.filter((item) => matches(milestone.id, item, f)).map((item) => ({ milestone, item })))
}

// How many items have each status, in `order`, leaving out the statuses no item has.
export function statusCounts(items: Matchable[], order: readonly string[]): [string, number][] {
  return order.map((s) => [s, items.filter((i) => i.status === s).length] as [string, number]).filter(([, n]) => n)
}

// The page is written as the timeline, no milestone expanded. Where the URL asks for another view
// (filters, an expanded milestone, a full plan's anchor), the Roadmap waits behind its placeholder,
// of one steady size, until the page's script shows that view: `restoringScript`, run before the
// Roadmap is read, adds the style RESTORING, and the Timeline removes it. Without JavaScript
// nothing waits; if the page's script never runs, the style goes a few seconds after the load.
export const RESTORING = 'rm-restoring'

export function restores(search: string, anchor: string, plans: readonly string[]): boolean {
  const view = parseView(search)
  return isFiltered(view) || view.expanded.length > 0 || plans.includes(anchor)
}

// `restores`, for the browser to run as the page is read; `plans` are the anchors of full plans.
export function restoringScript(plans: readonly string[]): string {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
  const hide = (kept: string) => `.rm>:not(.rm-wait)${kept}{display:none!important}.rm-wait{display:flex!important}`
  return (
    `(function(){try{var q=new URLSearchParams(location.search),a='';` +
    `try{a=decodeURIComponent(location.hash.replace(/^#/,''))}catch(e){}` +
    `var plan=${json(plans)}.indexOf(a)>=0;` +
    `if(!plan&&!${json(FILTERS)}.some(function(k){return q.get(k)})&&!q.getAll('expanded').length)return;` +
    `var s=document.createElement('style');s.id=${json(RESTORING)};` +
    `s.textContent=plan?${json(hide(''))}:${json(hide(':not(.roadmap-head)'))};document.head.appendChild(s);` +
    `addEventListener('load',function(){setTimeout(function(){s.remove()},3000)})}catch(e){}})()`
  )
}
