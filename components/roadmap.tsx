import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'
import { strings } from '@/lib/i18n'
import { sectionTitle } from '@/lib/manifest'
import { roadmapOf, STATUSES } from '@/lib/roadmap'
import type { DocPage, Version } from '@/lib/site'
import { FallbackNotice, Markdown, Pager, SourceLinks } from './article'
import { Timeline, type MilestoneView } from './timeline'

// The Roadmap page (Figma "Docs / … / Roadmap"): the document's title and lead, its milestones as
// compact cards grouped as the document groups them, each milestone's full plan, then the rest of
// the document as written. components/timeline.tsx decides which of them is shown.
export function RoadmapArticle({ v, page }: { v: Version; page: DocPage }) {
  const { doc, locale } = page
  const t = strings(locale)
  const r = roadmapOf(v, doc, locale)
  const lang = doc.lang === locale ? undefined : doc.lang
  const md = (hast?: Root) => hast && <Markdown hast={hast} locale={locale} />
  const areaName = new Map(r.areas.map((a) => [a.code, a.name]))
  const byId = new Map(r.milestones.map((m) => [m.id, m]))

  // Which full plan holds each anchor: the URL's anchor chooses the plan shown.
  const planOf: Record<string, string> = {}
  for (const m of r.milestones) {
    visit(m.plan, 'element', (e: Element) => {
      if (e.properties.id) planOf[String(e.properties.id)] = m.id
    })
  }

  const view = (id: string): MilestoneView => {
    const m = byId.get(id)!
    return {
      id: m.id,
      label: m.label,
      version: m.version,
      theme: md(m.theme),
      summary: md(m.summary),
      release: m.release,
      released: m.released,
      notesHref: m.notesHref,
      plan: md(m.plan),
      items: m.areas.flatMap((a) =>
        a.items.map((i) => ({
          id: i.id,
          area: i.area,
          areaName: areaName.get(i.area) ?? i.area,
          anchor: i.anchor,
          title: md(i.title),
          text: md(i.text),
          status: i.status,
          priority: i.priority,
          date: i.date,
          notes: md(i.notes),
        })),
      ),
    }
  }

  return (
    <div className="reading">
      <article className="article roadmap">
        <FallbackNotice v={v} page={page} />
        <Timeline
          locale={locale}
          lang={lang}
          breadcrumb={[page.section, ...page.groups].map((s) => sectionTitle(s, locale)).join(' / ')}
          title={{ id: r.title?.id, text: r.title?.text ?? doc.title }}
          intro={
            <>
              {r.preamble.children.length > 0 && <div className="roadmap-preamble">{md(r.preamble)}</div>}
              {r.lead && <div className="roadmap-lead">{md(r.lead)}</div>}
            </>
          }
          source={doc.path}
          verified={t.verified(v.source.ref, v.source.sha.slice(0, 7), v.source.committed.slice(0, 10))}
          timeline={r.timeline}
          groups={r.groups.map((g) => ({ title: g.heading.text, ids: g.ids, milestones: g.milestones.map(view) }))}
          areas={r.areas}
          statuses={STATUSES}
          planOf={planOf}
          rest={md(r.rest)}
        />
        <hr className="divider" />
        <Pager v={v} page={page} />
        <p className="meta">{t.roadmapFrom(doc.path)}</p>
        <hr className="divider" />
        <SourceLinks v={v} page={page} />
      </article>
    </div>
  )
}
