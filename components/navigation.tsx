'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'

// `lang` is the document's language when it differs from the one being read.
export type NavItem = { key: string; title: string; href: string; lang?: string }
export type NavGroupData = { id: string; title: string; index?: NavItem; items: NavItem[] }
export type TocEntry = { depth: number; id: string; text: string }

const MENU = 'docs:menu'

// Groups expand and collapse in place; the current page's group always starts open.
export function NavTree({ groups, current, locale }: { groups: NavGroupData[]; current: string; locale: string }) {
  const t = strings(locale)
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.items.length <= 6 || g.index?.key === current || g.items.some((i) => i.key === current)])),
  )

  return (
    <>
      {groups.map((g) => (
        <div key={g.id} className="nav-group">
          <button
            type="button"
            className="nav-group-head"
            aria-expanded={open[g.id]}
            aria-controls={`nav-${g.id}`}
            onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
          >
            {g.title}
            <img src="/icons/chevron.svg" width={16} height={16} alt="" />
          </button>
          <ul id={`nav-${g.id}`} className="nav-list" hidden={!open[g.id]}>
            {[...(g.index ? [{ ...g.index, title: t.sectionOverview }] : []), ...g.items].map((item) => (
              <li key={item.key}>
                <a className="nav-item" href={item.href} aria-current={item.key === current ? 'page' : undefined}>
                  <span lang={item.lang}>{item.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
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

export function NavDrawer({ locale, groups, current, chips }: { locale: string; groups: NavGroupData[]; current: string; chips: ReactNode }) {
  const t = strings(locale)
  const ref = useModal(MENU)
  return (
    <dialog ref={ref} className="drawer" aria-labelledby="drawer-title" onClick={(e) => e.target === ref.current && ref.current.close()}>
      <div className="dialog-head">
        <h2 id="drawer-title">{t.menu}</h2>
        <button type="button" className="button" onClick={() => ref.current?.close()}>
          {t.close}
        </button>
      </div>
      <div className="chips">{chips}</div>
      <NavTree groups={groups} current={current} locale={locale} />
    </dialog>
  )
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
