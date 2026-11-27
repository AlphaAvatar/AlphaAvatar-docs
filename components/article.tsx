import type { Element, ElementContent, Root } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { toString } from 'hast-util-to-string'
import type { ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { highlight } from '@/lib/highlight'
import type { Run } from '@/lib/terminal'
import { strings } from '@/lib/i18n'
import { sectionTitle, textIn } from '@/lib/manifest'
import { renderDocument } from '@/lib/markdown'
import {
  editHref,
  groupEntry,
  markdownHref,
  nav,
  neighbours,
  pageByKey,
  pageHref,
  repoHref,
  type DocPage,
  type NavNode,
  type ReleasesPage,
  type SectionPage,
  type Version,
} from '@/lib/site'
import { CodeBlock } from './code'
import { CopyButton } from './copy'
import { Diagram } from './diagram'
import { Toc } from './navigation'
import { localeLabel } from './shell'

const TOKEN: Record<string, string> = { comment: 'tok-comment', keyword: 'tok-keyword', string: 'tok-string', key: 'tok-key', command: 'tok-command' }

// Lines joined by newlines, each line's pieces as spans.
function joinLines<T>(lines: T[][], piece: (part: T, i: number) => ReactNode): ReactNode[] {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {line.map(piece)}
      {i < lines.length - 1 && '\n'}
    </Fragment>
  ))
}

// The source's HTML tree as React. A code block is one of three kinds, by what the source says
// it is, never by its words: a recording (```terminal NAME) in the recording's own colors; a
// language this site reads, colored by its grammar; anything else as plain text. Tables scroll
// in their own region and Mermaid blocks are drawn once the page runs.
export function Markdown({ hast, locale }: { hast: Root; locale: string }) {
  const t = strings(locale)
  const components: Partial<Components> = {
    pre: ({ node, ...props }) => {
      const code = node?.children.find((c: ElementContent): c is Element => c.type === 'element' && c.tagName === 'code')
      const lang = (code?.properties.className as string[] | undefined)?.find((c) => c.startsWith('language-'))?.slice(9)
      const text = toString(node!).replace(/\n$/, '')
      if (lang === 'mermaid') {
        return (
          <Diagram code={text} locale={locale}>
            <pre {...props} />
          </Diagram>
        )
      }
      const recording = code?.data?.recording
      if (recording) {
        return (
          <CodeBlock kind="terminal" label={t.terminalAnsi} text={recording.text} lines={recording.lines.length} locale={locale}>
            {joinLines(recording.lines, (run: Run, i) =>
              run.color || run.bold ? (
                <span key={i} style={{ color: run.color, fontWeight: run.bold ? 700 : undefined }}>
                  {run.text}
                </span>
              ) : (
                run.text
              ),
            )}
          </CodeBlock>
        )
      }
      const colored = highlight(lang, text)
      if (colored) {
        return (
          <CodeBlock kind="source" label={colored.label} text={text} lines={colored.lines.length} locale={locale}>
            {joinLines(colored.lines, (token, i) =>
              token.kind ? (
                <span key={i} className={TOKEN[token.kind]}>
                  {token.text}
                </span>
              ) : (
                token.text
              ),
            )}
          </CodeBlock>
        )
      }
      return (
        <CodeBlock kind="plain" label={lang && lang !== 'text' ? lang : t.plainText} text={text} lines={text.split('\n').length} locale={locale}>
          {text}
        </CodeBlock>
      )
    },
    table: ({ node, ...props }) => (
      <div className="table-scroll" tabIndex={0}>
        <table {...props} />
      </div>
    ),
    img: ({ node, alt, ...props }) => <img loading="lazy" alt={alt ?? ''} {...props} />,
    // The site is dark only: a <picture> offering both colour schemes shows its dark source.
    source: ({ node, media, ...props }) =>
      media?.includes('prefers-color-scheme: light') ? null : <source {...props} media={media?.includes('prefers-color-scheme') ? undefined : media} />,
  }
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, passNode: true, components })
}

