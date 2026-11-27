import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { site } from '../site.config'
import { homeMarkdown, homeModel } from '../lib/home'
import { loadVersion, markdownHref, pageOf, type Version } from '../lib/site'

// A snapshot holding what the home page points at: identifiers only in Chinese, Doctor only in
// English, the Roadmap in both.
function snapshot(without = ''): Version {
  const sections = ['get-started', 'cli', 'development', 'reference', 'roadmap', 'releases']
  const root = mkdtempSync(path.join(tmpdir(), 'docs-home-'))
  const entry = (id: string, file: string, lang: string, route: string, section: string, extra = '') =>
    `  - {id: ${id}, path: ${file}, title: T-${id}, type: guide, lang: ${lang}, route: ${route}, section: ${section}, order: 1, ` +
    `visibility: public, status: current, applies_to: snapshot${extra}}`
  const docs = [
    entry('quickstart', 'docs/quickstart.md', 'en', '/get-started/quickstart', 'get-started'),
    entry('cli', 'docs/cli/README.md', 'en', '/cli', 'cli'),
    entry('cli-doctor', 'docs/cli/doctor.md', 'en', '/cli/doctor', 'cli'),
    entry('contributing', 'CONTRIBUTING.md', 'en', '/development/contributing', 'development'),
    entry('identifiers', 'docs/identifiers-zh.md', 'zh-CN', '/reference/identifiers', 'reference'),
    entry('roadmap', 'docs/ROADMAP.md', 'en', '/roadmap', 'roadmap', ', translation_group: roadmap'),
    entry('roadmap-zh', 'docs/ROADMAP-zh.md', 'zh-CN', '/roadmap', 'roadmap', ', translation_group: roadmap'),
    entry('release-v1', 'docs/releases/v1.md', 'en', '/releases/v1', 'releases', ', release: {tag: v1.0.0, published: 2026-01-02}'),
  ].filter((d) => !d.includes(`id: ${without},`))
  const manifest = ['schema: 1', 'repository: test', 'sections:', ...sections.map((s) => `  - {id: ${s}, title: {en: S-${s}, zh-CN: 区-${s}}}`), 'documents:', ...docs, '']
  mkdirSync(path.join(root, 'docs/cli'), { recursive: true })
  mkdirSync(path.join(root, 'docs/releases'))
  writeFileSync(path.join(root, 'docs/manifest.yaml'), manifest.join('\n'))
  for (const d of docs) writeFileSync(path.join(root, d.match(/path: ([^,]+)/)![1]), '# Title\n')
  return loadVersion({ id: 't', label: 't', ref: 'main', sha: '0'.repeat(40), committed: '', root })
}

test('every home entry is a page of the snapshot, and index.md links the same entries', () => {
  const v = snapshot()
  for (const locale of v.locales) {
    const m = homeModel(v, locale)
    const links = [...m.actions, m.release!, ...m.directions, ...m.featured, ...m.resources]
    const markdown = homeMarkdown(m)
    const markdownFiles = [...v.docs.values()].map((d) => site.url + markdownHref(v.id, d))
    for (const l of links) {
      if (l.href.startsWith('https://')) {
        assert.equal(l.md, l.href)
      } else {
        const route = l.href.replace(`/${locale}/t`, '').replace(/\/$/, '') || '/'
        assert.ok(pageOf(v, locale, route), `${locale}: ${l.href} is a page`)
        assert.ok(markdownFiles.includes(l.md) || l.md === site.url + l.href, `${locale}: ${l.md} is a generated file or the page`)
      }
      assert.ok(markdown.includes(`](${l.md})`), `${locale}: index.md links ${l.md}`)
    }
    assert.equal(m.release!.href, `/${locale}/t/releases/v1/`)
    assert.equal(m.directions[0].title, locale === 'en' ? 'S-get-started' : '区-get-started')
  }
})

test('a featured article names its language only when it is shown in another one', () => {
  const v = snapshot()
  const [doctorEn, identifiersEn] = homeModel(v, 'en').featured
  const [doctorZh, identifiersZh] = homeModel(v, 'zh-CN').featured
  assert.equal(doctorEn.original, undefined)
  assert.equal(identifiersEn.original, 'Source language · 简体中文')
  assert.equal(doctorZh.original, '原文语言 · English')
  assert.equal(identifiersZh.original, undefined)
})

test('a home entry whose section is not published fails instead of being replaced', () => {
  // The reference section's only document is gone, so the section is not published.
  const v = snapshot('identifiers')
  assert.throws(() => homeModel(v, 'en'), /section reference is not published/)
})
