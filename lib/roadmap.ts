import type { Element, Root as HastRoot } from 'hast'
import type { Heading as MdHeading, Nodes, PhrasingContent, Root, RootContent, Table, TableCell } from 'mdast'
import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'
import { htmlOf, renderDocument, type Heading } from './markdown'
import type { Doc } from './manifest'
import type { Version } from './site'

// The Roadmap page's model, read from the same parsed tree as the document's other outputs and by
// the rules of its "Format" section: the Timeline table lists the milestones in order; a
// milestone is an `<a id>` anchor and a `###` heading, its detail bullets before the first table,
// and item tables grouped by `####` area headings. Text stays the source's, rendered as Markdown.
// Whatever the page does not show as a milestone is rendered after the timeline as it is; a
// table, row or milestone that does not follow the format is a problem, never dropped.

export const STATUSES = ['proposed', 'planned', 'in-progress', 'implemented', 'done'] as const
export const RELEASES = ['released', 'in-development', 'planned', 'unscheduled'] as const

export type Item = {
  id: string
  // The `<AREA>` part of the ID.
  area: string
  // A leading bold title, else the whole text; `text` is what follows the title's dash.
  title: HastRoot
  text?: HastRoot
  status: string
  priority?: string
  date?: string
  notes?: HastRoot
}

export type Area = { heading?: Heading; anchors: string[]; items: Item[] }

export type Milestone = {
  id: string
  // Other ids of its anchor.
  anchors: string[]
  heading: Heading
  // The heading up to its ` · ` (a version, or the group's name).
  label: string
  version?: string
  theme: HastRoot
  release: string
  released?: string
  notes?: HastRoot
  notesHref?: string
  details: HastRoot
  areas: Area[]
}

export type Roadmap = {
  title?: Heading
  // Paragraphs of links only between the title and the lead (the language switch).
  preamble: HastRoot
  lead?: HastRoot
  // The headings the timeline replaces: its section's text and every id they defined.
  timeline: { heading: string; ids: string[] }
  milestones: Milestone[]
  rest: HastRoot
  problems: string[]
}

const TIMELINE = ['Milestone|Version|Theme|Release|Released|Release notes', '里程碑|版本|主题|发布|发布日期|Release 文档']
const ITEMS = ['ID|Item|Status|Priority|Date|Notes', 'ID|事项|状态|优先级|日期|说明']
const MILESTONE = /^(v\d+\.\d+\.\d+|earlier|backlog)$/
const ITEM_ID = /^([A-Z]+)-\d+$/
const DATE = /^\d{4}-\d{2}(-\d{2})?$|^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/
const PRIORITIES = ['🔸', '🔹']
const NONE = '—'

const text = (node: Nodes) => toString(node, { includeHtml: false }).trim()
const header = (table: Table) => table.children[0].children.map(text).join('|')
const headingOf = (node: MdHeading): Heading => ({ depth: node.depth, id: String(node.data?.hProperties?.id ?? ''), text: text(node) })

