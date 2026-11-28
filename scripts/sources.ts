// Resolve every configured version to one commit, extract it under .cache/snapshots/<sha> and
// run the main repository's documentation check on it (lib/sources.ts checkSnapshot).
//
// ALPHAAVATAR_SOURCE selects the repository: a local clone (read as it is, nothing fetched) or
// a git URL. Unset, the GitHub repository in site.config.ts is fetched into .cache/repo.git.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { site } from '../site.config'
import { CACHE, checkSnapshot, SOURCES_FILE, type Snapshot } from '../lib/sources'

const git = (args: string[], cwd: string) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 }).trim()

const source = process.env.ALPHAAVATAR_SOURCE || `https://github.com/${site.repository}.git`
const remote = /^[a-z+]+:\/\/|^git@/.test(source)

function repository(): string {
  if (!remote) return path.resolve(source)
  const bare = path.join(CACHE, 'repo.git')
  if (!existsSync(bare)) {
    mkdirSync(bare, { recursive: true })
    git(['init', '--bare', '--quiet'], bare)
  }
  return bare
}

// A remote ref is fetched alone and shallow: only the commit being published.
function resolve(repo: string, ref: string): string {
  if (!remote) return git(['rev-parse', '--verify', `${ref}^{commit}`], repo)
  git(['fetch', '--quiet', '--depth=1', '--force', source, ref], repo)
  return git(['rev-parse', 'FETCH_HEAD^{commit}'], repo)
}

function extract(repo: string, sha: string): string {
  const dir = path.join(CACHE, 'snapshots', sha)
  if (existsSync(dir)) return dir

  const partial = `${dir}.partial`
  rmSync(partial, { recursive: true, force: true })
  mkdirSync(partial, { recursive: true })
  const tar = execFileSync('git', ['archive', '--format=tar', sha], { cwd: repo, maxBuffer: 1 << 30 })
  execFileSync('tar', ['-x', '-C', partial], { input: tar })
  renameSync(partial, dir)
  return dir
}

const repo = repository()
const versions: Snapshot[] = site.versions.map((version) => {
  const sha = resolve(repo, version.ref)
  const root = extract(repo, sha)
  if (!existsSync(path.join(root, 'docs/manifest.yaml'))) {
    throw new Error(`${version.ref} (${sha.slice(0, 8)}) has no docs/manifest.yaml; it cannot be published`)
  }
  checkSnapshot(root, `${version.ref} (${sha.slice(0, 8)})`)
  const committed = git(['show', '-s', '--format=%cI', sha], repo)
  return { ...version, sha, committed, root }
})

// Keep only the snapshots this build uses.
const used = new Set(versions.map((v) => v.sha))
for (const name of readdirSync(path.join(CACHE, 'snapshots'))) {
  if (!used.has(name)) rmSync(path.join(CACHE, 'snapshots', name), { recursive: true, force: true })
}

writeFileSync(SOURCES_FILE, JSON.stringify({ repository: site.repository, versions }, null, 2) + '\n')
for (const v of versions) console.log(`sources: ${v.id} ← ${v.ref} ${v.sha.slice(0, 12)} (${v.committed})`)
