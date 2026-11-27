'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'

// `lang` is the document's language when it differs from the one being read.
export type NavItem = { key: string; title: string; href: string; lang?: string }
// A group's documents, then its own groups.
export type NavGroupData = { id: string; title: string; items: NavItem[]; groups: NavGroupData[] }
export type NavSectionData = { id: string; title: string; href?: string; groups: NavGroupData[] }
export type TocEntry = { depth: number; id: string; text: string }

const MENU = 'docs:menu'

// The groups that hold the current page, outermost first.
function ancestors(groups: NavGroupData[], current: string): string[] {
  for (const g of groups) {
    if (g.items.some((i) => i.key === current)) return [g.id]
    const inner = ancestors(g.groups, current)
    if (inner.length) return [g.id, ...inner]
  }
  return []
}

// Which groups are open: the current page's ancestors on entering a page; the others as the
// reader left them in this section, version and language during the session (sessionStorage).
// A section of one group opens it the first time. A collapsed ancestor stays collapsed until the
// next page is entered.
const OPENED = 'docs:nav-opened'

function readOpen(key: string): string[] | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    return Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function writeOpen(key: string, ids: string[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids))
  } catch {}
  window.dispatchEvent(new Event(OPENED))
}

function subscribeOpen(listener: () => void) {
  window.addEventListener(OPENED, listener)
  return () => window.removeEventListener(OPENED, listener)
}

function useOpenGroups(section: NavSectionData, current: string, memory: string) {
  const key = `docs:nav:${memory}:${section.id}`
  const forced = ancestors(section.groups, current)
  const initial = forced.length ? forced : section.groups.length === 1 ? [section.groups[0].id] : []
  const stored = useSyncExternalStore(subscribeOpen, () => sessionStorage.getItem(key), () => null)
  const open: string[] = (stored !== null && readOpen(key)) || initial

  // Entering a page opens its ancestors, whatever was collapsed before.
  const entry = forced.join(' ')
  useEffect(() => {
    writeOpen(key, [...new Set([...(readOpen(key) ?? initial), ...entry.split(' ').filter(Boolean)])])
    // `initial` follows `entry`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, entry])

  const toggle = (id: string) => writeOpen(key, open.includes(id) ? open.filter((g) => g !== id) : [...open, id])
  return { open, toggle }
}

function Items({ items, current }: { items: NavItem[]; current: string }) {
  return items.map((item) => (
    <li key={item.key}>
      <a className="nav-item" href={item.href} aria-current={item.key === current ? 'page' : undefined}>
        <span lang={item.lang}>{item.title}</span>
      </a>
    </li>
  ))
}

// One section's tree: groups, their documents, their own groups and theirs; each level starts
// 16px further in. The rail and the drawer each render one, so list ids carry the instance's id.
export function NavTree({ section, current, memory }: { section: NavSectionData; current: string; memory: string }) {
  const instance = useId()
  const { open, toggle } = useOpenGroups(section, current, memory)

  const group = (g: NavGroupData, level: number): ReactNode => {
    const expanded = open.includes(g.id)
    const id = `${instance}nav-${g.id}`
    return (
      <li key={g.id} className="nav-group" data-level={level}>
        <button type="button" className="nav-group-head" aria-expanded={expanded} aria-controls={id} onClick={() => toggle(g.id)}>
          <img src="/icons/chevron.svg" width={16} height={16} alt="" />
          <span>{g.title}</span>
        </button>
        <ul id={id} className="nav-list" hidden={!expanded}>
          <Items items={g.items} current={current} />
          {g.groups.map((sub) => group(sub, level + 1))}
        </ul>
      </li>
    )
  }
  return <ul className="nav-tree">{section.groups.map((g) => group(g, 1))}</ul>
}

// The rail: the current section's tree only. Entering a page scrolls the rail, not the page, to
// show its current item, once the groups the reader left open have opened too.
export function Rail({ section, current, memory, label }: { section: NavSectionData; current: string; memory: string; label: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const reveal = () => {
      const rail = ref.current
      const item = rail?.querySelector<HTMLElement>('[aria-current="page"]')
      if (!rail || !item) return
      const r = rail.getBoundingClientRect()
      const i = item.getBoundingClientRect()
      if (i.top < r.top || i.bottom > r.bottom) rail.scrollTop += i.top - r.top - r.height / 3
    }
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(reveal)))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <nav ref={ref} className="rail" aria-label={label}>
      <SectionHead section={section} />
      <NavTree section={section} current={current} memory={memory} />
    </nav>
  )
}

