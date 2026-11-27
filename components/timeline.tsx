'use client'

import { useEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'

// The Roadmap timeline (Figma "Docs / … / Roadmap"): one card per milestone in Timeline order,
// its items behind an expand control, a filter dialog and an item dialog. The server renders
// every milestone and item, expanded for a page without JavaScript; filters, expanded milestones
// and the open item live in the URL, so reload, back and forward restore them.

export type ItemView = {
  id: string
  area: string
  title: ReactNode
  text?: ReactNode
  status: string
  priority?: string
  date?: string
  notes?: ReactNode
}

export type AreaView = { id?: string; title?: string; anchors: string[]; items: ItemView[] }

export type MilestoneView = {
  id: string
  anchors: string[]
  headingId: string
  label: string
  version?: string
  theme: ReactNode
  release: string
  released?: string
  notes?: ReactNode
  notesHref?: string
  details: ReactNode
  areas: AreaView[]
}

type View = { state?: string; target?: string; open: string[]; item?: string }

const CHANGE = 'roadmap:view'

function parse(search: string): View {
  const q = new URLSearchParams(search)
  return { state: q.get('state') ?? undefined, target: q.get('target') ?? undefined, open: q.getAll('open'), item: q.get('item') ?? undefined }
}

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(CHANGE, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(CHANGE, listener)
  }
}

// Filters and the open item add history entries; expanding a milestone replaces the current one.
function update(change: Partial<View>, push: boolean) {
  const view = { ...parse(window.location.search), ...change }
  const q = new URLSearchParams()
  if (view.state) q.set('state', view.state)
  if (view.target) q.set('target', view.target)
  for (const id of view.open) q.append('open', id)
  if (view.item) q.set('item', view.item)
  const search = q.toString()
  window.history[push ? 'pushState' : 'replaceState'](null, '', `${window.location.pathname}${search && `?${search}`}${window.location.hash}`)
  window.dispatchEvent(new Event(CHANGE))
}

// Without JavaScript nothing is filtered or collapsed; on the server the view is empty.
function useView(): View {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => '')
  return useMemo(() => parse(search), [search])
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
)

type Props = {
  locale: string
  // The language of the Roadmap's text, when it is not the one being read.
  lang?: string
  ids: string[]
  heading: string
  milestones: MilestoneView[]
  statuses: readonly string[]
  releases?: string
}

