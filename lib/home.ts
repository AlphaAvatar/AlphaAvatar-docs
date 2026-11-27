import { site } from '../site.config'
import { places, sectionTitle } from './manifest'
import { groupEntry, latestRelease, pageByKey, pageHref, sectionEntry, sourceHref, type DocPage, type Version } from './site'

// The home page of one version and language: its HTML (components/home.tsx) and its index.md
// both come from this model. The short copy is navigation, written here in each interface
// language; every card leads to a section, group or document of the snapshot's manifest, and a missing
// one fails the build rather than being replaced.

type Target = { section: string } | { group: string } | { doc: string } | { url: string }

export type Icon = 'book' | 'code' | 'route' | 'tag' | 'community'

export type HomeLink = { title: string; text: string; action: string; href: string; md: string; external?: boolean; icon?: Icon }

export type Featured = HomeLink & {
  preview: { kicker: string; code: string; columns?: string[]; text: string }
  // The language the linked page is written in, when it is not the one being read.
  original?: string
}

export type HomeModel = {
  locale: string
  eyebrow: string
  title: string
  lead: string
  actions: { label: string; href: string; md: string; primary?: boolean }[]
  release?: { title: string; published: string; action: string; href: string; md: string }
  directions: HomeLink[]
  featuredTitle: string
  featured: Featured[]
  resourcesTitle: string
  resources: HomeLink[]
  footer: [string, string]
}

const repository = `https://github.com/${site.repository}`

const copy = {
  en: {
    eyebrow: 'Build with AlphaAvatar',
    title: 'AlphaAvatar documentation',
    lead: 'Install and configure your Host, understand the runtime, and extend AlphaAvatar.',
    actions: [
      { label: 'Get started', to: { section: 'guide' }, primary: true },
      { label: 'Browse CLI reference', to: { doc: 'cli' } },
    ],
    release: (tag: string) => `Latest release · ${tag}`,
    published: (date: string) => `Published ${date} · UTC`,
    releaseAction: 'Release notes',
    directions: [
      { to: { section: 'guide' }, icon: 'book', text: 'Install a Host, choose your configuration and prepare your environment.', action: 'Start with the guides' },
      { to: { section: 'development' }, icon: 'code', text: 'Set up a development environment, follow conventions and contribute to the project.', action: 'Explore development' },
      { to: { section: 'reference' }, icon: 'route', text: 'Understand identifier boundaries and the conventions shared across the system.', action: 'Browse reference' },
    ],
    featuredTitle: 'Go deeper',
    featured: [
      {
        to: { doc: 'cli-doctor' },
        preview: { kicker: 'Terminal / Doctor', code: '$ alphaavatar doctor', columns: ['01  Static checks', '02  Runtime diagnosis'], text: 'Configuration · services · measured evidence' },
        title: 'Diagnose your Host',
        text: 'Check configuration and service readiness, then inspect measured runtime evidence.',
        action: 'Read the Doctor guide',
      },
      {
        to: { doc: 'identifiers' },
        preview: { kicker: 'Identifiers / Constraints', code: 'participant_id  ≠  device_id', text: 'Participant identity stays separate from device identity.' },
        title: 'Understand identity boundaries',
        text: 'Read the identifier and association conventions used across AlphaAvatar.',
        action: 'Read the technical article',
      },
    ],
    original: (language: string) => `Source language · ${language}`,
    resourcesTitle: 'Resources',
    resources: [
      { to: { section: 'reference' }, icon: 'book', title: 'Technical reference', text: 'Identifier and association conventions.' },
      { to: { doc: 'roadmap' }, icon: 'route', title: 'Roadmap', text: 'Version goals, milestones and progress.' },
      { to: { group: 'releases' }, icon: 'tag', title: 'Releases', text: 'Delivered changes and migration notes.' },
      { to: { url: repository }, icon: 'code', title: 'Source code', text: 'Explore the repository and contribute.' },
      { to: { url: `${repository}/discussions` }, icon: 'community', title: 'Community', text: 'Ask questions and share what you build.' },
    ],
    footer: ['AlphaAvatar Docs', 'Open source. Built for real-time intelligence.'],
  },
  'zh-CN': {
    eyebrow: '使用 AlphaAvatar 构建',
    title: 'AlphaAvatar 文档',
    lead: '安装并配置 Host，理解运行时，扩展 AlphaAvatar。',
    actions: [
      { label: '开始使用', to: { section: 'guide' }, primary: true },
      { label: '浏览 CLI 参考', to: { doc: 'cli' } },
    ],
    release: (tag: string) => `最新发布 · ${tag}`,
    published: (date: string) => `发布于 ${date} · UTC`,
    releaseAction: '发布说明',
    directions: [
      { to: { section: 'guide' }, icon: 'book', text: '安装 Host，选择配置并准备运行环境。', action: '从指南开始' },
      { to: { section: 'development' }, icon: 'code', text: '搭建开发环境，遵循项目约定并参与贡献。', action: '了解开发' },
      { to: { section: 'reference' }, icon: 'route', text: '理解标识的边界，以及整个系统共享的约定。', action: '浏览参考' },
    ],
    featuredTitle: '深入阅读',
    featured: [
      {
        to: { doc: 'cli-doctor' },
        preview: { kicker: '终端 / Doctor', code: '$ alphaavatar doctor', columns: ['01  静态检查', '02  运行时诊断'], text: '配置 · 服务 · 实测证据' },
        title: '诊断你的 Host',
        text: '检查配置和服务是否就绪，再查看实测的运行时证据。',
        action: '阅读 Doctor 指南',
      },
      {
        to: { doc: 'identifiers' },
        preview: { kicker: '标识 / 约束', code: 'participant_id  ≠  device_id', text: '参与者身份与设备身份相互独立。' },
        title: '理解身份边界',
        text: '阅读 AlphaAvatar 通用的标识与关联约定。',
        action: '阅读技术文章',
      },
    ],
    original: (language: string) => `原文语言 · ${language}`,
    resourcesTitle: '资源',
    resources: [
      { to: { section: 'reference' }, icon: 'book', title: '技术参考', text: '标识与关联约定。' },
      { to: { doc: 'roadmap' }, icon: 'route', title: '路线图', text: '版本目标、里程碑和进展。' },
      { to: { group: 'releases' }, icon: 'tag', title: '发布', text: '已交付的变更和迁移说明。' },
      { to: { url: repository }, icon: 'code', title: '源代码', text: '浏览仓库并参与贡献。' },
      { to: { url: `${repository}/discussions` }, icon: 'community', title: '社区', text: '提出问题，分享你的成果。' },
    ],
    footer: ['AlphaAvatar 文档', '开源，为实时智能而构建。'],
  },
} satisfies Record<string, unknown>

