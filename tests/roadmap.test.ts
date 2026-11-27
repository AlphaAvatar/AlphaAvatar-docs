import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Root } from 'mdast'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { RoadmapArticle } from '../components/roadmap'
import { outline } from '../lib/markdown'
import { roadmapOf, type Milestone } from '../lib/roadmap'
import { loadVersion, pageOf, versions, type DocPage, type Version } from '../lib/site'

// A snapshot holding one Roadmap (docs/ROADMAP.md, route /roadmap) and a guide it links to.
function snapshot(id: string, roadmap: string): Version {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-roadmap-'))
  const entry = (id: string, file: string, type: string, route: string) =>
    `  - {id: ${id}, path: ${file}, title: ${id}, type: ${type}, lang: en, route: ${route}, section: main, order: 1, visibility: public, status: current, applies_to: snapshot}`
  mkdirSync(path.join(root, 'docs'))
  writeFileSync(
    path.join(root, 'docs/manifest.yaml'),
    ['schema: 1', 'repository: test', 'sections:', '  - {id: main, title: Main}', 'documents:', entry('roadmap', 'docs/ROADMAP.md', 'roadmap', '/roadmap'), entry('guide', 'docs/guide.md', 'guide', '/guide'), ''].join('\n'),
  )
  writeFileSync(path.join(root, 'docs/guide.md'), '# Guide\n')
  writeFileSync(path.join(root, 'docs/ROADMAP.md'), roadmap)
  return loadVersion({ id, label: id, ref: 'main', sha: '0'.repeat(40), committed: '', root })
}

const ITEMS = '| ID | Item | Status | Priority | Date | Notes |\n| --- | --- | --- | --- | --- | --- |'
const TIMELINE = '| Milestone | Version | Theme | Release | Released | Release notes |\n| --- | --- | --- | --- | --- | --- |'

const FIXTURE = `# Plan

[Guide](guide.md)

What the plan is.

## Goal

Build it.

## Timeline

${TIMELINE}
| [\`earlier\`](#earlier) | v0.1.0–v0.2.0 | Before | released | 2025-01-02 – 2025-03-04 | Not verified |
| [\`v1.0.0\`](#v1.0.0) | v1.0.0 | Next | in-development | — | — |
| [\`backlog\`](#backlog) | — | Later | unscheduled | — | — |

## Upcoming

<a id="v1.0.0"></a>
### v1.0.0 · Next

- **Release:** in-development
- **Open:** which way.

${ITEMS}
| \`CFG-01\` | **One configuration** — The same in every client. | planned | — | — | See the [guide](guide.md) |
| \`DOC-01\` | Docs without a title. | in-progress | 🔸 | 2026-11 | — |

## Released

<a id="earlier"></a>
### Through v0.2.0

- **Release:** released

#### Core

${ITEMS}
| \`CORE-01\` | **Model** — Added. | done | — | 2025-02 | — |

#### Memory

${ITEMS}
| \`MEM-01\` | **Store** — Added. | done | 🔹 | 2025-03-01 | — |

## Long-term

<a id="backlog"></a>
### Unscheduled

${ITEMS}
| \`RFL-01\` | Reflection. | proposed | — | — | — |

## Planning notes

<a id="pn-next"></a>
### Next proposal

Not current behavior.
`

const ids = (m: Milestone) => m.areas.flatMap((a) => a.items.map((i) => i.id))
const page = (v: Version, locale: string) => pageOf(v, locale, '/roadmap') as DocPage

test('milestones follow the Timeline, items their milestone and area', () => {
  const v = snapshot('fixture', FIXTURE)
  const r = roadmapOf(v, v.docs.get('docs/ROADMAP.md')!, 'en')
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.title, { depth: 1, id: 'plan', text: 'Plan' })
  assert.deepEqual(
    r.milestones.map((m) => [m.id, m.label, m.version, m.release, m.released]),
    [
      ['earlier', 'Through v0.2.0', 'v0.1.0–v0.2.0', 'released', '2025-01-02 – 2025-03-04'],
      ['v1.0.0', 'v1.0.0', 'v1.0.0', 'in-development', undefined],
      ['backlog', 'Unscheduled', undefined, 'unscheduled', undefined],
    ],
  )
  const [earlier, next, backlog] = r.milestones
  assert.deepEqual(earlier.areas.map((a) => [a.heading?.text, a.items.map((i) => i.id)]), [['Core', ['CORE-01']], ['Memory', ['MEM-01']]])
  assert.deepEqual(ids(next), ['CFG-01', 'DOC-01'])
  assert.deepEqual(ids(backlog), ['RFL-01'])

  const [config, docs] = next.areas[0].items
  assert.deepEqual([config.area, config.status, config.priority, config.date], ['CFG', 'planned', undefined, undefined])
  assert.deepEqual([docs.status, docs.priority, docs.date, docs.text, docs.notes], ['in-progress', '🔸', '2026-11', undefined, undefined])
  assert.equal(earlier.areas[1].items[0].date, '2025-03-01')
  // A bold lead is the title; the notes keep their links, resolved like the rest of the page.
  assert.match(JSON.stringify(config.title), /"value":"One configuration"/)
  assert.match(JSON.stringify(config.text), /The same in every client\./)
  assert.match(JSON.stringify(config.notes), /"href":"\/en\/fixture\/guide\/"/)
  assert.match(JSON.stringify(next.details), /which way/)

  // The headings the timeline replaces give it their ids; the rest of the document stays.
  assert.deepEqual(r.timeline, { heading: 'Timeline', ids: ['timeline', 'upcoming', 'released', 'long-term'] })
  const rest = JSON.stringify(r.rest)
  for (const kept of ['"id":"goal"', '"id":"planning-notes"', '"id":"pn-next"', '"id":"next-proposal"', 'Not current behavior']) assert.ok(rest.includes(kept), kept)
  assert.ok(!rest.includes('CFG-01') && !rest.includes('"id":"upcoming"'))
  assert.match(JSON.stringify(r.preamble), /"href":"\/en\/fixture\/guide\/"/)
  assert.match(JSON.stringify(r.lead), /What the plan is\./)
})