export function FallbackNotice({ v, page }: { v: Version; page: DocPage }) {
  if (page.doc.lang === page.locale) return null
  const t = strings(page.locale)
  const original = pageByKey(v, page.doc.lang, page.key)!
  return (
    <>
      <div className="callout" role="note">
        <strong>{t.fallbackTitle(localeLabel(page.locale))}</strong>
        <p>{t.fallbackBody(localeLabel(page.doc.lang))}</p>
      </div>
      <div>
        <a className="button" href={pageHref(v.id, page.doc.lang, original.route)} lang={page.doc.lang}>
          {t.useLanguage(localeLabel(page.doc.lang))}
        </a>
      </div>
    </>
  )
}

export function SourceLinks({ v, page }: { v: Version; page: DocPage }) {
  const t = strings(page.locale)
  const edit = editHref(v, page.doc.path)
  return (
    <div className="source-links">
      <a href={markdownHref(v.id, page.doc)}>{page.doc.format === 'html' ? t.viewHtml : t.viewMarkdown}</a>
      <a href={repoHref(v.source.sha, page.doc.path)}>{t.viewSource}</a>
      {edit && (
        <>
          <a href={edit.href}>{t.editSource(edit.branch)}</a>
          <p>{t.editNote(edit.branch)}</p>
        </>
      )}
    </div>
  )
}

export function Pager({ v, page }: { v: Version; page: DocPage }) {
  const t = strings(page.locale)
  const { previous, next } = neighbours(v, page)
  return (
    <nav className="pager" aria-label={`${t.previous} / ${t.next}`}>
      {previous && (
        <a className="button" href={pageHref(v.id, page.locale, previous.route)} rel="prev">
          {t.previous}: {previous.doc.title}
        </a>
      )}
      {next && (
        <a className="button" href={pageHref(v.id, page.locale, next.route)} rel="next">
          {t.next}: {next.doc.title}
        </a>
      )}
    </nav>
  )
}

function PageActions({ v, page }: { v: Version; page: DocPage }) {
  const t = strings(page.locale)
  return (
    <div className="page-actions">
      <span className="tag">{v.label}</span>
      <span className="spacer" />
      {page.doc.format !== 'html' && <CopyButton url={markdownHref(v.id, page.doc)} label={t.copyMarkdown} locale={page.locale} />}
    </div>
  )
}

// Where a document sits: its section, then its groups.
export function Breadcrumb({ page }: { page: DocPage }) {
  return <p className="eyebrow">{[page.section, ...page.groups].map((s) => sectionTitle(s, page.locale)).join(' / ')}</p>
}

export function DocArticle({ v, page }: { v: Version; page: DocPage }) {
  const { doc, locale } = page
  const t = strings(locale)
  const rendered = doc.format === 'html' ? undefined : renderDocument(v, doc, locale)
  const status = t.status[doc.status]

  return (
    <div className="reading">
      <article className="article">
        <FallbackNotice v={v} page={page} />
        <PageActions v={v} page={page} />
        <div>
          <Breadcrumb page={page} />
          <p className="meta">
            {t.snapshot(v.label, v.source.sha.slice(0, 8))} · {page.doc.lang === locale ? localeLabel(doc.lang) : t.original(localeLabel(doc.lang))}
          </p>
          {doc.release && <p className="meta">{t.published(doc.release.published)}</p>}
        </div>
        {status && (
          <div className="callout" role="note">
            <strong>{status[0]}</strong>
            <p>{status[1]}</p>
          </div>
        )}
        {rendered ? (
          <div className="prose" lang={doc.lang}>
            <Markdown hast={rendered.hast} locale={locale} />
          </div>
        ) : (
          <>
            <iframe className="html-frame" src={markdownHref(v.id, doc)} title={doc.title} sandbox="" />
            <p className="meta">{t.htmlFrame}</p>
          </>
        )}
        <hr className="divider" />
        <Pager v={v} page={page} />
        <p className="meta">{t.maintained}</p>
        <hr className="divider" />
        <SourceLinks v={v} page={page} />
      </article>
      <aside className="toc">
        <Toc entries={rendered?.headings ?? []} locale={locale} />
        <hr className="divider" />
        <div className="source-links">
          <p>{t.readSource}</p>
          <a href={repoHref(v.source.sha, doc.path)}>{t.viewSource}</a>
        </div>
      </aside>
    </div>
  )
}

