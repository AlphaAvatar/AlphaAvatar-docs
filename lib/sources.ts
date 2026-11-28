import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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

// A snapshot passes the main repository's own documentation check, the one its
// CONTRIBUTING.md asks for (manifest, links and anchors, the Roadmap and its release dates), run
// from the snapshot on itself before anything is built from it: what is checked is what is
// published. It needs Python 3 with PyYAML: PYTHON, a command or a path read from where the build
// runs (the check itself runs in the snapshot), else python3. Git is kept from finding a
// repository around the snapshot, such as this one around .cache/, so that the check lists the
// snapshot's own files.
export function checkSnapshot(root: string, label: string) {
  const script = path.join(root, 'scripts/docs/check_docs.py')
  if (!existsSync(script)) throw new Error(`${label} has no scripts/docs/check_docs.py: it cannot be checked, so it is not published`)
  const given = process.env.PYTHON || 'python3'
  const python = /[\\/]/.test(given) ? path.resolve(given) : given
  try {
    execFileSync(python, [script], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(root), PYTHONDONTWRITEBYTECODE: '1' },
    })
  } catch (e) {
    const { code, stdout, stderr } = e as { code?: string; stdout?: string; stderr?: string }
    if (code === 'ENOENT') throw new Error(`${python} is not installed: the documentation check of ${label} needs Python 3 with PyYAML (set PYTHON to one)`)
    throw new Error(`${label} fails its documentation check, so it is not published:\n${`${stdout ?? ''}${stderr ?? ''}`.trim()}`)
  }
}
