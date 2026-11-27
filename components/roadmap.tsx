import type { Root } from 'hast'
import { strings } from '@/lib/i18n'
import { roadmapOf, STATUSES } from '@/lib/roadmap'
import { pageHref, sectionEntry, type DocPage, type Version } from '@/lib/site'
import { FallbackNotice, Markdown, Pager, SourceLinks } from './article'
import { Timeline, type MilestoneView } from './timeline'

// The Roadmap page (Figma "Docs / … / Roadmap"): the document's title and lead, its milestones
// as a timeline, then the rest of the document as written.
export function RoadmapArticle({ v, page }: { v: Version; page: DocPage }) {
  const { doc, locale } = page
  const t = strings(locale)
  const r = roadmapOf(v, doc, locale)
  const lang = doc.lang === locale ? undefined : doc.lang
  const md = (hast?: Root) => hast && <Markdown hast={hast} locale={locale} />
  const releases = sectionEntry(v, locale, 'releases')

  const milestones: MilestoneView[] = r.milestones.map((m) => ({
    id: m.id,
    anchors: m.anchors,
    headingId: m.heading.id,
    label: m.label,
    version: m.version,
    theme: md(m.theme),
    release: m.release,
    released: m.released,
    notes: md(m.notes),
    notesHref: m.notesHref,
    details: md(m.details),
    areas: m.areas.map((a) => ({
      id: a.heading?.id,
      title: a.heading?.text,
      anchors: a.anchors,
      items: a.items.map((i) => ({ ...i, title: md(i.title), text: md(i.text), notes: md(i.notes) })),
    })),
  }))

  return (
    <div className="reading">
      <article className="article roadmap">
        <FallbackNotice v={v} page={page} />
        <header className="roadmap-head">
          <p className="eyebrow">{t.roadmapEyebrow}</p>
          <h1 id={r.title?.id} className="page-title" lang={lang}>
            {r.title?.text}
          </h1>
          {r.preamble.children.length > 0 && (
            <div className="roadmap-preamble" lang={lang}>
              {md(r.preamble)}
            </div>
          )}
          {r.lead && (
            <div className="roadmap-lead" lang={lang}>
              {md(r.lead)}
            </div>
          )}
          <p className="meta">{t.roadmapSnapshot(v.source.ref, v.source.sha.slice(0, 8))}</p>
        </header>
        <Timeline
          locale={locale}
          lang={lang}
          ids={r.timeline.ids}
          heading={r.timeline.heading}
          milestones={milestones}
          statuses={STATUSES}
          releases={releases && pageHref(v.id, locale, releases.route)}
        />
        <hr className="divider" />
        <div className="prose" lang={doc.lang}>
          {md(r.rest)}
        </div>
        <hr className="divider" />
        <Pager v={v} page={page} />
        <p className="meta">{t.roadmapFrom(doc.path)}</p>
        <hr className="divider" />
        <SourceLinks v={v} page={page} />
      </article>
    </div>
  )
}