// What a group's card says beside its summary: how many documents, per subgroup, and which are
// planned or illustrative.
function groupCounts(node: NavNode, locale: string): string {
  const t = strings(locale)
  const pages = [...node.pages, ...node.groups.flatMap((g) => g.pages)]
  const parts = [t.documents(pages.length)]
  if (node.groups.length) parts.push(node.groups.map((g) => `${sectionTitle(g.group, locale)} ${g.pages.length}`).join(t.listJoin))
  for (const status of ['planned', 'illustrative'] as const) {
    const n = pages.filter((p) => p.doc.status === status).length
    if (n) parts.push(t.statusCountOf(n, t.status[status][0]))
  }
  return parts.join(' · ')
}

// A section's entry page: its summary, then one card per group leading to its first page.
export function SectionIndex({ v, page }: { v: Version; page: SectionPage }) {
  const { locale, section } = page
  const t = strings(locale)
  const groups = nav(v, locale).find((s) => s.section.id === section.id)?.groups ?? []
  const card = (node: NavNode) => {
    const entry = groupEntry(v, locale, node.group.id)
    const action = entry?.kind === 'releases' ? t.browseReleases : entry?.kind === 'doc' ? t.startWith(entry.doc.title) : undefined
    return (
      <article key={node.group.id} className="entry-card" aria-labelledby={`group-${node.group.id}`}>
        <h2 id={`group-${node.group.id}`}>{sectionTitle(node.group, locale)}</h2>
        {node.group.summary && <p>{textIn(node.group.summary, locale)}</p>}
        <p className="meta">{groupCounts(node, locale)}</p>
        {entry && action && (
          <a href={pageHref(v.id, locale, entry.route)} lang={entry.kind === 'doc' && entry.doc.lang !== locale ? entry.doc.lang : undefined}>
            {action}
          </a>
        )}
      </article>
    )
  }
  return (
    <div className="reading">
      <div className="article">
        <div>
          <p className="eyebrow">{sectionTitle(section, locale)}</p>
          <h1 className="page-title">{sectionTitle(section, locale)}</h1>
          <p className="lead">{textIn(section.summary, locale)}</p>
          <p className="meta">
            {t.documents(page.pages.length)} · {t.snapshot(v.label, v.source.sha.slice(0, 8))}
          </p>
        </div>
        <div className="entry-cards">{groups.map(card)}</div>
        <hr className="divider" />
        <p className="meta">{t.entryNote}</p>
      </div>
    </div>
  )
}

// A group's release notes, newest first, with the day each was published.
export function ReleasesIndex({ v, page }: { v: Version; page: ReleasesPage }) {
  const { locale } = page
  const t = strings(locale)
  const pages = [...page.pages].sort((a, b) => b.doc.release!.published.localeCompare(a.doc.release!.published))
  return (
    <div className="reading">
      <div className="article">
        <div>
          <p className="eyebrow">{[page.section, page.group].map((s) => sectionTitle(s, locale)).join(' / ')}</p>
          <h1 className="page-title">{sectionTitle(page.group, locale)}</h1>
          <p className="meta">
            {t.documents(pages.length)} · {t.snapshot(v.label, v.source.sha.slice(0, 8))}
          </p>
        </div>
        <div className="cards">
          {pages.map((p) => (
            <a key={p.key} className="card" href={pageHref(v.id, locale, p.route)}>
              <span className="card-title" lang={p.doc.lang}>
                {p.doc.title}
              </span>
              <span className="meta">
                {t.published(p.doc.release!.published)}
                {p.doc.lang !== locale && ` · ${t.original(localeLabel(p.doc.lang))}`}
              </span>
              <span className="card-path">{p.doc.path}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