function SectionHead({ section }: { section: NavSectionData }) {
  return <p className="nav-section">{section.href ? <a href={section.href}>{section.title}</a> : section.title}</p>
}

export function MenuTrigger({ locale }: { locale: string }) {
  return (
    <button type="button" className="button icon only-compact" aria-label={strings(locale).openMenu} onClick={() => window.dispatchEvent(new Event(MENU))}>
      <img src="/icons/menu.svg" width={20} height={20} alt="" />
    </button>
  )
}

function useModal(event?: string) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!event) return
    const open = () => ref.current?.showModal()
    window.addEventListener(event, open)
    return () => window.removeEventListener(event, open)
  }, [event])
  return ref
}

// Tablet and mobile: every section's tree, one at a time; the switch starts on the page's section.
export function NavDrawer({ locale, sections, section, current, memory }: { locale: string; sections: NavSectionData[]; section?: string; current: string; memory: string }) {
  const t = strings(locale)
  const ref = useModal(MENU)
  const [shown, setShown] = useState(section ?? sections[0]?.id)
  const chosen = sections.find((s) => s.id === shown) ?? sections[0]
  return (
    <dialog ref={ref} className="drawer" aria-labelledby="drawer-title" onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="dialog-head">
        <h2 id="drawer-title">{t.menu}</h2>
        <button type="button" className="button" onClick={() => ref.current?.close()}>
          {t.closeMenu}
        </button>
      </div>
      <div className="section-switch" role="group" aria-label={t.sections}>
        {sections.map((s) => (
          <button key={s.id} type="button" className="button" aria-pressed={s.id === chosen?.id} onClick={() => setShown(s.id)}>
            {s.title}
          </button>
        ))}
      </div>
      {chosen && (
        <div className="drawer-tree">
          <SectionHead section={chosen} />
          <NavTree key={chosen.id} section={chosen} current={current} memory={memory} />
        </div>
      )}
    </dialog>
  )
}

// The anchor a URL's hash names, decoded: '' when there is none, or when it does not decode (a
// stray `%`), so that a broken link opens the page as it is. Every reader of an anchor uses this.
export function anchorOf(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''))
  } catch {
    return ''
  }
}

function useActiveHeading(entries: TocEntry[]) {
  const [active, setActive] = useState(entries[0]?.id)
  useEffect(() => {
    const elements = entries.map((e) => document.getElementById(e.id)).filter((e): e is HTMLElement => !!e)
    const update = () => {
      const line = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 88
      let current = elements[0]?.id
      for (const el of elements) {
        if (el.getBoundingClientRect().top - line > 1) break
        current = el.id
      }
      setActive(current)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [entries])
  return active
}

export function Toc({ entries, locale }: { entries: TocEntry[]; locale: string }) {
  const t = strings(locale)
  const active = useActiveHeading(entries)
  if (!entries.length) return null
  return (
    <nav aria-labelledby="toc-title">
      <p id="toc-title" className="toc-title">
        {t.onThisPage}
      </p>
      <ol style={{ marginTop: 16 }}>
        {entries.map((e) => (
          <li key={e.id}>
            <a href={`#${e.id}`} className={`depth-${e.depth}`} aria-current={active === e.id}>
              {e.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

// Mobile: the contents open as a panel; choosing a section closes it and moves in the article.
export function ContentsPanel({ entries, locale, chips }: { entries: TocEntry[]; locale: string; chips: ReactNode }) {
  const t = strings(locale)
  const ref = useModal()
  if (!entries.length) return null
  return (
    <>
      <button type="button" className="contents-toggle" onClick={() => ref.current?.showModal()}>
        {t.onThisPage}
        <img src="/icons/chevron.svg" width={16} height={16} alt="" />
      </button>
      <dialog ref={ref} className="drawer panel" aria-labelledby="contents-title">
        <div className="dialog-head">
          <h2 id="contents-title">{t.onThisPage}</h2>
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {t.close}
          </button>
        </div>
        <div className="chips">{chips}</div>
        <ol className="contents-list">
          {entries.map((e) => (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={`depth-${e.depth}`}
                onClick={(event) => {
                  event.preventDefault()
                  ref.current?.close()
                  window.location.hash = e.id
                }}
              >
                {e.text}
              </a>
            </li>
          ))}
        </ol>
        <p className="menu-note">{t.onThisPageNote}</p>
      </dialog>
    </>
  )
}
