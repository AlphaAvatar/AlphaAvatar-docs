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

// A snapshot with one translated document (PLAN), one English-only and one Chinese-only document.
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
    '',
  ].join('\n'),
  'docs/guide.md': '# Guide\n\n## Intro\n\nSee the [plan](PLAN.md#goal).\n',
  'docs/PLAN.md': '# Plan\n\n[中文](PLAN-zh.md)\n\n## Goal\n\nRead the [guide](guide.md#intro).\n',
  'docs/PLAN-zh.md': '# 计划\n\n[English](PLAN.md#goal)\n\n## 目标\n\n阅读[指南](guide.md#intro)。\n',
  'docs/notes-zh.md': '# 笔记\n\n见[计划](PLAN-zh.md)。\n',
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
    if (node.tagName === 'a') out.push(String(node.properties.href))
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

  // An English document read under zh-CN links the Chinese page of PLAN; its .md stays English.
  const guide = renderDocument(v, doc('docs/guide.md'), 'zh-CN')
  assert.equal(htmlLinks(guide.hast)[0], '/zh-CN/t/plan/#goal')
  assert.equal(mdLinks(guide.markdown)[0], '/en/t/plan.md#goal')

  // A Chinese-only document linking the Chinese PLAN, read in English: the English PLAN page.
  const notes = renderDocument(v, doc('docs/notes-zh.md'), 'en')
  assert.equal(htmlLinks(notes.hast)[0], '/en/t/plan/')
  assert.equal(mdLinks(notes.markdown)[0], '/zh-CN/t/plan.md')
})
