// What this site publishes. Document text, titles, sections, languages and planning state come
// from each source snapshot's docs/manifest.yaml; this file only says where the snapshots are.

export type VersionSource = {
  // URL segment and the version selector's entry, e.g. `v0.7.0`.
  id: string
  label: string
  // Branch or tag in the source repository; resolved to one commit per build.
  ref: string
  // The branch still being written: "Edit source" links go to it.
  development?: boolean
}

export const site = {
  name: 'AlphaAvatar Docs',
  url: 'https://docs.alphaavatar.io',
  repository: 'AlphaAvatar/AlphaAvatar',
  // One entry per documentation version, newest first; `/` leads to the first. A new version is
  // a new entry here (for example its release tag), not a new branch of this site. A ref can be
  // listed only once its snapshot holds docs/manifest.yaml (v0.6.9 and earlier do not).
  versions: [{ id: 'v0.7.0', label: 'v0.7.0', ref: 'dev/v0.7.0', development: true }] as VersionSource[],
  // Manifest sections linked from the header.
  header: ['get-started', 'development', 'reference'],
  locales: { en: 'English', 'zh-CN': '简体中文' } as Record<string, string>,
  defaultLocale: 'en',
}
