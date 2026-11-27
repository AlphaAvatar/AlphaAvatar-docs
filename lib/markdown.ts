import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import type { Root as HastRoot } from 'hast'
import type { Nodes, Root, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as Schema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { site } from '../site.config'
import type { Doc } from './manifest'
import { assetHref, markdownHref, pageByKey, pageHref, repoHref, type DocPage, type Version } from './site'
import { recordings, terminalLines, terminalText, type Run } from './terminal'

// One parse of a source file gives every representation of it: the HTML tree, the Markdown
// output (the source text with only its link targets changed), the contents and the search text.

declare module 'hast' {
  interface ElementData {
    // A ```terminal NAME block's recording: its colored lines and the text it showed.
    recording?: { lines: Run[][]; text: string }
  }
}

export type Heading = { depth: number; id: string; text: string }
export type SearchSection = { anchor: string; heading: string; text: string }

export type Rendered = {
  // The parsed source with its links rewritten for the language being read and its heading ids.
  tree: Root
  hast: HastRoot
  headings: Heading[]
  markdown: string
  sections: SearchSection[]
  // Repository files the page displays; the build copies them into the site.
  assets: string[]
  // Links that resolve to nothing in the snapshot, or name an anchor the linked page lacks.
  problems: string[]
}

type Target =
  | { kind: 'keep' }
  | { kind: 'doc'; doc: Doc; fragment: string }
  | { kind: 'file'; file: string; fragment: string; directory: boolean }
  | { kind: 'missing' }

type Urls = { html: string; md: string }

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif)$/i
const ATTR = /\b(href|src|srcset)=("([^"]*)"|'([^']*)')/gi
const BLOCKS = new Set(['root', 'blockquote', 'list', 'listItem', 'table', 'footnoteDefinition'])

const schema: Schema = {
  ...defaultSchema,
  // Anchors keep the ids the source wrote (`#v0.7.0`, `#readme-top`), as GitHub resolves them.
  clobberPrefix: '',
  clobber: [],
  tagNames: [...defaultSchema.tagNames!, 'picture', 'source'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...defaultSchema.attributes!['*'], 'id', 'align'],
    a: [...defaultSchema.attributes!.a, 'name'],
    // A ```terminal NAME block names its recording.
    code: [...(defaultSchema.attributes!.code ?? []), 'dataRecording'],
    img: [...defaultSchema.attributes!.img, 'width', 'height'],
    source: ['srcSet', 'media', 'type'],
  },
}

const parser = unified().use(remarkParse).use(remarkGfm)
const toHast = unified().use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeSanitize, schema)

// Where each place of `from` is in `to`, another language of the same document, for the ids that
// differ: an id `to` has too maps to itself and is left out; '' marks a place `to` lacks.
export function anchorMap(v: Version, from: Doc, to: Doc): Record<string, string> {
  const map: Record<string, string> = {}
  if (from.format === 'html' || to.format === 'html') return map
  for (const id of outline(v, from).ids) {
    const at = anchorIn(v, from, id, to)
    if (at !== id) map[id] = at ?? ''
  }
  return map
}

// The HTML of part of a rendered tree, by the same rules as the whole document.
export const htmlOf = (nodes: RootContent[]): HastRoot => toHast.runSync({ type: 'root', children: nodes }) as HastRoot

function resolve(v: Version, from: string, url: string): Target {
  if (!url || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) return { kind: 'keep' }
  const hash = url.indexOf('#')
  const fragment = hash < 0 ? '' : url.slice(hash)
  let file = (hash < 0 ? url : url.slice(0, hash)).split('?')[0]
  try {
    file = decodeURI(file)
  } catch {}
  file = path.posix.normalize(file.startsWith('/') ? file.slice(1) : path.posix.join(path.posix.dirname(from), file))
  file = file.replace(/\/$/, '').replace(/^\.$/, '')
  if (file.startsWith('..')) return { kind: 'missing' }

  const doc = v.docs.get(file)
  if (doc) return { kind: 'doc', doc, fragment }
  try {
    return { kind: 'file', file, fragment, directory: statSync(path.join(v.source.root, file)).isDirectory() }
  } catch {
    return { kind: 'missing' }
  }
}

