import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import { site } from '../site.config'
import { renderDocument } from '../lib/markdown'
import { loadVersion } from '../lib/site'

// A snapshot with two translated documents (PLAN, STEPS), an English-only guide, a Chinese-only
// note and the repository README at its overview route.
const root = mkdtempSync(path.join(tmpdir(), 'docs-links-'))
const entry = (id: string, file: string, title: string, lang: string, route: string, group = '') =>
  `  - {id: ${id}, path: ${file}, title: ${title}, type: guide, lang: ${lang}, route: ${route}, section: main, order: 1, ` +
  `visibility: public, status: current, applies_to: snapshot${group && `, translation_group: ${group}`}}`
const files: Record<string, string> = {
  'docs/manifest.yaml': [
    'schema: 1',
    'repository: test',
    'sections:',
    '  - {id: main, title: Main}',
    'documents:',
    entry('guide', 'docs/guide.md', 'Guide', 'en', '/guide'),
    entry('plan', 'docs/PLAN.md', 'Plan', 'en', '/plan', 'plan'),
    entry('plan-zh', 'docs/PLAN-zh.md', '计划', 'zh-CN', '/plan', 'plan'),
    entry('notes', 'docs/notes-zh.md', '笔记', 'zh-CN', '/notes'),
    entry('steps', 'docs/STEPS.md', 'Steps', 'en', '/steps', 'steps'),
    entry('steps-zh', 'docs/STEPS-zh.md', '步骤', 'zh-CN', '/steps', 'steps'),
    entry('home', 'README.md', 'Overview', 'en', '/overview'),
    entry('odd-zh', 'docs/odd-zh.md', '另一结构', 'zh-CN', '/odd', 'odd'),
    entry('odd', 'docs/odd.md', 'Odd', 'en', '/odd', 'odd'),
    '',
  ].join('\n'),
  'docs/guide.md': '# Guide\n\n## Intro\n\nSee the [plan](PLAN.md#goal) and [two](odd.md#two).\n',
  'docs/PLAN.md': '# Plan\n\n[中文](PLAN-zh.md)\n\n## Goal\n\nRead the [guide](guide.md#intro).\n',
  'docs/PLAN-zh.md': '# 计划\n\n[English](PLAN.md#goal)\n\n## 目标\n\n阅读[指南](guide.md#intro)。\n',
  'docs/notes-zh.md': '# 笔记\n\n见[计划](PLAN-zh.md)。另见[计划目标](PLAN.md#goal)。\n',
  'docs/STEPS.md': '# Steps\n\n[中文](STEPS-zh.md)\n\nFollow the [plan](PLAN.md#goal) and the [plugins](../README.md#plugins).\n',
  'docs/STEPS-zh.md': '# 步骤\n\n[English](STEPS.md)\n\n按[路线图](PLAN.md#goal)执行，见[插件](../README.md#plugins)。\n',
  'README.md': '# Project\n\n## Plugins\n\nText.\n',
  'docs/odd.md': '# Odd\n\n## One\n\n## Two\n',
  'docs/odd-zh.md': '# 另一结构\n\n## 一\n',
}
for (const [file, body] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), body)
}
const v = loadVersion({ id: 't', label: 't', ref: 'main', sha: '0'.repeat(40), committed: '', root })
const doc = (file: string) => v.docs.get(file)!

function htmlLinks(tree: Root): string[] {
  const out: string[] = []
  visit(tree, 'element', (node: Element) => {
    if (node.tagName === 'a') out.push(decodeURI(String(node.properties.href)))
  })
  return out
}
const mdLinks = (markdown: string) => [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1].replace(site.url, ''))

test('a link to another language of a translated document keeps that language', () => {
  const en = renderDocument(v, doc('docs/PLAN.md'), 'en')
  assert.equal(htmlLinks(en.hast)[0], '/zh-CN/t/plan/')
  assert.equal(mdLinks(en.markdown)[0], '/zh-CN/t/plan.md')

  const zh = renderDocument(v, doc('docs/PLAN-zh.md'), 'zh-CN')
  assert.equal(htmlLinks(zh.hast)[0], '/en/t/plan/#goal')
  assert.equal(mdLinks(zh.markdown)[0], '/en/t/plan.md#goal')
})