export function Timeline({ locale, lang, ids, heading, milestones, statuses, releases }: Props) {
  const t = strings(locale)
  const view = useView()
  const filterDialog = useRef<HTMLDialogElement>(null)
  const filterButton = useRef<HTMLButtonElement>(null)
  const itemDialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const pushed = useRef(false)

  const matches = (item: ItemView) => !view.state || item.status === view.state
  const shown = (m: MilestoneView) => (!view.target || m.id === view.target) && (!view.state || m.areas.some((a) => a.items.some(matches)))
  const visible = milestones.filter(shown)

  const selected = milestones.flatMap((milestone) =>
    milestone.areas.flatMap((area) => area.items.filter((i) => i.id === view.item).map((item) => ({ milestone, area, item }))),
  )[0]
  const itemOpen = !!selected

  // The item dialog follows the URL: opened by a link, reload or forward, closed by back.
  useEffect(() => {
    const dialog = itemDialog.current
    if (itemOpen && !dialog?.open) dialog?.showModal()
    if (!itemOpen && dialog?.open) dialog.close()
  }, [itemOpen])

  // An anchor inside a collapsed milestone expands it. On load the anchor is scrolled to again
  // once the URL's view is applied, since milestones expanded above it move it.
  useEffect(() => {
    const reveal = (load: boolean) => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      const target = id ? document.getElementById(id) : null
      if (!target) return
      const milestone = target.closest<HTMLElement>('.rm-items')?.dataset.milestone
      const { open } = parse(window.location.search)
      const collapsed = !!milestone && !open.includes(milestone)
      if (collapsed) update({ open: [...open, milestone] }, false)
      if (load || collapsed) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant' }))
    }
    const onHash = () => reveal(false)
    reveal(true)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function closeItem() {
    if (parse(window.location.search).item) {
      if (pushed.current) window.history.back()
      else update({ item: undefined }, false)
    }
    pushed.current = false
    const target = opener.current ?? document.querySelector<HTMLElement>(`[data-item="${CSS.escape(selected?.item.id ?? '')}"]`)
    target?.focus()
  }

  const closeOnBackdrop = (e: MouseEvent<HTMLDialogElement>) => e.target === e.currentTarget && e.currentTarget.close()

  return (
    <section className="roadmap-timeline" id={ids[0]} aria-label={heading || undefined}>
      {ids.slice(1).map((id) => (
        <span key={id} id={id} className="anchor" />
      ))}
      {heading && (
        <h2 className="sr-only" lang={lang}>
          {heading}
        </h2>
      )}
      <div className="roadmap-toolbar">
        <button
          ref={filterButton}
          type="button"
          className="button js-only"
          aria-haspopup="dialog"
          onClick={() => filterDialog.current?.showModal()}
        >
          {t.filterMilestones}
        </button>
        {releases && <a href={releases}>{t.browseReleases}</a>}
      </div>
      <div className="roadmap-summary" aria-live="polite">
        <span>{t.showing}</span>
        <span>{view.target ? t.targetIs(view.target) : t.allTargets}</span>
        <span>{view.state ? t.stateIs(view.state) : t.allStates}</span>
      </div>
      <p className="meta">{t.roadmapContext}</p>

      {!visible.length && (
        <div className="rm-empty" role="status">
          <h3>{t.noMatchTitle}</h3>
          <p>{t.noMatchBody}</p>
          <div>
            <button type="button" className="button" onClick={() => update({ state: undefined, target: undefined }, true)}>
              {t.clearFilters}
            </button>
          </div>
        </div>
      )}

      <ol className="timeline">
        {milestones.map((m) => {
          const open = view.open.includes(m.id)
          const items = m.areas.flatMap((a) => a.items)
          const tags = [...new Set(m.areas.flatMap((a) => (a.title ? [a.title] : a.items.map((i) => i.area))))]
          const counts = statuses.map((s) => [s, items.filter((i) => i.status === s).length] as const).filter(([, n]) => n)
          return (
            <li key={m.id} className="timeline-entry" hidden={!shown(m)}>
              <div className="timeline-rail" aria-hidden="true">
                <img src={m.release === 'in-development' ? '/icons/timeline-current.svg' : '/icons/timeline-node.svg'} width={12} height={12} alt="" />
              </div>
              <div className="timeline-content">
                <article className="rm-card" id={m.id} aria-labelledby={m.headingId}>
                  {m.anchors.map((id) => (
                    <span key={id} id={id} className="anchor" />
                  ))}
                  <div className="rm-version-line">
                    <h3 id={m.headingId} className="rm-version" lang={lang}>
                      {m.label}
                    </h3>
                    <span className="rm-badge">{m.release}</span>
                  </div>
                  <p className="rm-meta">
                    <span>{m.released ? t.released(m.released) : t.notReleased}</span>
                    {m.version && m.version !== m.label && <span>{t.versions(m.version)}</span>}
                    <span>{[t.items(items.length), ...counts.map(([s, n]) => t.statusCount(n, s))].join(' · ')}</span>
                  </p>
                  <p className="rm-theme" lang={lang}>
                    {m.theme}
                  </p>
                  <div className="rm-details prose" lang={lang}>
                    {m.details}
                  </div>
                  {tags.length > 0 && (
                    <p className="rm-tags" lang={lang}>
                      {tags.join(' · ')}
                    </p>
                  )}
                  <div className="rm-actions">
                    {m.notesHref ? (
                      <a href={m.notesHref}>{t.releaseNotes}</a>
                    ) : (
                      m.notes && (
                        <span className="rm-note" lang={lang}>
                          {m.notes}
                        </span>
                      )
                    )}
                    {items.length > 0 && (
                      <button
                        type="button"
                        className="rm-toggle js-only"
                        aria-expanded={open}
                        aria-controls={`rm-items-${m.id}`}
                        onClick={() => update({ open: open ? view.open.filter((id) => id !== m.id) : [...view.open, m.id] }, false)}
                      >
                        {open ? t.hideItems : t.showItems(view.state ? items.filter(matches).length : items.length)}
                      </button>
                    )}
                  </div>
                </article>
                {items.length > 0 && (
                  <div className="rm-items" id={`rm-items-${m.id}`} data-milestone={m.id} data-collapsed={open ? undefined : ''}>
                    {m.areas.map((area, i) => (
                      <section key={area.id ?? i} className="rm-area" hidden={!area.items.some(matches)} aria-labelledby={area.id}>
                        {area.anchors.map((id) => (
                          <span key={id} id={id} className="anchor" />
                        ))}
                        {area.title && (
                          <h4 id={area.id} className="rm-area-title" lang={lang}>
                            {area.title}
                          </h4>
                        )}
                        <ul className="rm-item-list">
                          {area.items.map((item) => (
                            <li key={item.id} className="rm-item" hidden={!matches(item)}>
                              <p className="rm-item-title" lang={lang}>
                                {item.title}
                              </p>
                              <p className="rm-item-status">
                                <code>{item.id}</code> · {item.status}
                                {item.priority && ` · ${item.priority}`}
                              </p>
                              {item.text && (
                                <p className="rm-item-text" lang={lang}>
                                  {item.text}
                                </p>
                              )}
                              <p className="rm-item-date">{t.dateIs(item.date ?? t.notRecorded)}</p>
                              {item.notes && (
                                <p className="rm-item-notes no-js" lang={lang}>
                                  {t.field.notes}: {item.notes}
                                </p>
                              )}
                              <div className="js-only">
                                <button
                                  type="button"
                                  className="rm-item-action"
                                  aria-haspopup="dialog"
                                  data-item={item.id}
                                  onClick={(e) => {
                                    opener.current = e.currentTarget
                                    pushed.current = true
                                    update({ item: item.id }, true)
                                  }}
                                >
                                  {t.viewDetails}
                                  <span className="sr-only">: {item.id}</span>
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <dialog
        ref={filterDialog}
        className="modal roadmap-dialog"
        aria-labelledby="rm-filter-title"
        onClick={closeOnBackdrop}
        onClose={() => filterButton.current?.focus()}
      >
        <div className="dialog-head">
          <h2 id="rm-filter-title">{t.filterTitle}</h2>
          <button type="button" className="button" onClick={() => filterDialog.current?.close()}>
            {t.close}
          </button>
        </div>
        <p className="rm-dialog-heading">{t.filterState}</p>
        <p className="rm-dialog-note">{t.filterNote}</p>
        <div className="rm-choices">
          {[undefined, ...statuses].map((s) => (
            <button key={s ?? ''} type="button" className="button" aria-pressed={view.state === s} onClick={() => update({ state: s }, true)}>
              {s ?? t.allStates}
            </button>
          ))}
        </div>
        <hr className="divider" />
        <p className="rm-dialog-note">{t.filterTarget}</p>
        <div className="rm-targets">
          {[undefined, ...milestones.map((m) => m.id)].map((id) => (
            <button key={id ?? ''} type="button" aria-pressed={view.target === id} onClick={() => update({ target: id }, true)}>
              {id ?? t.allTargets}
            </button>
          ))}
        </div>
      </dialog>

      <dialog ref={itemDialog} className="modal roadmap-dialog" aria-labelledby="rm-item-title" onClick={closeOnBackdrop} onClose={closeItem}>
        <div className="dialog-head">
          <h2 id="rm-item-title">{t.itemDetails}</h2>
          <button type="button" className="button" onClick={() => itemDialog.current?.close()}>
            {t.close}
          </button>
        </div>
        {selected && (
          <>
            <p className="rm-dialog-heading" lang={lang}>
              {selected.milestone.label}
            </p>
            <p className="rm-dialog-title" lang={lang}>
              {selected.item.title}
            </p>
            <p className="rm-dialog-status">
              {selected.item.status}
              {selected.item.priority && ` · ${selected.item.priority}`}
            </p>
            {selected.item.text && (
              <p className="rm-dialog-text" lang={lang}>
                {selected.item.text}
              </p>
            )}
            <dl className="rm-fields">
              <Field label={t.field.milestone}>{selected.milestone.id}</Field>
              <Field label={t.field.item}>
                <code>{selected.item.id}</code>
              </Field>
              <Field label={t.field.area}>{selected.area.title ? `${selected.area.title} (${selected.item.area})` : selected.item.area}</Field>
              <Field label={t.field.status}>{selected.item.status}</Field>
              <Field label={t.field.priority}>{selected.item.priority ?? t.noMark}</Field>
              <Field label={t.field.date}>{selected.item.date ?? t.notRecorded}</Field>
              <Field label={t.field.release}>
                {selected.milestone.release} · {selected.milestone.released ? t.released(selected.milestone.released) : t.notReleased}
              </Field>
            </dl>
            {selected.item.notes && (
              <div className="rm-dialog-notes">
                <p className="rm-dialog-note">{t.field.notes}</p>
                <p lang={lang}>{selected.item.notes}</p>
              </div>
            )}
            <p className="rm-dialog-note">{t.completionNote}</p>
            <div>
              <button type="button" className="button" onClick={() => itemDialog.current?.close()}>
                {t.backToTimeline}
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  )
}
