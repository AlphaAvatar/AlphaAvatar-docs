import { site } from '../site.config'
import { loadManifest, places, type Doc, type Group, type Manifest, type Section } from './manifest'
import { snapshots, type Snapshot } from './sources'

// The site's pages for one version and language, derived from that snapshot's manifest only.

export type DocPage = {
  kind: 'doc'
  // One document across its languages: its translation group, else its id.
  key: string
  locale: string
  route: string
  // The file shown: the locale's own when it exists, else the document in another language.
  doc: Doc
  variants: Doc[]
  section: Section
  // The document's groups from its section down, its own last.
  groups: Group[]
}

// A section's entry page, at /<section id>, which the site writes.
export type SectionPage = { kind: 'section'; key: string; locale: string; route: string; section: Section; pages: DocPage[] }

// The one page a group has of its own: release notes listed with their dates, at /<group id>.
export type ReleasesPage = { kind: 'releases'; key: string; locale: string; route: string; section: Section; group: Group; pages: DocPage[] }

// The landing page at / of every version and language; the site writes it (lib/home.ts).
// Its key cannot be a manifest id or translation group (README's id is `home`).
export type HomePage = { kind: 'home'; key: ':home'; locale: string; route: '/' }

export type Page = DocPage | SectionPage | ReleasesPage | HomePage

// A section's navigation: each group's documents, then its own groups.
export type NavNode = { group: Group; pages: DocPage[]; groups: NavNode[]; index?: ReleasesPage }
export type NavSection = { section: Section; entry?: SectionPage; groups: NavNode[] }

export type Version = {
  id: string
  label: string
  source: Snapshot
  manifest: Manifest
  locales: string[]
  // Public documents by repository path, for link resolution.
  docs: Map<string, Doc>
  pages: Map<string, Page[]>
}

const localeOrder = (preferred: string) => [preferred, site.defaultLocale, ...Object.keys(site.locales)]

