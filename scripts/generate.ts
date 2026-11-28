// Write the outputs that sit beside the HTML pages, from the snapshots `pnpm sources` pinned:
// each document's Markdown (or HTML) source with links rewritten, the displayed repository
// assets, search indexes, llms.txt files, the sitemap and build.json. Nothing is written when a
// link or anchor does not resolve, or the Roadmap does not follow its format.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { site } from '../site.config'
import { homeMarkdown, homeModel } from '../lib/home'
import { sectionTitle } from '../lib/manifest'
import { htmlSections, renderDocument } from '../lib/markdown'
import { roadmapOf } from '../lib/roadmap'
import { allLocales, assetHref, docPages, homeMarkdownHref, llmsHref, nav, outputFile, pageHref, searchHref, sourceHref, versions, type NavNode } from '../lib/site'

const PUBLIC = path.join(process.cwd(), 'public')
const files = new Map<string, string | { copy: string }>()
const problems: string[] = []

const out = (href: string, body: string | { copy: string }) => files.set(path.join(PUBLIC, outputFile(href)), body)

for (const v of versions()) {
  const sha = v.source.sha
  // A group's documents under its heading, its own groups after them.
  const llmsGroup = (n: NavNode, parents: string[], locale: string): string[] => {
    const title = [...parents, sectionTitle(n.group, locale)]
    return [
      ...(n.pages.length
        ? [`### ${title.join(' / ')}`, '', ...n.pages.map((p) => `- [${p.doc.title}](${site.url}${sourceHref(v.id, p.doc)}): ${p.doc.path}${p.doc.lang === locale ? '' : ` (${p.doc.lang})`}`), '']
        : []),
      ...n.groups.flatMap((g) => llmsGroup(g, title, locale)),
    ]
  }

  for (const doc of v.docs.values()) {
    if (doc.format === 'html') {
      out(sourceHref(v.id, doc), { copy: path.join(v.source.root, doc.path) })
      continue
    }
    const rendered = renderDocument(v, doc, doc.lang)
    problems.push(...rendered.problems)
    out(sourceHref(v.id, doc), rendered.markdown)
    for (const asset of rendered.assets) out(assetHref(sha, asset), { copy: path.join(v.source.root, asset) })
  }

  for (const locale of v.locales) {
    // Every page as it is read in this language: its links and anchors must resolve too.
    const pages = docPages(v, locale)
    for (const p of pages) if (p.doc.format !== 'html') problems.push(...renderDocument(v, p.doc, locale).problems)
    // The Roadmap page reads its milestones and items from the source; what it cannot read stops here.
    for (const p of pages) if (p.doc.type === 'roadmap') problems.push(...roadmapOf(v, p.doc, locale).problems)
    try {
      out(homeMarkdownHref(v.id, locale), homeMarkdown(homeModel(v, locale)))
    } catch (error) {
      problems.push((error as Error).message)
    }

    // A result names its document, its section and its anchor; the page it opens is in that section.
    const records = pages.flatMap((page) => {
      const sections = page.doc.format === 'html' ? htmlSections(v, page.doc) : renderDocument(v, page.doc, locale).sections
      return sections.map((s) => ({
        href: pageHref(v.id, locale, page.route) + (s.anchor ? `#${s.anchor}` : ''),
        id: page.key,
        title: page.doc.title,
        heading: s.heading,
        sectionId: page.section.id,
        section: sectionTitle(page.section, locale),
        lang: page.doc.lang,
        path: page.doc.path,
        text: s.text,
      }))
    })
    out(searchHref(v.id, locale), JSON.stringify({ version: v.id, locale, sha, records }))

    const lines = [
      `# ${site.name} · ${v.label} · ${site.locales[locale] ?? locale}`,
      '',
      `> ${site.repository} at ${v.source.ref} ${sha}. Each link is the Markdown source of one page; ` +
        'a page without a version in this language links its original language.',
      '',
      `Home: ${site.url}${homeMarkdownHref(v.id, locale)}`,
      '',
      ...nav(v, locale).flatMap((s) => [`## ${sectionTitle(s.section, locale)}`, '', ...s.groups.flatMap((n) => llmsGroup(n, [], locale))]),
    ]
    out(llmsHref(v.id, locale), lines.join('\n'))
  }
}

out(
  'llms.txt',
  [
    `# ${site.name}`,
    '',
    `> Documentation of ${site.repository}, generated from its repository. One index per version and language:`,
    '',
    ...versions().flatMap((v) => v.locales.map((l) => `- [${v.label} · ${site.locales[l] ?? l}](${site.url}${llmsHref(v.id, l)}): ${v.source.ref} ${v.source.sha}`)),
    '',
  ].join('\n'),
)

out(
  'sitemap.xml',
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...versions().flatMap((v) => v.locales.flatMap((l) => (v.pages.get(l) ?? []).map((p) => `  <url><loc>${site.url}${pageHref(v.id, l, p.route)}</loc></url>`))),
    '</urlset>',
    '',
  ].join('\n'),
)

// What the site is built from: this repository's commit (Vercel names it; elsewhere the checkout's)
// and each version's snapshot, read by the Publish workflow (scripts/publish.ts) and by anyone
// asking which content the site serves.
function siteCommit(): string | null {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

out(
  'build.json',
  JSON.stringify(
    {
      site: siteCommit(),
      repository: site.repository,
      versions: versions().map((v) => ({ id: v.id, ref: v.source.ref, sha: v.source.sha, committed: v.source.committed })),
    },
    null,
    2,
  ) + '\n',
)

if (problems.length) {
  for (const p of [...new Set(problems)]) console.error(`generate: ${p}`)
  process.exit(1)
}

// Generated roots only; public/brand and public/icons belong to the site.
for (const root of [...allLocales(), '_assets', '_html', 'llms.txt', 'sitemap.xml', 'build.json']) rmSync(path.join(PUBLIC, root), { recursive: true, force: true })
for (const [file, body] of files) {
  mkdirSync(path.dirname(file), { recursive: true })
  if (typeof body === 'string') writeFileSync(file, body)
  else copyFileSync(body.copy, file)
}
console.log(`generate: ${files.size} files for ${versions().map((v) => `${v.id}@${v.source.sha.slice(0, 12)}`).join(', ')}`)