test('rows and milestones the format does not allow are reported, not dropped', () => {
  const broken = FIXTURE.replace('| planned | — | — | See', '| wip | — | — | See')
    .replace('| in-progress | 🔸 | 2026-11 |', '| in-progress | high | 2026-11 |')
    .replace('| `CORE-01` |', '| `core one` |')
    .replace('| `MEM-01` | **Store** — Added. | done | 🔹 | 2025-03-01 | — |', '| `MEM-01` | **Store** — Added. | done | 🔹 | 2025-03-01 |')
    .replace('| [`backlog`](#backlog) | — | Later | unscheduled | — | — |', '| [`v3.0.0`](#v3.0.0) | v3.0.0 | Far | planned | — | — |\n| [`backlog`](#backlog) | — | Later | someday | — | — |')
    .replace('## Released\n', '<a id="v2.0.0"></a>\n### v2.0.0 · Unlisted\n\n## Released\n')
  const v = snapshot('broken', broken)
  const problems = roadmapOf(v, v.docs.get('docs/ROADMAP.md')!, 'en').problems.map((p) => p.replace(/^docs\/ROADMAP\.md:\d* /, ''))
  assert.deepEqual(problems.sort(), [
    'CFG-01: status wip is not one of proposed, planned, in-progress, implemented, done',
    'DOC-01: priority high is not 🔸, 🔹 or —',
    'Timeline milestone v3.0.0 has no section',
    'backlog: release state someday is not one of released, in-development, planned, unscheduled',
    'earlier: item ID core one is not <AREA>-<NN>',
    'earlier: item row has 5 cells, not 6',
    'milestone backlog is not in the Timeline',
    'milestone v2.0.0 is not in the Timeline',
  ])
})

// The ids the source defines: its headings' and its HTML anchors'.
function sourceIds(v: Version, file: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(readFileSync(path.join(v.source.root, file), 'utf8')) as Root
  const found = outline(v, v.docs.get(file)!).headings.map((h) => h.id)
  visit(tree, 'html', (node) => {
    for (const m of node.value.matchAll(/\b(?:id|name)="([^"]+)"/g)) found.push(m[1])
  })
  return found
}

test('the page keeps every anchor of its source', () => {
  for (const v of [snapshot('anchors', FIXTURE), versions()[0]]) {
    for (const locale of v.locales) {
      const p = page(v, locale)
      const html = renderToString(createElement(RoadmapArticle, { v, page: p }))
      const rendered = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
      for (const id of sourceIds(v, p.doc.path)) assert.ok(rendered.includes(id), `${v.id} ${locale}: #${id}`)
      assert.equal(new Set(rendered).size, rendered.length, `${v.id} ${locale}: ids are unique`)
    }
  }
})

test('both languages of the pinned Roadmap hold the same milestones and items', () => {
  const v = versions()[0]
  const read = (file: string, locale: string) => {
    const r = roadmapOf(v, v.docs.get(file)!, locale)
    assert.deepEqual(r.problems, [], file)
    return r.milestones.map((m) => ({
      id: m.id,
      release: [m.release, m.released ?? null],
      items: m.areas.flatMap((a) => a.items.map((i) => [i.id, i.status, i.priority ?? '—', i.date ?? '—'])),
    }))
  }
  const en = read('docs/ROADMAP.md', 'en')
  const zh = read('docs/ROADMAP-zh.md', 'zh-CN')
  assert.ok(en.length > 0 && en.some((m) => m.items.length))
  assert.deepEqual(zh, en)
})
