'use client'

import { useRef, useState } from 'react'
import { strings } from '@/lib/i18n'

// Version and language menus, anchored to the header. A version without this document keeps the
// reader on the current page and says so; it never substitutes another page.

export type VersionOption = { id: string; label: string; href: string | null; home: string }
export type LanguageOption = { locale: string; label: string; href: string; sameDocument: boolean }

export function VersionMenu({ id, locale, current, options }: { id: string; locale: string; current: string; options: VersionOption[] }) {
  const t = strings(locale)
  const dialog = useRef<HTMLDialogElement>(null)
  const [missing, setMissing] = useState<VersionOption>()
  const label = options.find((o) => o.id === current)?.label ?? current

  return (
    <>
      <button type="button" className="button" popoverTarget={id} aria-label={`${t.version}: ${label}`}>
        {label}
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
                // The same file in another language keeps its anchors.
                if (o.sameDocument && window.location.hash) {
                  e.preventDefault()
                  window.location.href = o.href + window.location.hash
                }
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
