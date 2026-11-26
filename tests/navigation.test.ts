import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, Fragment } from 'react'
import { renderToString } from 'react-dom/server'
import { NavTree, type NavGroupData } from '../components/navigation'

test('two navigation trees on one page have unique list ids, each controlled by its own button', () => {
  const groups: NavGroupData[] = [
    { id: 'cli', title: 'Commands', items: [{ key: 'setup', title: 'setup', href: '/en/v/cli/setup/' }] },
    { id: 'plugins', title: 'Plugins', items: [{ key: 'voice', title: 'Voice', href: '/en/v/plugins/voice/' }] },
  ]
  const tree = createElement(NavTree, { groups, current: 'setup', locale: 'en' })
  const html = renderToString(createElement(Fragment, null, tree, tree))

  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
  const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1])
  assert.equal(ids.length, 4)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(controls, ids)
})
