import type { ReactNode } from 'react'
import { site } from '@/site.config'
import { strings } from '@/lib/i18n'
import { sectionTitle } from '@/lib/manifest'
import { nav, pageByKey, pageHref, searchHref, sectionOf, versions, type NavNode, type Page, type Version } from '@/lib/site'
import { Lockup } from './brand'
import { LanguageMenu, VersionMenu, type LanguageOption, type VersionOption } from './menus'
import { ContentsPanel, MenuTrigger, NavDrawer, Rail, type NavGroupData, type NavSectionData, type TocEntry } from './navigation'
import { SearchDialog, SearchTrigger } from './search'

export const localeLabel = (locale: string) => site.locales[locale] ?? locale

// Every section's navigation as the client components take it.
function navSections(v: Version, locale: string): NavSectionData[] {
  const t = strings(locale)
  const group = (n: NavNode): NavGroupData => ({
    id: n.group.id,
    title: sectionTitle(n.group, locale),
    items: [
      ...(n.index ? [{ key: n.index.key, title: t.allReleases, href: pageHref(v.id, locale, n.index.route) }] : []),
      ...n.pages.map((p) => ({ key: p.key, title: p.doc.title, href: pageHref(v.id, locale, p.route), ...(p.doc.lang !== locale && { lang: p.doc.lang }) })),
    ],
    groups: n.groups.map(group),
  })
  return nav(v, locale).map((s) => ({
    id: s.section.id,
    title: sectionTitle(s.section, locale),
    href: s.entry && pageHref(v.id, locale, s.entry.route),
    groups: s.groups.map(group),
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

// Header, the section's rail, drawer and overlays around one page. `wide` drops the rail (home).
export function Shell({ v, page, entries, wide, children }: { v: Version; page: Page; entries: TocEntry[]; wide?: boolean; children?: ReactNode }) {
  const { locale } = page
  const t = strings(locale)
  const sections = navSections(v, locale)
  const active = sectionOf(page)?.id
  const current = sections.find((s) => s.id === active)
  const memory = `${v.id}:${locale}`
  const versionsMenu = (id: string) => <VersionMenu id={id} locale={locale} current={v.id} options={versionOptions(page)} />
  const languagesMenu = (id: string) => <LanguageMenu id={id} locale={locale} options={languageOptions(v, page)} />
  const context = [v.label, localeLabel(locale)]
  const chips = context.map((c) => (
    <span key={c} className="tag">
      {c}
    </span>
  ))
  // The four sections; the page's own is current, and so marked on its entry page.
  const sectionLinks = (className: string) => (
    <nav className={className} aria-label={t.sections}>
      {sections.map((s) => (
        <a key={s.id} href={s.href} aria-current={s.id === active ? (page.kind === 'section' ? 'page' : 'true') : undefined}>
          {s.title}
        </a>
      ))}
    </nav>
  )

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
        {sectionLinks('header-nav')}
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
      </div>
      {sectionLinks('section-tabs only-compact')}
      {entries.length > 0 && (
        <div className="mobile-context only-mobile">
          <ContentsPanel entries={entries} locale={locale} chips={chips} />
        </div>
      )}
      <div className={wide || !current ? 'workspace wide' : 'workspace'}>
        {!wide && current && <Rail section={current} current={page.key} memory={memory} label={t.menu} />}
        <main id="content">{children}</main>
      </div>
      <NavDrawer locale={locale} sections={sections} section={active} current={page.key} memory={memory} />
      <SearchDialog indexUrl={searchHref(v.id, locale)} locale={locale} context={context} />
    </>
  )
}