export function homeModel(v: Version, locale: string): HomeModel {
  const c = locale in copy ? copy[locale as keyof typeof copy] : copy.en
  const where = `home (${v.id}, ${locale})`

  // HTML address, Markdown address (a document's Markdown; a section's or external page's URL),
  // the manifest title of a section and the page of a document.
  type Resolved = { href: string; md: string; external?: boolean; title?: string; page?: DocPage }
  const resolve = (to: Target): Resolved => {
    if ('url' in to) return { href: to.url, md: to.url, external: true }
    if ('section' in to) {
      const entry = sectionEntry(v, locale, to.section)
      const section = v.manifest.sections.find((s) => s.id === to.section)
      if (!entry || !section) throw new Error(`${where}: section ${to.section} is not published`)
      const href = pageHref(v.id, locale, entry.route)
      return { href, md: entry.kind === 'doc' ? site.url + sourceHref(v.id, entry.doc) : site.url + href, title: sectionTitle(section, locale) }
    }
    if ('group' in to) {
      const entry = groupEntry(v, locale, to.group)
      const place = places(v.manifest).get(to.group)
      if (!entry || !place) throw new Error(`${where}: group ${to.group} is not published`)
      const href = pageHref(v.id, locale, entry.route)
      return { href, md: entry.kind === 'doc' ? site.url + sourceHref(v.id, entry.doc) : site.url + href, title: sectionTitle(place.groups.at(-1)!, locale) }
    }
    const page = pageByKey(v, locale, to.doc)
    if (page?.kind !== 'doc') throw new Error(`${where}: document ${to.doc} is not published`)
    return { href: pageHref(v.id, locale, page.route), md: site.url + sourceHref(v.id, page.doc), page }
  }

  const release = latestRelease(v, locale)
  const link = (item: { to: Target; icon: Icon; title?: string; text: string; action?: string }): HomeLink => {
    const r = resolve(item.to)
    return { title: item.title ?? r.title ?? '', text: item.text, action: item.action ?? '', href: r.href, md: r.md, external: r.external, icon: item.icon }
  }

  return {
    locale,
    eyebrow: c.eyebrow,
    title: c.title,
    lead: c.lead,
    actions: c.actions.map((a) => {
      const { href, md } = resolve(a.to)
      return { label: a.label, href, md, primary: 'primary' in a && a.primary }
    }),
    release: release?.doc.release && {
      title: c.release(release.doc.release.tag),
      published: c.published(release.doc.release.published),
      action: c.releaseAction,
      href: pageHref(v.id, locale, release.route),
      md: site.url + sourceHref(v.id, release.doc),
    },
    directions: c.directions.map((d) => link({ ...d, icon: d.icon as Icon })),
    featuredTitle: c.featuredTitle,
    featured: c.featured.map((f) => {
      const r = resolve(f.to)
      const lang = r.page!.doc.lang
      return {
        title: f.title,
        text: f.text,
        action: f.action,
        href: r.href,
        md: r.md,
        preview: f.preview,
        ...(lang !== locale && { original: c.original(site.locales[lang] ?? lang) }),
      }
    }),
    resourcesTitle: c.resourcesTitle,
    resources: c.resources.map((r) => link({ ...r, icon: r.icon as Icon })),
    footer: c.footer as [string, string],
  }
}

// index.md: the same model as Markdown, every entry a working link.
export function homeMarkdown(m: HomeModel): string {
  const item = (l: { title: string; md: string; text: string }) => `- [${l.title}](${l.md}): ${l.text}`
  return [
    `# ${m.title}`,
    '',
    m.lead,
    '',
    ...m.actions.map((a) => `- [${a.label}](${a.md})`),
    '',
    ...(m.release ? [`## ${m.release.title}`, '', `${m.release.published} · [${m.release.action}](${m.release.md})`, ''] : []),
    ...m.directions.map(item),
    '',
    `## ${m.featuredTitle}`,
    '',
    ...m.featured.map((f) => item(f) + (f.original ? ` (${f.original})` : '')),
    '',
    `## ${m.resourcesTitle}`,
    '',
    ...m.resources.map(item),
    '',
  ].join('\n')
}
