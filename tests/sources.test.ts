import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { checkSnapshot, snapshots } from '../lib/sources'

// A copy of the snapshot this build reads, under .cache/ of a git repository of its own, as the
// build's snapshots are under this repository's.
function copy() {
  const repo = mkdtempSync(path.join(tmpdir(), 'docs-check-'))
  execFileSync('git', ['init', '--quiet'], { cwd: repo })
  const root = path.join(repo, '.cache/snapshots/copy')
  cpSync(snapshots()[0].root, root, { recursive: true })
  return root
}

test('the snapshot this build publishes passes its own documentation check', () => {
  checkSnapshot(snapshots()[0].root, 'this build')
})

test('a release date that differs from the Roadmap fails the check, and with it the build', () => {
  const root = copy()
  const manifest = path.join(root, 'docs/manifest.yaml')
  const text = readFileSync(manifest, 'utf8')
  // The latest release notes, in both languages, so that only the Roadmap disagrees.
  const [release, , date] = /release: \{tag: (v[\d.]+), published: (\d{4}-\d{2}-\d{2})\}/.exec(text)!
  writeFileSync(manifest, text.replaceAll(release, release.replace(date, '2020-01-01')))
  assert.throws(
    () => checkSnapshot(root, 'copy'),
    (e: Error) => e.message.startsWith('copy fails its documentation check') && e.message.includes(`released ${date}`) && e.message.includes(' 2020-01-01'),
  )
})

test("inside another git repository the check still reads the snapshot's own files", () => {
  const root = copy()
  writeFileSync(path.join(root, 'docs/unlisted.md'), '# Unlisted\n')
  assert.throws(() => checkSnapshot(root, 'copy'), /docs\/unlisted\.md is neither listed nor grouped/)
})
