import type { ReactNode } from 'react'
import { site } from '@/site.config'
import { strings } from '@/lib/i18n'
import { nav, pageByKey, pageHref, searchHref, sectionEntry, versions, type Page, type Version } from '@/lib/site'
import { Lockup } from './brand'
import { LanguageMenu, VersionMenu, type LanguageOption, type VersionOption } from './menus'
import { ContentsPanel, MenuTrigger, NavDrawer, NavTree, type NavGroupData, type TocEntry } from './navigation'
import { SearchDialog, SearchTrigger } from './search'

export const localeLabel = (locale: string) => site.locales[locale] ?? locale

function navData(v: Version, locale: string): NavGroupData[] {
  return nav(v, locale).map((g) => ({
    id: g.section.id,
    title: g.section.title,
    index: g.index && { key: g.index.key, title: g.section.title, href: pageHref(v.id, locale, g.index.route) },
    items: g.pages.map((p) => ({
      key: p.key,
      title: p.doc.title,
      href: pageHref(v.id, locale, p.route),
      ...(p.doc.lang !== locale && { lang: p.doc.lang }),
    })),
  }))
}

function versionOptions(page: Page): VersionOption[] {
  return versions().map((other) => {
    const locale = other.locales.includes(page.locale) ? page.locale : other.locales[0]
    const target = pageByKey(other, locale, page.key)
    return { id: other.id, label: other.label, href: target ? pageHref(other.id, locale, target.route) : null, home: pageHref(other.id, locale, '/') }
  })
}

function languageOptions(v: Version, page: Page): LanguageOption[] {
  return v.locales.map((locale) => {
    const target = pageByKey(v, locale, page.key)!
    const same = target.kind === 'doc' && page.kind === 'doc' && target.doc.path === page.doc.path
    return { locale, label: localeLabel(locale), href: pageHref(v.id, locale, target.route), sameDocument: same }
  })
}

// Header, category rail, drawer and overlays around one page. `wide` drops the rail (home).
export function Shell({ v, page, entries, wide, children }: { v: Version; page: Page; entries: TocEntry[]; wide?: boolean; children: ReactNode }) {
  const { locale } = page
  const t = strings(locale)
  const groups = navData(v, locale)
  const versionsMenu = (id: string) => <VersionMenu id={id} locale={locale} current={v.id} options={versionOptions(page)} />
  const languagesMenu = (id: string) => <LanguageMenu id={id} locale={locale} options={languageOptions(v, page)} />
  const context = [v.label, localeLabel(locale)]
  const chips = context.map((c) => (
    <span key={c} className="tag">
      {c}
    </span>
  ))

  return (
    <>
      <a className="skip" href="#content">
        {t.skip}
      </a>
      <header className="topbar">
        <a className="brand" href={pageHref(v.id, locale, '/')}>
          <Lockup />
          {t.docs}
        </a>
        <SearchTrigger locale={locale} />
        <span className="spacer" />
        <nav className="header-nav" aria-label={t.menu}>
          {site.header.map((id) => {
            const entry = sectionEntry(v, locale, id)
            const section = v.manifest.sections.find((s) => s.id === id)
            return entry && section ? (
              <a key={id} href={pageHref(v.id, locale, entry.route)}>
                {section.title}
              </a>
            ) : null
          })}
        </nav>
        <div className="context chips">
          {versionsMenu('version-menu')}
          {languagesMenu('language-menu')}
        </div>
        <SearchTrigger locale={locale} compact />
        <MenuTrigger locale={locale} />
      </header>
      <div className="mobile-context only-mobile">
        <div className="chips">
          {versionsMenu('version-menu-mobile')}
          {languagesMenu('language-menu-mobile')}
        </div>
        <ContentsPanel entries={entries} locale={locale} chips={chips} />
      </div>
      <div className={wide ? 'workspace wide' : 'workspace'}>
        {!wide && (
          <nav className="rail" aria-label={t.menu}>
            <NavTree groups={groups} current={page.key} locale={locale} />
          </nav>
        )}
        <main id="content">{children}</main>
      </div>
      <NavDrawer locale={locale} groups={groups} current={page.key} chips={chips} />
      <SearchDialog indexUrl={searchHref(v.id, locale)} locale={locale} context={context} />
    </>
  )
}
