import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

// docs/manifest.yaml of the source repository; its header describes every field.

// A section's title is one string for every language, or one per language.
export type Section = { id: string; title: string | Record<string, string> }

export const sectionTitle = (section: Section, locale: string): string =>
  typeof section.title === 'string' ? section.title : (section.title[locale] ?? section.title.en ?? section.id)

export type Doc = {
  id: string
  path: string
  title: string
  type: string
  lang: string
  route: string
  section: string
  order: number
  visibility: 'public' | 'internal'
  status: 'current' | 'planned' | 'historical' | 'illustrative'
  applies_to: string
  translation_group?: string
  release?: { tag: string; published: string }
  format?: 'html'
}

export type Manifest = { schema: number; repository: string; sections: Section[]; documents: Doc[] }

export function loadManifest(root: string): Manifest {
  const manifest = parse(readFileSync(path.join(root, 'docs/manifest.yaml'), 'utf8')) as Manifest
  if (manifest.schema !== 1) throw new Error(`docs/manifest.yaml schema ${manifest.schema} is not supported`)
  for (const doc of manifest.documents) {
    if (doc.release) doc.release.published = String(doc.release.published)
  }
  return manifest
}
