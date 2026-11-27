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
