import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import type { Root as HastRoot } from 'hast'
import type { Nodes, Root } from 'mdast'
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
import { assetHref, markdownHref, pageByKey, pageHref, repoHref, type Version } from './site'

// One parse of a source file gives every representation of it: the HTML tree, the Markdown
// output (the source text with only its link targets changed), the contents and the search text.

export type Heading = { depth: number; id: string; text: string }
export type SearchSection = { anchor: string; heading: string; text: string }

export type Rendered = {
  hast: HastRoot
  headings: Heading[]
  markdown: string
  sections: SearchSection[]
  // Repository files the page displays; the build copies them into the site.
  assets: string[]
  // Every id a link can target: headings and ids written in HTML.
  anchors: string[]
  // Links into other published documents, for the build's anchor check.
  links: { doc: Doc; fragment: string }[]
  // Links that resolve to nothing in the snapshot; they are left as written.
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
    img: [...defaultSchema.attributes!.img, 'width', 'height'],
    source: ['srcSet', 'media', 'type'],
  },
}

const parser = unified().use(remarkParse).use(remarkGfm)
const toHast = unified().use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeSanitize, schema)

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

// A link to another language of a document that also exists in the linking document's own
// language names that language on purpose (a language switch, a translation listed by name), so
// it keeps it. Any other link to a document follows the language being read.
function namesLanguage(v: Version, from: Doc, to: Doc): boolean {
  const group = to.translation_group
  return !!group && to.lang !== from.lang && [...v.docs.values()].some((d) => d.translation_group === group && d.lang === from.lang)
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
  const anchors = new Set<string>()
  const links: Rendered['links'] = []
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
      if (fragment) links.push({ doc: to, fragment: fragment.slice(1) })
      const key = to.translation_group ?? to.id
      if (namesLanguage(v, doc, to)) {
        return { html: pageHref(v.id, to.lang, pageByKey(v, to.lang, key)!.route) + fragment, md: site.url + markdownHref(v.id, to) + fragment }
      }
      const read = pageByKey(v, locale, key)!
      const own = pageByKey(v, doc.lang, key)!
      if (own.kind !== 'doc') return undefined
      return { html: pageHref(v.id, locale, read.route) + fragment, md: site.url + markdownHref(v.id, own.doc) + fragment }
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

  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  visit(tree, (node) => {
    if (node.type === 'heading') {
      const text = toString(node, { includeHtml: false })
      const id = slugger.slug(text)
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
      headings.push({ depth: node.depth, id, text })
      anchors.add(id)
      return
    }
    if (node.type === 'html') for (const m of node.value.matchAll(/\b(?:id|name)="([^"]+)"/g)) anchors.add(m[1])
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

  const rendered: Rendered = {
    hast: toHast.runSync(tree) as HastRoot,
    headings: headings.filter((h) => h.depth === 2 || h.depth === 3),
    markdown,
    sections,
    assets: [...assets],
    anchors: [...anchors],
    links,
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
