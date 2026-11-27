'use client'

import { useRef, useState } from 'react'
import { strings } from '@/lib/i18n'

// Version and language menus, anchored to the header. A version without this document keeps the
// reader on the current page and says so; it never substitutes another page.

export type VersionOption = { id: string; label: string; href: string | null; home: string }
// `anchors` maps the anchors of this document that are elsewhere, or missing (''), in that
// language's file; any other anchor is the same there. Without it the page is another one.
export type LanguageOption = { locale: string; label: string; href: string; anchors?: Record<string, string> }

export function VersionMenu({ id, locale, current, options }: { id: string; locale: string; current: string; options: VersionOption[] }) {
  const t = strings(locale)
  const dialog = useRef<HTMLDialogElement>(null)
  const [missing, setMissing] = useState<VersionOption>()
  const label = options.find((o) => o.id === current)?.label ?? current

  return (
    <>
      <button type="button" className="button" popoverTarget={id} aria-label={`${t.version}: ${label}`}>
        {t.docs} {label}
      </button>
      <div id={id} popover="auto" className="menu" role="dialog" aria-label={t.version}>
        <div className="menu-head">
          {t.version}
          <button type="button" className="button small" popoverTarget={id} popoverTargetAction="hide">
            {t.close}
          </button>
        </div>
        <div className="menu-options">
          {options.map((o) =>
            o.href ? (
              <a key={o.id} href={o.href} aria-current={o.id === current}>
                {o.label}
              </a>
            ) : (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  document.getElementById(id)?.hidePopover()
                  setMissing(o)
                  dialog.current?.showModal()
                }}
              >
                {o.label}
              </button>
            ),
          )}
        </div>
        <p className="menu-note">{t.versionNote}</p>
      </div>
      <dialog ref={dialog} className="modal" aria-labelledby={`${id}-missing`}>
        <div className="dialog-head">
          <h2 id={`${id}-missing`}>{t.version}</h2>
          <button type="button" className="button small" onClick={() => dialog.current?.close()}>
            {t.close}
          </button>
        </div>
        {missing && (
          <div style={{ display: 'grid', gap: 16 }}>
            <strong style={{ color: 'var(--text)' }}>{t.unavailableTitle(missing.label)}</strong>
            <p style={{ margin: 0 }}>{t.unavailableBody}</p>
            <div className="chips">
              <button type="button" className="button primary" onClick={() => dialog.current?.close()}>
                {t.stay}
              </button>
              <a className="button" href={missing.home}>
                {t.browseVersion(missing.label)}
              </a>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}

export function LanguageMenu({ id, locale, options }: { id: string; locale: string; options: LanguageOption[] }) {
  const t = strings(locale)
  const label = options.find((o) => o.locale === locale)?.label ?? locale

  return (
    <>
      <button type="button" className="button" popoverTarget={id} aria-label={`${t.language}: ${label}`}>
        {label}
      </button>
      <div id={id} popover="auto" className="menu" role="dialog" aria-label={t.language}>
        <div className="menu-head">
          {t.language}
          <button type="button" className="button small" popoverTarget={id} popoverTargetAction="hide">
            {t.close}
          </button>
        </div>
        <div className="menu-options">
          {options.map((o) => (
            <a
              key={o.locale}
              href={o.href}
              lang={o.locale}
              aria-current={o.locale === locale}
              onClick={(e) => {
                // The same document in another language keeps its place and its query (the
                // Roadmap's filters): the anchor maps to the same heading there, or is dropped.
                if (!o.anchors || (!window.location.hash && !window.location.search)) return
                e.preventDefault()
                const id = decodeURIComponent(window.location.hash.slice(1))
                const at = id ? (o.anchors[id] ?? id) : ''
                window.location.href = o.href + window.location.search + (at ? `#${encodeURIComponent(at)}` : '')
              }}
            >
              {o.label}
            </a>
          ))}
        </div>
        <p className="menu-note">{t.languageNote}</p>
      </div>
    </>
  )
}
