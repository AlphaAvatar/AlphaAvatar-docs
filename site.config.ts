// What this site publishes. Document text, titles, sections, languages and planning state come
// from each source snapshot's docs/manifest.yaml; this file only says where the snapshots are.

export type VersionSource = {
  // URL segment and the version selector's entry, e.g. `v0.7.0`.
  id: string
  label: string
  // Branch or tag in the source repository; resolved to one commit per build.
  ref: string
  // The branch where this version's text is edited: "Edit source" opens the page's file there,
  // while "View source" stays at the commit the build used. Without one, no edit link is shown.
  editRef?: string
}

export const site = {
  name: 'AlphaAvatar Docs',
  url: 'https://docs.alphaavatar.io',
  repository: 'AlphaAvatar/AlphaAvatar',
  // One entry per documentation version, newest first; `/` leads to the first. A new version is
  // a new entry here (for example its release tag), not a new branch of this site. A ref can be
  // listed only once its snapshot holds docs/manifest.yaml (v0.6.9 and earlier do not).
  versions: [{ id: 'v0.7.0', label: 'v0.7.0', ref: 'dev/v0.7.0', editRef: 'dev/v0.7.0' }] as VersionSource[],
  locales: { en: 'English', 'zh-CN': '简体中文' } as Record<string, string>,
  defaultLocale: 'en',
}
