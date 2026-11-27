import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, Fragment } from 'react'
import { renderToString } from 'react-dom/server'
import { NavTree, type NavSectionData } from '../components/navigation'

// Reference → Plugin reference → Foundation → Voice, as the Figma three-level navigation has it.
const section: NavSectionData = {
  id: 'reference',
  title: 'Reference',
  href: '/en/v/reference/',
  groups: [
    { id: 'cli-reference', title: 'CLI reference', items: [{ key: 'setup', title: 'setup', href: '/en/v/cli/setup/' }], groups: [] },
    {
      id: 'plugin-reference',
      title: 'Plugin reference',
      items: [{ key: 'plugins', title: 'Plugin layout and boundaries', href: '/en/v/plugins/' }],
      groups: [
        { id: 'foundation', title: 'Foundation', items: [{ key: 'voice', title: 'Voice', href: '/en/v/plugins/voice/' }], groups: [] },
        { id: 'tools', title: 'Tools', items: [{ key: 'mcp', title: 'MCP', href: '/en/v/plugins/mcp/' }], groups: [] },
      ],
    },
  ],
}

const lists = (html: string) => Object.fromEntries([...html.matchAll(/<ul id="[^"]*nav-([^"]+)" class="nav-list"( hidden="")?/g)].map((m) => [m[1], !m[2]]))

test('two navigation trees on one page have unique list ids, each controlled by its own button', () => {
  const tree = createElement(NavTree, { section, current: 'setup', memory: 'v:en' })
  const html = renderToString(createElement(Fragment, null, tree, tree))
  const ids = [...html.matchAll(/<ul id="([^"]+)"/g)].map((m) => m[1])
  const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1])
  assert.equal(ids.length, 8)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(controls, ids)
})

test('a page opens its ancestors, three levels deep, and is the current item', () => {
  const html = renderToString(createElement(NavTree, { section, current: 'voice', memory: 'v:en' }))
  assert.deepEqual(lists(html), { 'cli-reference': false, 'plugin-reference': true, foundation: true, tools: false })
  assert.match(html, /<li class="nav-group" data-level="2"><button type="button" class="nav-group-head" aria-expanded="true"[^>]*>.*?Foundation/)
  assert.equal(html.match(/aria-current="page"/g)?.length, 1)
  assert.match(html, /href="\/en\/v\/plugins\/voice\/" aria-current="page"/)
})

test('a section entry page opens nothing but a lone group', () => {
  assert.deepEqual(Object.values(lists(renderToString(createElement(NavTree, { section, current: 'section:reference', memory: 'v:en' })))), [false, false, false, false])
  const lone = { ...section, groups: [section.groups[0]] }
  assert.deepEqual(lists(renderToString(createElement(NavTree, { section: lone, current: 'section:reference', memory: 'v:en' }))), { 'cli-reference': true })
})
