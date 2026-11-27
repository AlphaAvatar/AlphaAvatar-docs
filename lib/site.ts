import { site } from '../site.config'
import { loadManifest, type Doc, type Manifest, type Section } from './manifest'
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
}

// A section without a document at /<section id> lists its documents there.
export type SectionPage = { kind: 'section'; key: string; locale: string; route: string; section: Section; pages: DocPage[] }

// The landing page at / of every version and language; the site writes it (lib/home.ts).
// Its key cannot be a manifest id or translation group (README's id is `home`).
export type HomePage = { kind: 'home'; key: ':home'; locale: string; route: '/' }

export type Page = DocPage | SectionPage | HomePage

export type NavGroup = { section: Section; index?: SectionPage; pages: DocPage[] }

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

function buildPages(manifest: Manifest, locale: string): Page[] {
  const groups = new Map<string, Doc[]>()
  for (const doc of manifest.documents) {
    if (doc.visibility !== 'public') continue
    const key = doc.translation_group ?? doc.id
    groups.set(key, [...(groups.get(key) ?? []), doc])
  }

  const order = localeOrder(locale)
  const rank = (lang: string) => (order.includes(lang) ? order.indexOf(lang) : order.length)
  const sectionRank = (id: string) => manifest.sections.findIndex((s) => s.id === id)
  const docs: DocPage[] = [...groups].map(([key, variants]) => {
    const doc = [...variants].sort((a, b) => rank(a.lang) - rank(b.lang))[0]
    const section = manifest.sections.find((s) => s.id === doc.section)
    if (!section) throw new Error(`manifest: ${doc.id} is in unknown section ${doc.section}`)
    return { kind: 'doc', key, locale, route: doc.route, doc, variants, section }
  })
  docs.sort((a, b) => sectionRank(a.section.id) - sectionRank(b.section.id) || a.doc.order - b.doc.order || a.doc.id.localeCompare(b.doc.id))

  const routes = new Set<string>(['/'])
  for (const page of docs) {
    if (page.route === '/') throw new Error(`manifest: ${page.doc.id} has route /, which is the site's home page`)
    if (routes.has(page.route)) throw new Error(`manifest: route ${page.route} repeats in ${locale}`)
    routes.add(page.route)
  }

  const indexes: SectionPage[] = manifest.sections.flatMap((section) => {
    const pages = docs.filter((p) => p.section.id === section.id)
    const route = `/${section.id}`
    if (routes.has(route) || !pages.length) return []
    return [{ kind: 'section', key: `section:${section.id}`, locale, route, section, pages }]
  })
  return [{ kind: 'home', key: ':home', locale, route: '/' }, ...docs, ...indexes]
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

export function nav(v: Version, locale: string): NavGroup[] {
  const pages = v.pages.get(locale) ?? []
  return v.manifest.sections
    .map((section) => ({
      section,
      index: pages.find((p): p is SectionPage => p.kind === 'section' && p.section.id === section.id),
      pages: pages.filter((p): p is DocPage => p.kind === 'doc' && p.section.id === section.id),
    }))
    .filter((g) => g.pages.length)
}

// The page a section is entered from: its index or its document at /<id>, else its first page.
export function sectionEntry(v: Version, locale: string, sectionId: string): Page | undefined {
  const group = nav(v, locale).find((g) => g.section.id === sectionId)
  return group && (group.index ?? group.pages.find((p) => p.route === `/${sectionId}`) ?? group.pages[0])
}

export function neighbours(v: Version, page: DocPage): { previous?: DocPage; next?: DocPage } {
  const pages = nav(v, page.locale).flatMap((g) => g.pages)
  const at = pages.findIndex((p) => p.key === page.key)
  return { previous: pages[at - 1], next: pages[at + 1] }
}

// The latest release notes the manifest lists, for the home page spotlight.
export function latestRelease(v: Version, locale: string): DocPage | undefined {
  const releases = (v.pages.get(locale) ?? []).filter((p): p is DocPage => p.kind === 'doc' && !!p.doc.release)
  return releases.sort((a, b) => b.doc.release!.published.localeCompare(a.doc.release!.published))[0]
}

/* URLs */

export const pageHref = (versionId: string, locale: string, route: string) =>
  `/${locale}/${versionId}${route === '/' ? '' : route}/`

export const markdownHref = (versionId: string, doc: Doc) => `/${doc.lang}/${versionId}${doc.route}${doc.format === 'html' ? '.html' : '.md'}`

export const homeMarkdownHref = (versionId: string, locale: string) => `/${locale}/${versionId}/index.md`

export const searchHref = (versionId: string, locale: string) => `/${locale}/${versionId}/search.json`

export const llmsHref = (versionId: string, locale: string) => `/${locale}/${versionId}/llms.txt`

export const assetHref = (sha: string, file: string) => `/_assets/${sha.slice(0, 12)}/${file}`

export const repoHref = (sha: string, file: string, directory = false) =>
  `https://github.com/${site.repository}/${directory ? 'tree' : 'blob'}/${sha}/${file}`

export function editHref(file: string): { href: string; branch: string } | undefined {
  const development = site.versions.find((v) => v.development)
  return development && { href: `https://github.com/${site.repository}/edit/${development.ref}/${file}`, branch: development.ref }
}
