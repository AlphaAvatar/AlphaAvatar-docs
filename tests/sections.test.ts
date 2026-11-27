import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Shell } from '../components/shell'
import { editHref, nav, neighbours, pageOf, repoHref, sectionOf, type DocPage, type Version } from '../lib/site'
import { entry, load, snapshot, writeSnapshot } from './fixture'

// Three sections; Reference has a group with two groups of its own; Updates a release group.
const SECTIONS = [
  '  - id: guide',
  '    title: {en: Guide, zh-CN: 指南}',
  '    summary: {en: Start., zh-CN: 开始。}',
  '    groups:',
  '      - {id: start, title: {en: Get started, zh-CN: 开始使用}}',
  '  - id: reference',
  '    title: {en: Reference, zh-CN: 参考}',
  '    summary: {en: Look up., zh-CN: 查阅。}',
  '    groups:',
  '      - {id: commands, title: {en: CLI reference, zh-CN: CLI 参考}}',
  '      - id: plugin-reference',
  '        title: {en: Plugin reference, zh-CN: 插件参考}',
  '        groups:',
  '          - {id: foundation, title: Foundation}',
  '          - {id: tools, title: Tools}',
  '  - id: updates',
  '    title: {en: Updates, zh-CN: 项目进展}',
  '    summary: {en: Progress., zh-CN: 进展。}',
  '    groups:',
  '      - {id: releases, title: {en: Release notes, zh-CN: 发布记录}}',
]
const release = (n: number) => `, release: {tag: v0.${n}.0, published: 2026-0${n}-01}`
const DOCS = [
  entry('tools-mcp', 'docs/mcp.md', 'MCP', 'en', '/plugins/mcp', '', 'tools'),
  entry('voice', 'docs/voice.md', 'Voice', 'en', '/plugins/voice', '', 'foundation'),
  entry('plugins', 'docs/plugins.md', 'Plugins', 'en', '/plugins', '', 'plugin-reference'),
  entry('cli-start', 'docs/start.md', 'start', 'en', '/cli/start', '', 'commands', 2),
  entry('cli', 'docs/cli.md', 'Commands', 'en', '/cli', '', 'commands', 1),
  entry('quickstart', 'docs/quickstart.md', 'Quick start', 'en', '/quickstart', '', 'start'),
  entry('r1', 'docs/r1.md', 'v0.1.0', 'en', '/releases/v0.1.0', release(1), 'releases', 2),
  entry('r2', 'docs/r2.md', 'v0.2.0', 'en', '/releases/v0.2.0', release(2), 'releases', 1),
]
const FILES = Object.fromEntries(DOCS.map((d) => [d.match(/path: ([^,]+)/)![1], '# Title\n\n## Part\n']))
const v = snapshot(FILES, DOCS, SECTIONS)
const doc = (v: Version, route: string) => pageOf(v, 'en', route) as DocPage

test('a document belongs to its group, its group to a section, in the manifest order', () => {
  const voice = doc(v, '/plugins/voice')
  assert.deepEqual([voice.section.id, voice.groups.map((g) => g.id)], ['reference', ['plugin-reference', 'foundation']])
  // A group's documents come before its own groups; documents by order.
  const reference = nav(v, 'en').find((s) => s.section.id === 'reference')!
  const order = (n: (typeof reference.groups)[number]): string[] => [...n.pages.map((p) => p.doc.id), ...n.groups.flatMap(order)]
  assert.deepEqual(reference.groups.flatMap(order), ['cli', 'cli-start', 'plugins', 'voice', 'tools-mcp'])
})

test('every page, generated ones too, names its section; the home page none', () => {
  const sections = Object.fromEntries((v.pages.get('en') ?? []).map((p) => [p.route, sectionOf(p)?.id]))
  assert.deepEqual(sections, {
    '/': undefined,
    '/plugins/mcp': 'reference',
    '/plugins/voice': 'reference',
    '/plugins': 'reference',
    '/cli/start': 'reference',
    '/cli': 'reference',
    '/quickstart': 'guide',
    '/releases/v0.1.0': 'updates',
    '/releases/v0.2.0': 'updates',
    '/guide': 'guide',
    '/reference': 'reference',
    '/updates': 'updates',
    '/releases': 'updates',
  })
  const index = pageOf(v, 'en', '/releases')!
  assert.equal(index.kind, 'releases')
  assert.deepEqual(index.kind === 'releases' && index.pages.map((p) => p.doc.id), ['r2', 'r1'])
})

test('previous and next stay within the section', () => {
  const ids = (route: string) => {
    const n = neighbours(v, doc(v, route))
    return [n.previous?.doc.id, n.next?.doc.id]
  }
  assert.deepEqual(ids('/cli'), [undefined, 'cli-start'])
  assert.deepEqual(ids('/plugins'), ['cli-start', 'voice'])
  assert.deepEqual(ids('/plugins/mcp'), ['voice', undefined])
  assert.deepEqual(ids('/quickstart'), [undefined, undefined])
})

test('a document in an unknown group fails the build', () => {
  const root = writeSnapshot({ 'docs/a.md': '# A\n' }, [entry('a', 'docs/a.md', 'A', 'en', '/a', '', 'nowhere')], SECTIONS)
  assert.throws(() => load(root), /a is in unknown group nowhere/)
})

test('the header marks the page’s section and the rail holds that section’s tree only', () => {
  for (const [route, section] of [['/plugins/voice', 'Reference'], ['/reference', 'Reference'], ['/releases', 'Updates']] as const) {
    const page = pageOf(v, 'en', route)!
    const html = renderToString(createElement(Shell, { v, page, entries: [] }, null))
    const header = html.match(/<nav class="header-nav"[^>]*>(.*?)<\/nav>/)![1]
    assert.deepEqual([...header.matchAll(/aria-current="(?:true|page)">([^<]+)</g)].map((m) => m[1]), [section], route)
    const rail = html.match(/<nav class="rail"[^>]*>(.*?)<\/nav>/)![1]
    assert.ok(rail.includes(`>${section}</a>`), route)
    for (const other of ['Get started', 'CLI reference', 'Release notes']) {
      assert.equal(rail.includes(`>${other}<`), (section === 'Reference' && other === 'CLI reference') || (section === 'Updates' && other === 'Release notes'), `${route}: ${other}`)
    }
  }
})

test('edit links follow the version’s editRef; source links stay at the snapshot', () => {
  const root = writeSnapshot(FILES, DOCS, SECTIONS)
  assert.deepEqual(editHref(load(root, 't', 'dev/v9'), 'docs/a.md'), {
    href: 'https://github.com/AlphaAvatar/AlphaAvatar/edit/dev/v9/docs/a.md',
    branch: 'dev/v9',
  })
  assert.equal(editHref(load(root), 'docs/a.md'), undefined)
  assert.equal(repoHref(v.source.sha, 'docs/a.md'), `https://github.com/AlphaAvatar/AlphaAvatar/blob/${'0'.repeat(40)}/docs/a.md`)
})