test('other document links follow the language being read', () => {
  // Chinese reader, English-only target: the Chinese page of the guide (an explicit fallback).
  const zh = renderDocument(v, doc('docs/PLAN-zh.md'), 'zh-CN')
  assert.equal(htmlLinks(zh.hast)[1], '/zh-CN/t/guide/#intro')
  assert.equal(mdLinks(zh.markdown)[1], '/en/t/guide.md#intro')

  // An English document read under zh-CN links the Chinese page of PLAN, at the heading in the
  // same position as the one it names; its .md stays English.
  const guide = renderDocument(v, doc('docs/guide.md'), 'zh-CN')
  assert.equal(htmlLinks(guide.hast)[0], '/zh-CN/t/plan/#目标')
  assert.equal(mdLinks(guide.markdown)[0], '/en/t/plan.md#goal')

  // A Chinese-only document linking the Chinese PLAN, read in English: the English PLAN page.
  const notes = renderDocument(v, doc('docs/notes-zh.md'), 'en')
  assert.equal(htmlLinks(notes.hast)[0], '/en/t/plan/')
  assert.equal(mdLinks(notes.markdown)[0], '/zh-CN/t/plan.md')
})

test('a Chinese document linking the English file of a translated document stays in Chinese', () => {
  // STEPS-zh is itself a translation and names PLAN.md, the English default file, for an ordinary
  // reference (as AGENTS-zh.md names docs/ROADMAP.md): the Chinese PLAN, never the English one.
  const steps = renderDocument(v, doc('docs/STEPS-zh.md'), 'zh-CN')
  assert.deepEqual(htmlLinks(steps.hast).slice(0, 2), ['/en/t/steps/', '/zh-CN/t/plan/#目标'])
  assert.deepEqual(mdLinks(steps.markdown).slice(0, 2), ['/en/t/steps.md', '/zh-CN/t/plan.md#目标'])

  // The same from a Chinese-only document.
  const notes = renderDocument(v, doc('docs/notes-zh.md'), 'zh-CN')
  assert.equal(htmlLinks(notes.hast)[1], '/zh-CN/t/plan/#目标')
  assert.equal(mdLinks(notes.markdown)[1], '/zh-CN/t/plan.md#目标')
  assert.deepEqual(steps.problems, [])
})

test('links to the README and its sections lead to its overview page, not the home page', () => {
  for (const [file, locale] of [['docs/STEPS.md', 'en'], ['docs/STEPS-zh.md', 'zh-CN']] as const) {
    const r = renderDocument(v, doc(file), locale)
    assert.equal(htmlLinks(r.hast).at(-1), `/${locale}/t/overview/#plugins`)
    assert.equal(mdLinks(r.markdown).at(-1), '/en/t/overview.md#plugins')
  }
})

test('an anchor a translation cannot match is reported', () => {
  // odd-zh.md has fewer headings than odd.md: read in Chinese, the guide's #two has no place.
  assert.deepEqual(renderDocument(v, doc('docs/guide.md'), 'en').problems, [])
  const guide = renderDocument(v, doc('docs/guide.md'), 'zh-CN')
  assert.deepEqual(guide.problems, ['docs/guide.md: odd.md#two: docs/odd-zh.md has no anchor for #two'])
})

test('no document may take the home page route', () => {
  const bad = mkdtempSync(path.join(tmpdir(), 'docs-home-'))
  mkdirSync(path.join(bad, 'docs'))
  writeFileSync(path.join(bad, 'README.md'), '# Project\n')
  writeFileSync(
    path.join(bad, 'docs/manifest.yaml'),
    ['schema: 1', 'repository: test', 'sections:', '  - {id: main, title: Main}', 'documents:', entry('home', 'README.md', 'Home', 'en', '/'), ''].join('\n'),
  )
  assert.throws(() => loadVersion({ id: 't', label: 't', ref: 'main', sha: '0'.repeat(40), committed: '', root: bad }), /route \/, which is the site's home page/)
})
