import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { VersionSource } from '../site.config'

export const CACHE = path.join(process.cwd(), '.cache')
export const SOURCES_FILE = path.join(CACHE, 'sources.json')

// One version pinned to one commit, extracted under .cache/snapshots/<sha>.
export type Snapshot = VersionSource & { sha: string; committed: string; root: string }

let loaded: Snapshot[] | undefined

// Every output of a build reads these snapshots, so HTML, Markdown, search and llms.txt
// describe the same commits.
export function snapshots(): Snapshot[] {
  if (!loaded) {
    try {
      loaded = JSON.parse(readFileSync(SOURCES_FILE, 'utf8')).versions as Snapshot[]
    } catch {
      throw new Error(`${SOURCES_FILE} is missing: run \`pnpm sources\` first`)
    }
  }
  return loaded
}
