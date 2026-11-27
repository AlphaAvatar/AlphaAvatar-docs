import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadVersion, type Version } from '../lib/site'

// Snapshots for tests: a manifest (schema 2) and files, written to a temporary directory.

// A public document in `group`; `extra` is more fields, such as `, translation_group: plan`.
export const entry = (id: string, file: string, title: string, lang: string, route: string, extra = '', group = 'main', order = 1) =>
  `  - {id: ${id}, path: ${file}, title: ${title}, type: guide, lang: ${lang}, route: ${route}, group: ${group}, order: ${order}, ` +
  `visibility: public, status: current, applies_to: snapshot${extra}}`

// One section, `main`, of one group, `main`.
export const ONE_SECTION = ['  - id: main', '    title: Main', '    summary: Everything.', '    groups:', '      - {id: main, title: Main}']

export function writeSnapshot(files: Record<string, string>, entries: string[], sections = ONE_SECTION): string {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-test-'))
  const all = { 'docs/manifest.yaml': ['schema: 2', 'repository: test', 'sections:', ...sections, 'documents:', ...entries, ''].join('\n'), ...files }
  for (const [file, body] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), body)
  }
  return root
}

export const load = (root: string, id = 't', editRef?: string): Version =>
  loadVersion({ id, label: id, ref: 'main', editRef, sha: '0'.repeat(40), committed: '2026-11-27T10:00:00+08:00', root })

export const snapshot = (files: Record<string, string>, entries: string[], sections = ONE_SECTION, id = 't') => load(writeSnapshot(files, entries, sections), id)