// Navigation order: sections, their groups, a group's documents before its own groups.
function groupRanks(manifest: Manifest): Map<string, number[]> {
  const ranks = new Map<string, number[]>()
  manifest.sections.forEach((section, s) =>
    section.groups.forEach((group, g) => {
      ranks.set(group.id, [s, g, 0])
      group.groups?.forEach((sub, i) => ranks.set(sub.id, [s, g, i + 1]))
    }),
  )
  return ranks
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

function buildPages(manifest: Manifest, locale: string): Page[] {
  const byGroup = new Map<string, Doc[]>()
  for (const doc of manifest.documents) {
    if (doc.visibility !== 'public') continue
    const key = doc.translation_group ?? doc.id
    byGroup.set(key, [...(byGroup.get(key) ?? []), doc])
  }

  const where = places(manifest)
  const ranks = groupRanks(manifest)
  const order = localeOrder(locale)
  const rank = (lang: string) => (order.includes(lang) ? order.indexOf(lang) : order.length)
  const docs: DocPage[] = [...byGroup].map(([key, variants]) => {
    const doc = [...variants].sort((a, b) => rank(a.lang) - rank(b.lang))[0]
    const place = where.get(doc.group)
    if (!place) throw new Error(`manifest: ${doc.id} is in unknown group ${doc.group}`)
    return { kind: 'doc', key, locale, route: doc.route, doc, variants, section: place.section, groups: place.groups }
  })
  docs.sort((a, b) => compare([...ranks.get(a.doc.group)!, a.doc.order], [...ranks.get(b.doc.group)!, b.doc.order]) || a.doc.id.localeCompare(b.doc.id))

  const routes = new Set<string>(['/'])
  for (const page of docs) {
    if (page.route === '/') throw new Error(`manifest: ${page.doc.id} has route /, which is the site's home page`)
    if (routes.has(page.route)) throw new Error(`manifest: route ${page.route} repeats in ${locale}`)
    routes.add(page.route)
  }

  const generated: Page[] = []
  for (const section of manifest.sections) {
    const pages = docs.filter((p) => p.section.id === section.id)
    const route = `/${section.id}`
    if (pages.length && !routes.has(route)) generated.push({ kind: 'section', key: `section:${section.id}`, locale, route, section, pages })
  }
  for (const [id, place] of where) {
    const pages = docs.filter((p) => p.doc.group === id)
    const route = `/${id}`
    if (pages.length && pages.every((p) => p.doc.release) && !routes.has(route)) {
      generated.push({ kind: 'releases', key: `releases:${id}`, locale, route, section: place.section, group: place.groups.at(-1)!, pages })
    }
  }
  for (const page of generated) {
    if (routes.has(page.route)) throw new Error(`manifest: route ${page.route} repeats in ${locale}`)
    routes.add(page.route)
  }
  return [{ kind: 'home', key: ':home', locale, route: '/' }, ...docs, ...generated]
}

export function loadVersion(source: Snapshot): Version {
  const manifest = loadManifest(source.root)
  const langs = new Set(manifest.documents.filter((d) => d.visibility === 'public').map((d) => d.lang))
  const locales = [...Object.keys(site.locales).filter((l) => langs.has(l)), ...[...langs].filter((l) => !(l in site.locales))]
  const docs = new Map(manifest.documents.filter((d) => d.visibility === 'public').map((d) => [d.path, d]))
  const pages = new Map(locales.map((locale) => [locale, buildPages(manifest, locale)]))
  return { id: source.id, label: source.label, source, manifest, locales, docs, pages }
}

let cache: Version[] | undefined

export const versions = (): Version[] => (cache ??= snapshots().map(loadVersion))

export const version = (id: string) => versions().find((v) => v.id === id)

export const allLocales = () => [...new Set(versions().flatMap((v) => v.locales))]

export const pageOf = (v: Version, locale: string, route: string) => v.pages.get(locale)?.find((p) => p.route === route)

export const pageByKey = (v: Version, locale: string, key: string) => v.pages.get(locale)?.find((p) => p.key === key)

export const docPages = (v: Version, locale: string) => (v.pages.get(locale) ?? []).filter((p): p is DocPage => p.kind === 'doc')

// The section a page belongs to, whichever way it was reached; the home page has none.
export const sectionOf = (page: Page): Section | undefined => (page.kind === 'home' ? undefined : page.section)

export function nav(v: Version, locale: string): NavSection[] {
  const pages = v.pages.get(locale) ?? []
  const docs = docPages(v, locale)
  const node = (group: Group): NavNode => ({
    group,
    pages: docs.filter((p) => p.doc.group === group.id),
    groups: (group.groups ?? []).map(node).filter((n) => n.pages.length || n.groups.length),
    index: pages.find((p): p is ReleasesPage => p.kind === 'releases' && p.group.id === group.id),
  })
  return v.manifest.sections
    .map((section) => ({
      section,
      entry: pages.find((p): p is SectionPage => p.kind === 'section' && p.section.id === section.id),
      groups: section.groups.map(node).filter((n) => n.pages.length || n.groups.length),
    }))
    .filter((s) => s.groups.length)
}

// The page a section is entered from: its entry page, else its first document.
export function sectionEntry(v: Version, locale: string, sectionId: string): Page | undefined {
  const pages = v.pages.get(locale) ?? []
  return (
    pages.find((p) => p.kind === 'section' && p.section.id === sectionId) ?? pages.find((p) => p.kind === 'doc' && p.section.id === sectionId)
  )
}

// A group's own page: its release index, else its first document (its subgroups' included).
export function groupEntry(v: Version, locale: string, groupId: string): Page | undefined {
  const pages = v.pages.get(locale) ?? []
  return (
    pages.find((p) => p.kind === 'releases' && p.group.id === groupId) ??
    pages.find((p) => p.kind === 'doc' && p.groups.some((g) => g.id === groupId))
  )
}

// Previous and next stay within the document's section, in navigation order.
export function neighbours(v: Version, page: DocPage): { previous?: DocPage; next?: DocPage } {
  const pages = docPages(v, page.locale).filter((p) => p.section.id === page.section.id)
  const at = pages.findIndex((p) => p.key === page.key)
  return { previous: pages[at - 1], next: pages[at + 1] }
}

// The latest release notes the manifest lists, for the home page spotlight.
export function latestRelease(v: Version, locale: string): DocPage | undefined {
  const releases = docPages(v, locale).filter((p) => !!p.doc.release)
  return releases.sort((a, b) => b.doc.release!.published.localeCompare(a.doc.release!.published))[0]
}

/* URLs */

export const pageHref = (versionId: string, locale: string, route: string) =>
  `/${locale}/${versionId}${route === '/' ? '' : route}/`

// A document's own file, the one address every link to it uses: Markdown beside its page; HTML in
// a directory of its own under /_html, whose index is served at the directory as every page is.
// The host serves `X.html` at `/X/`, never at `X.html`, so a file beside its page would take the
// page's address (scripts/check-export.ts).
export const sourceHref = (versionId: string, doc: Doc) =>
  doc.format === 'html' ? `/_html${pageHref(versionId, doc.lang, doc.route)}` : `/${doc.lang}/${versionId}${doc.route}.md`

// The output file an address of this site is written to: a directory's is its index.
export const outputFile = (href: string) => (href.endsWith('/') ? `${href}index.html` : href)

export const homeMarkdownHref = (versionId: string, locale: string) => `/${locale}/${versionId}/index.md`

export const searchHref = (versionId: string, locale: string) => `/${locale}/${versionId}/search.json`

export const llmsHref = (versionId: string, locale: string) => `/${locale}/${versionId}/llms.txt`

export const assetHref = (sha: string, file: string) => `/_assets/${sha.slice(0, 12)}/${file}`

// The file as this build read it: fixed to the snapshot's commit.
export const repoHref = (sha: string, file: string, directory = false) =>
  `https://github.com/${site.repository}/${directory ? 'tree' : 'blob'}/${sha}/${file}`

// The file where this version's text is edited: its editRef, which can be ahead of the snapshot.
export function editHref(v: Version, file: string): { href: string; branch: string } | undefined {
  const branch = v.source.editRef
  return branch ? { href: `https://github.com/${site.repository}/edit/${branch}/${file}`, branch } : undefined
}
