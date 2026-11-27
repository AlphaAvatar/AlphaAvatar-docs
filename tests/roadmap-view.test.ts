import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFiltered, parseView, results, sameFilters, statusCounts, viewSearch } from '../lib/roadmap-view'

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
