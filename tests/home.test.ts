import assert from 'node:assert/strict'
import { test } from 'node:test'
import { site } from '../site.config'
import { homeMarkdown, homeModel } from '../lib/home'
import { markdownHref, pageOf, type Version } from '../lib/site'
import { entry, snapshot as write } from './fixture'

// A snapshot holding what the home page points at, in the four sections: identifiers only in
// Chinese, Doctor only in English, the Roadmap in both, one release.
function snapshot(...without: string[]): Version {
  const group = (section: string, groups: string[]) => [
    `  - id: ${section}`,
    `    title: {en: S-${section}, zh-CN: 区-${section}}`,
    `    summary: {en: About ${section}, zh-CN: 关于 ${section}}`,
    '    groups:',
    ...groups.map((g) => `      - {id: ${g}, title: {en: G-${g}, zh-CN: 组-${g}}}`),
  ]
  const sections = [
    ...group('guide', ['get-started']),
    ...group('development', ['contribute']),
    ...group('reference', ['cli-reference', 'identifiers']),
    ...group('updates', ['planning', 'releases']),
  ]
  const docs = [
    entry('quickstart', 'docs/quickstart.md', 'T-quickstart', 'en', '/get-started/quickstart', '', 'get-started'),
    entry('cli', 'docs/cli/README.md', 'T-cli', 'en', '/cli', '', 'cli-reference'),
    entry('cli-doctor', 'docs/cli/doctor.md', 'T-cli-doctor', 'en', '/cli/doctor', '', 'cli-reference', 2),
    entry('contributing', 'CONTRIBUTING.md', 'T-contributing', 'en', '/development/contributing', '', 'contribute'),
    entry('identifiers', 'docs/identifiers-zh.md', 'T-identifiers', 'zh-CN', '/reference/identifiers', '', 'identifiers'),
    entry('roadmap', 'docs/ROADMAP.md', 'T-roadmap', 'en', '/roadmap', ', translation_group: roadmap', 'planning'),
    entry('roadmap-zh', 'docs/ROADMAP-zh.md', 'T-roadmap-zh', 'zh-CN', '/roadmap', ', translation_group: roadmap', 'planning'),
    entry('release-v1', 'docs/releases/v1.md', 'T-release-v1', 'en', '/releases/v1', ', release: {tag: v1.0.0, published: 2026-01-02}', 'releases'),
  ].filter((d) => !without.some((id) => d.includes(`id: ${id},`)))
  return write(Object.fromEntries(docs.map((d) => [d.match(/path: ([^,]+)/)![1], '# Title\n'])), docs, sections)
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
    assert.equal(m.directions[0].title, locale === 'en' ? 'S-guide' : '区-guide')
    assert.equal(m.resources[2].href, `/${locale}/t/releases/`)
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

test('a home entry whose section or document is not published fails instead of being replaced', () => {
  assert.throws(() => homeModel(snapshot('contributing'), 'en'), /section development is not published/)
  assert.throws(() => homeModel(snapshot('identifiers'), 'en'), /document identifiers is not published/)
})
