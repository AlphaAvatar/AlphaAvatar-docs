'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'
import { isFiltered, parseView, results, sameFilters, statusCounts, viewSearch, type Filters, type View } from '@/lib/roadmap-view'

// The Roadmap's views (Figma "Docs / … / Roadmap"), one at a time:
// - the timeline: one compact card per milestone, grouped as the document groups them, each with
//   its items behind an expand control;
// - filtered results: the items meeting three independent filters, combined;
// - a milestone's full plan, chosen by the URL's anchor (the source's own anchors);
// - an item's details, over the others, named by the URL's `item`.
// The URL holds the filters, the expanded milestones and the open item, so reload, back and
// forward restore them; leaving the timeline for details or a plan keeps where it was (scroll,
// focus) to come back to. Without JavaScript everything is shown, one after the other.

export type ItemView = {
  id: string
  area: string
  areaName: string
  // Where the item sits in its milestone's full plan.
  anchor: string
  title: ReactNode
  text?: ReactNode
  status: string
  priority?: string
  date?: string
  notes?: ReactNode
}

export type MilestoneView = {
  id: string
  label: string
  version?: string
  theme: ReactNode
  summary?: ReactNode
  release: string
  released?: string
  notesHref?: string
  plan: ReactNode
  items: ItemView[]
}

type GroupView = { title: string; ids: string[]; milestones: MilestoneView[] }

type Props = {
  locale: string
  // The language of the Roadmap's text, when it is not the one being read.
  lang?: string
  breadcrumb: string
  title: { id?: string; text: string }
  intro: ReactNode
  source: string
  verified: string
  timeline: { heading: string; ids: string[] }
  groups: GroupView[]
  areas: { code: string; name: string }[]
  statuses: readonly string[]
  // Which full plan holds each anchor.
  planOf: Record<string, string>
  rest: ReactNode
}

const CHANGE = 'roadmap:view'
// Counts read from done to not started.
const PROGRESS = ['done', 'implemented', 'in-progress', 'planned', 'proposed']

function subscribe(listener: () => void) {
  for (const event of ['popstate', 'hashchange', CHANGE]) window.addEventListener(event, listener)
  return () => {
    for (const event of ['popstate', 'hashchange', CHANGE]) window.removeEventListener(event, listener)
  }
}

function go(url: string, push: boolean, state: object | null = null) {
  window.history[push ? 'pushState' : 'replaceState'](state, '', url)
  window.dispatchEvent(new Event(CHANGE))
}

// Where to come back to from details or a full plan: the timeline's URL, its scroll position and
// the control to focus. `pushed` says the timeline is the history entry right before.
type Return = { url: string; scrollY: number; focus: string; pushed: boolean }

const returnKey = () => `docs:roadmap-return:${window.location.pathname}`

function readReturn(): Return | null {
  try {
    return JSON.parse(sessionStorage.getItem(returnKey()) ?? 'null')
  } catch {
    return null
  }
}

function saveReturn(value: Return) {
  try {
    sessionStorage.setItem(returnKey(), JSON.stringify(value))
  } catch {}
}