// `<a id="…"></a>` on its own line: a paragraph of inline HTML only, naming what follows.
function anchorsOf(node: RootContent | undefined): string[] | undefined {
  if (node?.type !== 'paragraph' || !node.children.every((c) => c.type === 'html' || (c.type === 'text' && !c.value.trim()))) return
  const ids = node.children.flatMap((c) => (c.type === 'html' ? [...c.value.matchAll(/\b(?:id|name)="([^"]+)"/g)].map((m) => m[1]) : []))
  return ids.length ? ids : undefined
}

// A heading opens a section; an anchor paragraph right before it belongs to it. The first
// section holds what precedes the first heading.
type Section = { anchors: string[]; heading?: MdHeading; nodes: RootContent[]; body: RootContent[] }

function split(nodes: RootContent[], depth: number): Section[] {
  const sections: Section[] = [{ anchors: [], nodes: [], body: [] }]
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const next = nodes[i + 1]
    const anchors = anchorsOf(node)
    if (anchors && next?.type === 'heading' && next.depth <= depth) {
      sections.push({ anchors, heading: next, nodes: [node, next], body: [] })
      i++
    } else if (node.type === 'heading' && node.depth <= depth) {
      sections.push({ anchors: [], heading: node, nodes: [node], body: [] })
    } else {
      sections.at(-1)!.nodes.push(node)
      sections.at(-1)!.body.push(node)
    }
  }
  return sections
}

const linkOnly = (node: RootContent) =>
  node.type === 'paragraph' && node.children.every((c) => c.type === 'link' || (c.type === 'text' && !c.value.trim()))

// `**Title** — text`: the bold lead is the item's title; without one, the whole text is.
function titled(nodes: PhrasingContent[]): { title: PhrasingContent[]; text?: PhrasingContent[] } {
  const [first, second, ...more] = nodes
  if (first?.type !== 'strong' || second?.type !== 'text' || !/^\s*—\s*/.test(second.value)) return { title: nodes }
  const value = second.value.replace(/^\s*—\s*/, '')
  return { title: first.children, text: value ? [{ ...second, value }, ...more] : more }
}

function firstLink(cell: TableCell): string | undefined {
  let href: string | undefined
  visit(cell, 'link', (link) => {
    href ??= link.url
  })
  return href
}

export function parseRoadmap(tree: Root, where: string): Roadmap {
  const problems: string[] = []
  // Returns no rows, for the row parsers.
  const problem = (node: Nodes | undefined, message: string): [] => {
    problems.push(`${where}:${node?.position?.start.line ?? ''} ${message}`)
    return []
  }
  const definitions = tree.children.filter((n) => n.type === 'definition')
  const html = (nodes: RootContent[]) => htmlOf([...nodes, ...definitions])
  const inline = (nodes: PhrasingContent[]): HastRoot => {
    const p = htmlOf([{ type: 'paragraph', children: nodes }]).children.find((c): c is Element => c.type === 'element')
    return { type: 'root', children: p?.children ?? [] }
  }

  const rest: RootContent[] = []
  const at = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 1)
  if (at < 0) problem(undefined, 'has no `#` title')
  rest.push(...tree.children.slice(0, Math.max(at, 0)))
  const [intro, ...sections] = split(tree.children.slice(at + 1), 2)

  const preamble: RootContent[] = []
  let lead: RootContent | undefined
  for (const node of intro.nodes) {
    if (!lead && linkOnly(node)) preamble.push(node)
    else if (!lead && node.type === 'paragraph') lead = node
    else rest.push(node)
  }

  type Row = Omit<Milestone, 'anchors' | 'heading' | 'label' | 'details' | 'areas'>
  const timelineRows = (table: Table): Row[] =>
    table.children.slice(1).flatMap((row) => {
      const cells = row.children
      if (cells.length !== 6) return problem(row, `Timeline row has ${cells.length} cells, not 6`)
      const [id, version, , release, released, notes] = cells.map(text)
      if (!MILESTONE.test(id)) return problem(row, `Timeline milestone ${id} is not vX.Y.Z, earlier or backlog`)
      if (!(RELEASES as readonly string[]).includes(release)) return problem(row, `${id}: release state ${release} is not one of ${RELEASES.join(', ')}`)
      if (released !== NONE && !DATE.test(released)) return problem(row, `${id}: release date ${released} is not a date, a range or —`)
      return [
        {
          id,
          version: version === NONE ? undefined : version,
          theme: inline(cells[2].children),
          release,
          released: released === NONE ? undefined : released,
          notes: notes === NONE ? undefined : inline(cells[5].children),
          notesHref: firstLink(cells[5]),
        },
      ]
    })

  const seen = new Set<string>()
  const itemRows = (table: Table, milestone: string): Item[] =>
    table.children.slice(1).flatMap((row) => {
      const cells = row.children
      if (cells.length !== 6) return problem(row, `${milestone}: item row has ${cells.length} cells, not 6`)
      const [id, item, status, priority, date, notes] = cells.map(text)
      const area = ITEM_ID.exec(id)?.[1]
      if (!area) return problem(row, `${milestone}: item ID ${id} is not <AREA>-<NN>`)
      if (seen.has(id)) return problem(row, `${milestone}: item ${id} appears twice`)
      seen.add(id)
      if (!item) return problem(row, `${id} has no text`)
      if (!(STATUSES as readonly string[]).includes(status)) return problem(row, `${id}: status ${status} is not one of ${STATUSES.join(', ')}`)
      if (priority !== NONE && !PRIORITIES.includes(priority)) return problem(row, `${id}: priority ${priority} is not 🔸, 🔹 or —`)
      if (date !== NONE && !DATE.test(date)) return problem(row, `${id}: date ${date} is not a date, a range or —`)
      const parts = titled(cells[1].children)
      return [
        {
          id,
          area,
          title: inline(parts.title),
          text: parts.text?.length ? inline(parts.text) : undefined,
          status,
          priority: priority === NONE ? undefined : priority,
          date: date === NONE ? undefined : date,
          notes: notes === NONE ? undefined : inline(cells[5].children),
        },
      ]
    })

  // A milestone: details until its first table, then item tables under optional area headings.
  const milestoneOf = (row: Row, unit: Section): Milestone => {
    const heading = headingOf(unit.heading!)
    const [first, ...areaSections] = split(unit.body, 4)
    const details: RootContent[] = []
    const areas: Area[] = []
    const take = (nodes: RootContent[], area: () => Area) => {
      for (const node of nodes) {
        if (node.type === 'table' && ITEMS.includes(header(node))) area().items.push(...itemRows(node, row.id))
        else if (!areas.length) details.push(node)
        else problem(node, `${row.id}: ${node.type === 'table' ? 'a table that is not an item table' : `${node.type} between item tables`}`)
      }
    }
    take(first.body, () => {
      if (!areas.length) areas.push({ anchors: [], items: [] })
      return areas[0]
    })
    for (const s of areaSections) {
      const area: Area = { heading: headingOf(s.heading!), anchors: s.anchors, items: [] }
      areas.push(area)
      take(s.body, () => area)
    }
    return { ...row, anchors: unit.anchors.filter((a) => a !== row.id), heading, label: heading.text.split(' · ')[0], details: html(details), areas }
  }

  // Sections whose content is only the Timeline table and milestones are replaced by the timeline,
  // which takes their headings' ids; any other content stays, under its heading.
  let rows: Row[] | undefined
  let timelineHeading = ''
  const timelineIds: string[] = []
  const units = new Map<string, Section>()
  for (const section of sections) {
    const [own, ...subsections] = split(section.body, 3)
    const kept: RootContent[] = []
    let replaced = false
    for (const node of own.body) {
      if (node.type !== 'table' || !TIMELINE.includes(header(node))) {
        kept.push(node)
      } else if (rows) {
        problem(node, 'has a second Timeline table')
      } else {
        rows = timelineRows(node)
        timelineHeading = text(section.heading!)
        replaced = true
      }
    }
    for (const sub of subsections) {
      const id = sub.anchors.find((a) => MILESTONE.test(a))
      if (!id) {
        kept.push(...sub.nodes)
      } else if (units.has(id)) {
        problem(sub.heading, `milestone ${id} has a second section`)
      } else {
        units.set(id, sub)
        replaced = true
      }
    }
    if (replaced && !kept.length) timelineIds.push(...section.anchors, headingOf(section.heading!).id)
    else rest.push(...section.nodes.slice(0, section.nodes.length - section.body.length), ...kept)
  }
  if (!rows) problem(undefined, 'has no Timeline table')
  for (const [id, unit] of units) if (!rows?.some((r) => r.id === id)) problem(unit.heading, `milestone ${id} is not in the Timeline`)

  const milestones = (rows ?? []).flatMap((row) => {
    const unit = units.get(row.id)
    if (!unit) return problem(undefined, `Timeline milestone ${row.id} has no section`)
    return [milestoneOf(row, unit)]
  })

  return {
    title: at < 0 ? undefined : headingOf(tree.children[at] as MdHeading),
    preamble: html(preamble),
    lead: lead && html([lead]),
    timeline: { heading: timelineHeading, ids: timelineIds },
    milestones,
    rest: html(rest),
    problems,
  }
}

const cache = new Map<string, Roadmap>()

// `locale` is the language the page is read in, as for renderDocument.
export function roadmapOf(v: Version, doc: Doc, locale: string): Roadmap {
  const key = `${v.id}|${locale}|${doc.path}`
  let roadmap = cache.get(key)
  if (!roadmap) cache.set(key, (roadmap = parseRoadmap(renderDocument(v, doc, locale).tree, doc.path)))
  return roadmap
}
