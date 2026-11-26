import type { Element, ElementContent, Root } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { toString } from 'hast-util-to-string'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { site } from '@/site.config'
import { strings } from '@/lib/i18n'
import { renderDocument } from '@/lib/markdown'
import {
  editHref,
  latestRelease,
  markdownHref,
  nav,
  neighbours,
  pageByKey,
  pageHref,
  repoHref,
  sectionEntry,
  type DocPage,
  type SectionPage,
  type Version,
} from '@/lib/site'
import { CopyButton } from './copy'
import { Toc } from './navigation'
import { localeLabel } from './shell'

const SHELL = new Set(['bash', 'sh', 'shell', 'console', 'zsh', 'shellsession'])

// The source's HTML tree as React; code blocks get a copy control outside their scrolling area
// and tables scroll in their own region.
function Markdown({ hast, locale }: { hast: Root; locale: string }) {
  const t = strings(locale)
  const components: Partial<Components> = {
    pre: ({ node, ...props }) => {
      const code = node?.children.find((c: ElementContent): c is Element => c.type === 'element' && c.tagName === 'code')
      const lang = (code?.properties.className as string[] | undefined)?.find((c) => c.startsWith('language-'))?.slice(9)
      return (
        <div className="code-block">
          <div className="code-toolbar">
            <span>{lang ? (SHELL.has(lang) ? t.terminal : lang) : ''}</span>
            <CopyButton text={toString(node!).replace(/\n$/, '')} label={t.copyCode} locale={locale} />
          </div>
          <pre {...props} />
        </div>
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

function FallbackNotice({ v, page }: { v: Version; page: DocPage }) {
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

function SourceLinks({ v, page }: { v: Version; page: DocPage }) {
  const t = strings(page.locale)
  const edit = editHref(page.doc.path)
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

export function DocArticle({ v, page }: { v: Version; page: DocPage }) {
  const { doc, locale } = page
  const t = strings(locale)
  const rendered = doc.format === 'html' ? undefined : renderDocument(v, doc, locale)
  const { previous, next } = neighbours(v, page)
  const status = t.status[doc.status]

  return (
    <div className="reading">
      <article className="article">
        <FallbackNotice v={v} page={page} />
        <PageActions v={v} page={page} />
        <div>
          <p className="eyebrow">{page.section.title}</p>
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
        <nav className="pager" aria-label={`${t.previous} / ${t.next}`}>
          {previous && (
            <a className="button" href={pageHref(v.id, locale, previous.route)} rel="prev">
              {t.previous}: {previous.doc.title}
            </a>
          )}
          {next && (
            <a className="button" href={pageHref(v.id, locale, next.route)} rel="next">
              {t.next}: {next.doc.title}
            </a>
          )}
        </nav>
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

export function SectionIndex({ v, page }: { v: Version; page: SectionPage }) {
  const t = strings(page.locale)
  return (
    <div className="reading">
      <div className="article">
        <div>
          <p className="eyebrow">{t.sectionOverview}</p>
          <h1 className="page-title">{page.section.title}</h1>
          <p className="meta">
            {t.snapshot(v.label, v.source.sha.slice(0, 8))} · {t.documents(page.pages.length)}
          </p>
        </div>
        <div className="cards">
          {page.pages.map((p) => (
            <a key={p.key} className="card" href={pageHref(v.id, page.locale, p.route)}>
              <span className="card-title" lang={p.doc.lang}>
                {p.doc.title}
              </span>
              <span className="meta">
                {localeLabel(p.doc.lang)}
                {t.status[p.doc.status] && ` · ${t.status[p.doc.status][0]}`}
                {p.doc.release && ` · ${t.published(p.doc.release.published)}`}
              </span>
              <span className="card-path">{p.doc.path}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Home({ v, page }: { v: Version; page: DocPage }) {
  const { locale } = page
  const t = strings(locale)
  const release = latestRelease(v, locale)
  const groups = nav(v, locale)
  const rendered = renderDocument(v, page.doc, locale)

  return (
    <div className="home">
      {release?.doc.release && (
        <section className="spotlight">
          <div style={{ flex: 1 }}>
            <span className="tag">{t.latestRelease}</span>
            <h1>AlphaAvatar {release.doc.release.tag}</h1>
            <p className="meta">{t.published(release.doc.release.published)}</p>
          </div>
          <a className="button primary" href={pageHref(v.id, locale, release.route)}>
            {t.releaseNotes}
          </a>
        </section>
      )}
      <div className="cards portals">
        {site.header.map((id) => {
          const group = groups.find((g) => g.section.id === id)
          const entry = sectionEntry(v, locale, id)
          if (!group || !entry) return null
          return (
            <section key={id} className="card portal">
              <span className="eyebrow">{t.documents(group.pages.length)}</span>
              <div>
                <h2>
                  <a href={pageHref(v.id, locale, entry.route)} style={{ color: 'inherit' }}>
                    {group.section.title}
                  </a>
                </h2>
                <ul>
                  {group.pages.slice(0, 4).map((p) => (
                    <li key={p.key}>
                      <a href={pageHref(v.id, locale, p.route)} lang={p.doc.lang}>
                        {p.doc.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )
        })}
      </div>
      <section>
        <h2 className="home-heading">{t.allSections}</h2>
        <ul className="section-rows">
          {groups
            .filter((g) => g.pages.some((p) => p.route !== '/'))
            .map((g) => (
              <li key={g.section.id}>
                <a href={pageHref(v.id, locale, sectionEntry(v, locale, g.section.id)!.route)}>
                  <span>{g.section.title}</span>
                  <span className="meta">{t.documents(g.pages.length)}</span>
                </a>
              </li>
            ))}
        </ul>
      </section>
      <div className="home-readme article" style={{ padding: 0 }}>
        <FallbackNotice v={v} page={page} />
        <PageActions v={v} page={page} />
        <div className="prose" lang={page.doc.lang}>
          <Markdown hast={rendered.hast} locale={locale} />
        </div>
        <hr className="divider" />
        <SourceLinks v={v} page={page} />
      </div>
    </div>
  )
}