// A link between two languages of the same document is its language switch and keeps the
// language it names. Any other link to a document follows the language being read.
const switchesLanguage = (from: Doc, to: Doc) => !!to.translation_group && to.translation_group === from.translation_group && to.lang !== from.lang

// Every place a link into a document can name: its headings in order and the ids its HTML writes.
type Outline = { headings: Heading[]; ids: Set<string> }

const outlines = new Map<string, Outline>()

function headingIds(tree: Root): Heading[] {
  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  visit(tree, 'heading', (node) => {
    const text = toString(node, { includeHtml: false })
    headings.push({ depth: node.depth, id: slugger.slug(text), text })
  })
  return headings
}

export function outline(v: Version, doc: Doc): Outline {
  const key = `${v.id}|${doc.path}`
  let found = outlines.get(key)
  if (!found) {
    const source = readFileSync(path.join(v.source.root, doc.path), 'utf8')
    const ids = new Set([...source.matchAll(/\b(?:id|name)="([^"]+)"/g)].map((m) => m[1]))
    const headings = doc.format === 'html' ? [] : headingIds(parser.parse(source) as Root)
    for (const h of headings) ids.add(h.id)
    outlines.set(key, (found = { headings, ids }))
  }
  return found
}

// The anchor in `doc` of the place `id` names in `named`, another language of the same document:
// the same id when `doc` has it, else the heading at the same position, since a translation keeps
// its source's headings in order (the source repository checks this).
export function anchorIn(v: Version, named: Doc, id: string, doc: Doc): string | undefined {
  const target = outline(v, doc)
  if (target.ids.has(id)) return id
  const source = outline(v, named)
  const at = source.headings.findIndex((h) => h.id === id)
  const same = source.headings.length === target.headings.length && source.headings.every((h, i) => h.depth === target.headings[i].depth)
  return at >= 0 && same ? target.headings[at].id : undefined
}

function plain(node: Nodes): string {
  if (node.type === 'html') return node.value.replace(/<[^>]+>/g, ' ')
  if ('value' in node) return node.value
  if (!('children' in node)) return ''
  const separator = BLOCKS.has(node.type) ? '\n' : node.type === 'tableRow' ? ' · ' : ''
  return (node.children as Nodes[]).map(plain).join(separator)
}

const cache = new Map<string, Rendered>()

// `locale` is the language the HTML is read in: its links lead to that language's pages. The
// Markdown output is always in the document's own language.
export function renderDocument(v: Version, doc: Doc, locale: string): Rendered {
  const cacheKey = `${v.id}|${locale}|${doc.path}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const source = readFileSync(path.join(v.source.root, doc.path), 'utf8')
  const tree = parser.parse(source) as Root
  const assets = new Set<string>()
  const problems: string[] = []
  const edits: { start: number; end: number; text: string }[] = []

  const urls = (url: string, display: boolean): Urls | undefined => {
    const target = resolve(v, doc.path, url)
    if (target.kind === 'keep') return undefined
    if (target.kind === 'missing') {
      problems.push(`${doc.path}: ${url} resolves to nothing in ${v.source.sha.slice(0, 12)}`)
      return undefined
    }
    if (target.kind === 'doc') {
      const { doc: to, fragment } = target
      const at = (shown: Doc) => {
        if (!fragment) return ''
        const id = anchorIn(v, to, fragment.slice(1), shown)
        if (id === undefined) problems.push(`${doc.path}: ${url}: ${shown.path} has no anchor for ${fragment}`)
        return `#${id ?? fragment.slice(1)}`
      }
      const key = to.translation_group ?? to.id
      const pageIn = (lang: string) => pageByKey(v, lang, key) as DocPage
      // HTML opens the page in the language being read, Markdown the document in its own language.
      const [read, own] = switchesLanguage(doc, to) ? [pageIn(to.lang), pageIn(to.lang)] : [pageIn(locale), pageIn(doc.lang)]
      return { html: pageHref(v.id, read.locale, read.route) + at(read.doc), md: site.url + markdownHref(v.id, own.doc) + at(own.doc) }
    }
    if (display || (IMAGE.test(target.file) && !target.directory)) {
      assets.add(target.file)
      const href = assetHref(v.source.sha, target.file)
      return { html: href, md: site.url + href }
    }
    const href = repoHref(v.source.sha, target.file, target.directory) + target.fragment
    return { html: href, md: href }
  }

  const edit = (start: number, at: number, from: string, to: string) => {
    if (at < 0) problems.push(`${doc.path}: could not place ${from} for the Markdown output`)
    else edits.push({ start: start + at, end: start + at + from.length, text: to })
  }

  // A ```terminal NAME block shows recording NAME of docs/cli/cli-output.json, whose text it
  // holds (the repository checks both agree, as this build does).
  const shown = new Map<string, { lines: Run[][]; text: string }>()
  visit(tree, 'code', (node) => {
    if (node.lang !== 'terminal' || !node.meta) return
    const data = recordings(v)
    const panel = data?.panels.get(node.meta.trim())
    if (!panel) {
      problems.push(`${doc.path}: terminal block ${node.meta}: no such recording in docs/cli/cli-output.json`)
      return
    }
    const lines = terminalLines(panel.screen, data!.palette)
    const text = terminalText(lines)
    if (text !== node.value) problems.push(`${doc.path}: terminal block ${panel.name} differs from its recording`)
    shown.set(panel.name, { lines, text })
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataRecording: panel.name } }
  })

  const headings = headingIds(tree)
  let next = 0
  visit(tree, (node) => {
    if (node.type === 'heading') {
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: headings[next++].id } }
      return
    }
    if (node.type !== 'link' && node.type !== 'image' && node.type !== 'definition' && node.type !== 'html') return
    const start = node.position!.start.offset!
    const written = source.slice(start, node.position!.end.offset!)

    if (node.type === 'html') {
      const replace = (value: string, md: boolean) =>
        value.replace(ATTR, (all, attr: string, _q, double?: string, single?: string) => {
          const raw = double ?? single ?? ''
          if (!raw) return all
          const parts = attr.toLowerCase() === 'srcset' ? raw.split(',').map((p) => p.trim().split(/\s+/)) : [[raw]]
          const out = parts.map(([url, ...rest]) => {
            const u = urls(url, attr.toLowerCase() !== 'href')
            return [u ? (md ? u.md : u.html) : url, ...rest].join(' ')
          })
          return all.replace(raw, out.join(', '))
        })
      for (const match of written.matchAll(ATTR)) {
        const rewritten = replace(match[0], true)
        if (rewritten !== match[0]) edit(start, match.index, match[0], rewritten)
      }
      node.value = replace(node.value, false)
      return
    }

    const u = urls(node.url, node.type === 'image')
    if (!u) return
    const at =
      node.type === 'definition'
        ? written.indexOf(node.url, written.indexOf(']:'))
        : Math.max(written.lastIndexOf(`(${node.url}`), written.lastIndexOf(`(<${node.url}`))
    edit(start, at < 0 ? at : written.indexOf(node.url, at), node.url, u.md)
    node.url = u.html
  })

  let markdown = source
  for (const e of edits.sort((a, b) => b.start - a.start)) markdown = markdown.slice(0, e.start) + e.text + markdown.slice(e.end)

  const sections: SearchSection[] = []
  let current: SearchSection = { anchor: '', heading: doc.title, text: '' }
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth <= 3) {
      if (current.text) sections.push(current)
      current = { anchor: String(node.data?.hProperties?.id ?? ''), heading: toString(node, { includeHtml: false }), text: '' }
    } else {
      current.text += ' ' + plain(node)
    }
  }
  sections.push(current)
  for (const s of sections) s.text = s.text.replace(/\s+/g, ' ').trim()

  const hast = toHast.runSync(tree) as HastRoot
  visit(hast, 'element', (node) => {
    const name = node.tagName === 'code' ? node.properties.dataRecording : undefined
    if (typeof name === 'string' && shown.has(name)) node.data = { ...node.data, recording: shown.get(name) }
  })

  const rendered: Rendered = {
    tree,
    hast,
    headings: headings.filter((h) => h.depth === 2 || h.depth === 3),
    markdown,
    sections,
    assets: [...assets],
    problems,
  }
  cache.set(cacheKey, rendered)
  return rendered
}

// Search text of a page that is not Markdown (an HTML illustration).
export function htmlSections(v: Version, doc: Doc): SearchSection[] {
  const html = readFileSync(path.join(v.source.root, doc.path), 'utf8')
  const text = html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [{ anchor: '', heading: doc.title, text }]
}
