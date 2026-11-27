import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

// docs/manifest.yaml of the source repository; its header describes every field.

// A title or summary: one string for every language, or one per language.
export type Text = string | Record<string, string>

// A navigation group: its documents, then its own groups (one level deep).
export type Group = { id: string; title: Text; summary?: Text; groups?: Group[] }

export type Section = { id: string; title: Text; summary: Text; groups: Group[] }

export const textIn = (value: Text | undefined, locale: string): string =>
  value === undefined ? '' : typeof value === 'string' ? value : (value[locale] ?? value.en ?? Object.values(value)[0] ?? '')

export const sectionTitle = (section: Section | Group, locale: string): string => textIn(section.title, locale) || section.id

export type Doc = {
  id: string
  path: string
  title: string
  type: string
  lang: string
  route: string
  group: string
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
  if (manifest.schema !== 2) throw new Error(`docs/manifest.yaml schema ${manifest.schema} is not supported; this site reads schema 2`)
  for (const doc of manifest.documents) {
    if (doc.release) doc.release.published = String(doc.release.published)
  }
  return manifest
}

// Where a group sits: its section and its groups from the section down, itself last.
export type Place = { section: Section; groups: Group[] }

export function places(manifest: Manifest): Map<string, Place> {
  const found = new Map<string, Place>()
  for (const section of manifest.sections) {
    for (const group of section.groups) {
      for (const [g, path] of [[group, [group]] as const, ...(group.groups ?? []).map((sub) => [sub, [group, sub]] as const)]) {
        if (found.has(g.id)) throw new Error(`manifest: group ${g.id} repeats`)
        found.set(g.id, { section, groups: [...path] })
      }
    }
  }
  return found
}
