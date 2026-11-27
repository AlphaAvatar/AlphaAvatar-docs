'use client'

import { useEffect, useState } from 'react'
import { strings } from '@/lib/i18n'
import { Lockup } from './brand'
import { SearchDialog } from './search'

// Each language's home is the address the site gives it (lib/site.ts pageHref).
export type KnownVersion = { id: string; label: string; locales: { id: string; label: string; home: string }[] }

// One static 404 page for every URL; the requested version and language are read from the path,
// so recovery (search, home) stays in that context.
export function NotFound({ known, fallbackHome }: { known: KnownVersion[]; fallbackHome: string }) {
  const [context, setContext] = useState<{ version: KnownVersion; locale: KnownVersion['locales'][number] }>()

  useEffect(() => {
    const [locale, id] = window.location.pathname.split('/').filter(Boolean)
    const version = known.find((v) => v.id === id)
    const match = version?.locales.find((l) => l.id === locale)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the path is only known in the browser
    if (version && match) setContext({ version, locale: match })
  }, [known])

  const t = strings(context?.locale.id ?? 'en')
  const home = context?.locale.home ?? fallbackHome

  return (
    <>
      <header className="topbar">
        <a className="brand" href={home}>
          <Lockup />
          {t.docs}
        </a>
      </header>
      <main id="content" className="not-found" lang={context?.locale.id}>
        <span className="tag">{t.notFoundTag}</span>
        <h1>{t.notFoundTitle}</h1>
        <p>{t.notFoundBody}</p>
        {context && (
          <p className="meta">
            {t.requested}: {context.version.label} · {context.locale.label}
          </p>
        )}
        {context && (
          <button type="button" className="button primary" onClick={() => window.dispatchEvent(new Event('docs:search'))}>
            {t.searchTitle}
          </button>
        )}
        <a className="button" href={home}>
          {t.docsHome}
        </a>
      </main>
      {context && (
        <SearchDialog
          indexUrl={`/${context.locale.id}/${context.version.id}/search.json`}
          locale={context.locale.id}
          context={[context.version.label, context.locale.label]}
        />
      )}
    </>
  )
}