// The visible control a return focuses: rows, cards and filter buttons carry `data-focus`.
function focusOn(key: string, scroll: boolean) {
  const found = [...document.querySelectorAll<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`)].find((e) => e.offsetParent !== null)
  found?.focus({ preventScroll: !scroll })
}

// Moving between views jumps; the page's smooth scrolling is for reading within one.
const jumpTo = (top: number) => window.scrollTo({ top, behavior: 'instant' })
const jumpToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'instant' })

export function Timeline({ locale, lang, breadcrumb, title, intro, source, verified, timeline, groups, areas, statuses, planOf, rest }: Props) {
  const t = strings(locale)
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => '')
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  const view = useMemo(() => parseView(search), [search])
  const anchor = decodeURIComponent(hash.slice(1))
  const plan = planOf[anchor]
  const kind = plan ? 'plan' : isFiltered(view) ? 'results' : 'timeline'

  const milestones = useMemo(() => groups.flatMap((g) => g.milestones), [groups])
  // The filter panel, open with its draft: nothing changes until the draft is applied.
  const [draft, setDraft] = useState<Filters | null>(null)
  const found = results(milestones, view)
  const selected = view.item ? results(milestones, {}).find((r) => r.item.id === view.item) : undefined

  const dialog = useRef<HTMLDialogElement>(null)
  // The filter button that opened the panel, by its data-focus.
  const opener = useRef('filters')
  const panelHeading = useRef<HTMLHeadingElement>(null)
  const resultsHeading = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef<'panel' | 'results' | 'opener' | null>(null)
  const shownItem = useRef<string | undefined>(undefined)
  const returning = useRef<Return | null>(null)
  const previousKind = useRef(kind)

  const path = () => window.location.pathname
  const here = (v: View) => path() + viewSearch(v)
  const nothing = { milestone: undefined, area: undefined, state: undefined }

  // Focus moves with the panel: into it on opening, to the results or back to its opener after.
  useEffect(() => {
    const next = focusNext.current
    focusNext.current = null
    if (next === 'panel') panelHeading.current?.focus()
    else if (next === 'results') resultsHeading.current?.focus()
    else if (next === 'opener') focusOn(opener.current, false)
  })

  // The details dialog follows the URL: opened by a link, reload or forward, closed by back.
  // Closing returns focus to the item's row.
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (selected) {
      shownItem.current = selected.item.id
      if (!d.open) d.showModal()
    } else if (d.open) {
      d.close()
      const id = shownItem.current
      shownItem.current = undefined
      if (id) requestAnimationFrame(() => focusOn(`item:${id}`, true))
    }
  }, [selected])

  // A full plan opens at its top, or at the anchor inside it. Coming back from one restores the
  // timeline as it was left; any other anchor is scrolled to once its view is shown.
  useEffect(() => {
    const was = previousKind.current
    previousKind.current = kind
    if (kind === 'plan') {
      requestAnimationFrame(() => (anchor === plan ? jumpTo(0) : jumpToId(anchor)))
      return
    }
    // A return (the button, or back to the timeline's own URL) restores where the timeline was
    // left; an anchor followed from a plan, such as a planning note, is shown instead.
    let back = returning.current
    returning.current = null
    if (!back && was === 'plan' && !anchor) {
      const kept = readReturn()
      if (kept && kept.url === path() + viewSearch({ ...view, item: undefined })) back = kept
    }
    if (back) {
      const { scrollY, focus } = back
      requestAnimationFrame(() => {
        if (scrollY >= 0) jumpTo(scrollY)
        focusOn(focus, scrollY < 0)
      })
    } else if (anchor) {
      requestAnimationFrame(() => jumpToId(anchor))
    }
    // `view` is read only when the kind changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, plan, anchor])

  /* Filters */

  const openPanel = (e: MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget.dataset.focus ?? 'filters'
    focusNext.current = 'panel'
    setDraft({ milestone: view.milestone, area: view.area, state: view.state })
  }
  const cancelPanel = () => {
    focusNext.current = 'opener'
    setDraft(null)
  }
  const apply = () => {
    const filters = draft ?? {}
    focusNext.current = isFiltered(filters) ? 'results' : 'opener'
    setDraft(null)
    if (!sameFilters(filters, view)) go(here({ ...view, ...nothing, ...filters, item: undefined }), true)
  }
  const clearAll = () => {
    focusNext.current = 'opener'
    opener.current = 'filters'
    go(here({ ...view, ...nothing, item: undefined }), true)
  }
  const toggle = (id: string) =>
    go(here({ ...view, expanded: view.expanded.includes(id) ? view.expanded.filter((e) => e !== id) : [...view.expanded, id] }), false)

  /* Details and full plans */

  const openItem = (id: string) => {
    saveReturn({ url: here({ ...view, item: undefined }), scrollY: window.scrollY, focus: `item:${id}`, pushed: true })
    go(here({ ...view, item: id }), true, { roadmapItem: true })
  }

  // Back to where the details were opened from, or, after a direct link, to the same filters with
  // the item's milestone expanded so its row can take the focus.
  const closeItem = () => {
    if (!view.item) return
    if (window.history.state?.roadmapItem) {
      window.history.back()
      return
    }
    const m = selected?.milestone.id
    const expanded = !isFiltered(view) && m && !view.expanded.includes(m) ? [...view.expanded, m] : view.expanded
    go(here({ ...view, item: undefined, expanded }), false)
  }

  // Leaving the details for an anchor of this page (the full plan, or a planning note): the item
  // is cleared and the way back still leads to the timeline the details were opened from.
  const leaveItemFor = (target: string) => {
    const kept = window.history.state?.roadmapItem ? readReturn() : null
    saveReturn({
      url: kept?.url ?? here({ ...view, item: undefined }),
      scrollY: kept?.scrollY ?? window.scrollY,
      focus: view.item ? `item:${view.item}` : (kept?.focus ?? ''),
      pushed: !!kept?.pushed,
    })
    shownItem.current = undefined
    go(`${path()}#${encodeURIComponent(target)}`, false, { roadmapPlan: true })
  }

  const openPlan = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    saveReturn({ url: here(view), scrollY: window.scrollY, focus: `plan:${id}`, pushed: true })
    go(`${path()}#${encodeURIComponent(id)}`, true, { roadmapPlan: true })
  }

  const backToTimeline = (id: string) => {
    const kept = window.history.state?.roadmapPlan ? readReturn() : null
    returning.current = kept ?? { url: path(), scrollY: -1, focus: `plan:${id}`, pushed: false }
    if (kept?.pushed) window.history.back()
    else go(returning.current.url, false)
  }

  // A link inside the details to this page's own anchor leaves the details for it.
  const onDetailsClick = (e: MouseEvent<HTMLElement>) => {
    const link = (e.target as HTMLElement).closest('a')
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
    const url = new URL(link.href, window.location.href)
    if (url.pathname !== path() || !url.hash) return
    e.preventDefault()
    leaveItemFor(decodeURIComponent(url.hash.slice(1)))
  }

  /* Pieces */

  const statusLabel = (s: string) => t.statusLabel[s] ?? s
  const dateLine = (m: MilestoneView) =>
    m.released
      ? t.releasedOn(m.released)
      : m.release === 'in-development'
        ? `${t.dateTbd} · ${t.notYetReleased}`
        : m.release === 'unscheduled'
          ? t.notScheduled
          : t.dateTbd
  const counts = (m: MilestoneView) =>
    m.release === 'released'
      ? t.doneOf(m.items.filter((i) => i.status === 'done').length, m.items.length)
      : [t.countItems(m.items.length), ...statusCounts(m.items, PROGRESS).map(([s, n]) => t.countStatus(n, statusLabel(s)))].join(' · ')

  const row = (m: MilestoneView, item: ItemView, withMilestone: boolean) => (
    <li key={item.id} className="rm-row">
      <button
        type="button"
        className="rm-row-open js-only"
        aria-haspopup="dialog"
        aria-label={`${t.viewDetails}: ${item.id}`}
        data-focus={`item:${item.id}`}
        onClick={() => openItem(item.id)}
      />
      <div className="rm-row-head">
        <p className="rm-row-title" lang={lang}>
          {item.title}
        </p>
        <span className="rm-status" data-status={item.status}>
          {statusLabel(item.status)}
        </span>
      </div>
      {item.text && (
        <p className="rm-row-text" lang={lang}>
          {item.text}
        </p>
      )}
      <p className="rm-row-meta">
        <code>{item.id}</code>
        {withMilestone && <span lang={lang}>{m.label}</span>}
        <span lang={lang}>{item.areaName}</span>
        {item.priority && <span>{item.priority}</span>}
        {item.date && <span>{item.date}</span>}
      </p>
      {item.notes && (
        <p className="rm-row-notes no-js" lang={lang}>
          {t.sourceAndNotes}: {item.notes}
        </p>
      )}
    </li>
  )

  const card = (m: MilestoneView) => {
    const open = view.expanded.includes(m.id)
    return (
      <li key={m.id} className="timeline-entry">
        <div className="timeline-rail" aria-hidden="true">
          <img src={m.release === 'in-development' ? '/icons/timeline-current.svg' : '/icons/timeline-node.svg'} width={12} height={12} alt="" />
        </div>
        <div className="timeline-content">
          <article className="rm-card" aria-labelledby={`rm-card-${m.id}`}>
            <div className="rm-version-line">
              <h3 id={`rm-card-${m.id}`} className="rm-version" lang={lang}>
                {m.label}
              </h3>
              <span className="rm-badge">{t.releaseLabel[m.release] ?? m.release}</span>
            </div>
            <p className="rm-date">{dateLine(m)}</p>
            <p className="rm-theme" lang={lang}>
              {m.theme}
            </p>
            {m.summary && (
              <p className="rm-summary" lang={lang}>
                {m.summary}
              </p>
            )}
            <p className="rm-counts">{counts(m)}</p>
            <div className="rm-actions">
              {m.items.length > 0 && (
                <button
                  type="button"
                  className="button js-only"
                  aria-expanded={open}
                  aria-controls={`rm-items-${m.id}`}
                  data-focus={`toggle:${m.id}`}
                  onClick={() => toggle(m.id)}
                >
                  {open ? t.collapseItems : t.expandItems}
                </button>
              )}
              <a className="button" href={`#${m.id}`} data-focus={`plan:${m.id}`} onClick={(e) => openPlan(e, m.id)}>
                {t.readPlan}
              </a>
              {m.notesHref && (
                <a className="button" href={m.notesHref}>
                  {t.releaseNotesShort}
                </a>
              )}
            </div>
          </article>
          {m.items.length > 0 && (
            <section id={`rm-items-${m.id}`} className="rm-items" data-off={open ? undefined : ''} aria-label={t.itemsIn(m.label)}>
              <h4 className="rm-items-title">{t.groupItems(m.items.length)}</h4>
              <ul className="rm-list">{m.items.map((i) => row(m, i, false))}</ul>
            </section>
          )}
        </div>
      </li>
    )
  }

  const fields = [
    { key: 'milestone', label: t.fieldTarget, all: t.allVersions, options: milestones.map((m) => ({ value: m.id, label: m.label })) },
    { key: 'area', label: t.fieldArea, all: t.allAreas, options: areas.map((a) => ({ value: a.code, label: a.name })) },
    { key: 'state', label: t.fieldStatus, all: t.allStatuses, options: statuses.map((s) => ({ value: s, label: statusLabel(s) })) },
  ] as const
  const chosen = (f: (typeof fields)[number], value?: string) => (value ? (f.options.find((o) => o.value === value)?.label ?? value) : f.all)
  const off = (hidden: boolean) => (hidden ? '' : undefined)

  return (
    <div className="rm" data-view={kind}>
      <header className="roadmap-head" data-off={off(kind === 'plan')}>
        <p className="eyebrow">{breadcrumb}</p>
        <h1 id={title.id} className="page-title" lang={lang}>
          {title.text}
        </h1>
        <div lang={lang}>{intro}</div>
        <p className="meta">{t.roadmapSource(source)}</p>
      </header>

      <div className="rm-toolbar js-only" data-off={off(kind !== 'timeline' || !!draft)}>
        <button type="button" className="button" data-focus="filters" onClick={openPanel}>
          {t.filterButton}
        </button>
        <span className="meta">
          {t.allVersions} · {t.allItemsShort}
        </span>
      </div>

      {draft && (
        <section className="rm-filter" aria-labelledby="rm-filter-title" onKeyDown={(e) => e.key === 'Escape' && cancelPanel()}>
          <h2 id="rm-filter-title" ref={panelHeading} tabIndex={-1}>
            {t.filterItems}
          </h2>
          <p className="meta">{t.filterIntro}</p>
          <div className="rm-fields">
            {fields.map((f) => (
              <div key={f.key} className="rm-field">
                <div className="rm-field-head">
                  <label htmlFor={`rm-field-${f.key}`}>{f.label}</label>
                  <button type="button" className="button" disabled={!draft[f.key]} aria-label={t.clearNamed(f.label)} onClick={() => setDraft({ ...draft, [f.key]: undefined })}>
                    {t.clear}
                  </button>
                </div>
                <select id={`rm-field-${f.key}`} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value || undefined })}>
                  <option value="">{f.all}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="meta">{t.filterHint}</p>
          <div className="rm-actions">
            <button type="button" className="button primary" onClick={apply}>
              {t.showResults(results(milestones, draft).length)}
            </button>
            <button type="button" className="button" onClick={() => setDraft({})}>
              {t.clearAll}
            </button>
            <button type="button" className="button" onClick={cancelPanel}>
              {t.cancel}
            </button>
          </div>
        </section>
      )}

      {kind === 'results' && (
        <section className="rm-results" aria-labelledby="rm-results-title" data-off={off(!!draft)}>
          <div className="rm-results-head">
            <h2 id="rm-results-title" ref={resultsHeading} tabIndex={-1} aria-live="polite">
              {t.resultsCount(found.length)}
            </h2>
            <div className="rm-actions">
              <button type="button" className="button" data-focus="filters-results" onClick={openPanel}>
                {t.filterItems}
              </button>
              <button type="button" className="button" onClick={clearAll}>
                {t.clearAll}
              </button>
            </div>
          </div>
          <ul className="rm-chips" aria-label={t.appliedFilters}>
            {fields.map((f) => (
              <li key={f.key} className="tag">
                {chosen(f, view[f.key])}
              </li>
            ))}
          </ul>
          {found.length > 0 ? (
            <ul className="rm-list">{found.map(({ milestone, item }) => row(milestone, item, true))}</ul>
          ) : (
            <div className="rm-empty" role="status">
              <h3>{t.noResultsTitle}</h3>
              <p>{t.noResultsBody}</p>
              <div className="rm-actions">
                <button type="button" className="button" data-focus="filters-empty" onClick={openPanel}>
                  {t.changeFilters}
                </button>
                <button type="button" className="button" onClick={clearAll}>
                  {t.clearAll}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="roadmap-timeline" id={timeline.ids[0]} data-off={off(kind !== 'timeline' || !!draft)} aria-label={timeline.heading || undefined}>
        {timeline.ids.slice(1).map((id) => (
          <span key={id} id={id} className="anchor" />
        ))}
        {groups.map((g, i) => (
          <section key={g.ids[0] ?? i} className="rm-group" aria-labelledby={g.ids[0] ?? `rm-group-${i}`}>
            {g.ids.slice(1).map((id) => (
              <span key={id} id={id} className="anchor" />
            ))}
            <h2 id={g.ids[0] ?? `rm-group-${i}`} className="rm-group-title" lang={lang}>
              {g.title}
            </h2>
            <ol className="timeline">{g.milestones.map(card)}</ol>
          </section>
        ))}
      </section>

      {milestones.map((m) => (
        <section key={m.id} className="rm-plan" data-plan={m.id} data-off={off(plan !== m.id)} aria-labelledby={`rm-plan-${m.id}`}>
          <p className="eyebrow">{breadcrumb}</p>
          <h2 id={`rm-plan-${m.id}`} className="page-title" lang={lang}>
            {t.fullPlan(m.label)}
          </h2>
          <p className="meta">{t.roadmapSource(source)}</p>
          <div className="js-only">
            <button type="button" className="button" onClick={() => backToTimeline(m.id)}>
              {t.backToTimeline}
            </button>
          </div>
          <p className="rm-plan-theme" lang={lang}>
            {m.theme}
          </p>
          <p className="meta">
            {t.releaseLabel[m.release] ?? m.release} · {dateLine(m)} · {counts(m)}
          </p>
          <div className="prose" lang={lang}>
            {m.plan}
          </div>
          <div className="js-only">
            <button type="button" className="button" onClick={() => backToTimeline(m.id)}>
              {t.backToTimeline}
            </button>
          </div>
        </section>
      ))}

      <div className="prose roadmap-rest" lang={lang} data-off={off(kind === 'plan')}>
        {rest}
      </div>

      <dialog
        ref={dialog}
        className="rm-detail"
        aria-labelledby="rm-detail-title"
        onCancel={(e) => {
          e.preventDefault()
          closeItem()
        }}
        onClick={(e) => e.target === e.currentTarget && closeItem()}
      >
        {selected && (
          <div className="rm-detail-body" onClick={onDetailsClick}>
            <p className="eyebrow">{breadcrumb}</p>
            <h2 id="rm-detail-title" className="page-title" lang={lang}>
              {selected.item.title}
            </h2>
            <p className="meta">{t.roadmapSource(source)}</p>
            <p className="rm-detail-id">
              <span lang={lang}>{selected.milestone.label}</span> · <code>{selected.item.id}</code> · {statusLabel(selected.item.status)}
            </p>
            <hr className="divider" />
            {selected.item.text && (
              <p className="rm-detail-text" lang={lang}>
                {selected.item.text}
              </p>
            )}
            <dl className="rm-fields-list">
              <div>
                <dt>{t.field.area}</dt>
                <dd lang={lang}>
                  {selected.item.areaName} · <code>{selected.item.area}</code>
                </dd>
              </div>
              {selected.item.priority && (
                <div>
                  <dt>{t.field.priority}</dt>
                  <dd>{selected.item.priority}</dd>
                </div>
              )}
              {selected.item.date && (
                <div>
                  <dt>{t.field.date}</dt>
                  <dd>{selected.item.date}</dd>
                </div>
              )}
              <div>
                <dt>{t.field.release}</dt>
                <dd>
                  {t.releaseLabel[selected.milestone.release] ?? selected.milestone.release} · {dateLine(selected.milestone)}
                </dd>
              </div>
            </dl>
            {selected.item.notes && (
              <section className="rm-detail-notes">
                <h3>{t.sourceAndNotes}</h3>
                <p lang={lang}>{selected.item.notes}</p>
              </section>
            )}
            <p className="meta">{t.detailNote}</p>
            <div className="rm-actions">
              <button type="button" className="button" onClick={closeItem}>
                {t.closeDetails}
              </button>
              <a className="button" href={`#${selected.item.anchor}`}>
                {t.readPlanNotes}
              </a>
            </div>
            <p className="meta">{t.planLinkNote}</p>
            <hr className="divider" />
            <p className="meta">
              {verified}
              <br />
              {t.verifiedNote}
            </p>
          </div>
        )}
      </dialog>
    </div>
  )
}
