import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parseDocument } from 'yaml'
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
  const file = path.join(root, 'docs/manifest.yaml')
  const manifest = parseDocument(readFileSync(file, 'utf8'))
  // One version's release notes, in every language, read and changed as YAML: only the Roadmap
  // disagrees, however the manifest is written.
  const documents = (manifest.toJS() as { documents: { type: string; applies_to: string; release?: { published: unknown } }[] }).documents
  const first = documents.find((d) => d.type === 'release' && d.release)!
  const date = String(first.release!.published)
  documents.forEach((d, i) => d.type === 'release' && d.applies_to === first.applies_to && manifest.setIn(['documents', i, 'release', 'published'], '2020-01-01'))
  writeFileSync(file, manifest.toString({ lineWidth: 0 }))
  assert.throws(
    () => checkSnapshot(root, 'copy'),
    (e: Error) => {
      const problems = e.message.split('\n').slice(1).filter((line) => !line.startsWith('docs: '))
      return (
        e.message.startsWith('copy fails its documentation check') &&
        problems.length > 0 &&
        problems.every((line) => line.includes(`Timeline ${first.applies_to}: released ${date}, `) && line.endsWith(' 2020-01-01'))
      )
    },
  )
})

test("inside another git repository the check still reads the snapshot's own files", () => {
  const root = copy()
  writeFileSync(path.join(root, 'docs/unlisted.md'), '# Unlisted\n')
  assert.throws(() => checkSnapshot(root, 'copy'), /docs\/unlisted\.md is neither listed nor grouped/)
})

test('a PYTHON given as a relative path is read from where the build runs, not from the snapshot', () => {
  const before = process.env.PYTHON
  const given = before || 'python3'
  const python = given.includes('/') ? path.resolve(given) : execFileSync('sh', ['-c', 'command -v "$0"', given], { encoding: 'utf8' }).trim()
  const relative = path.relative(process.cwd(), python)
  assert.ok(!path.isAbsolute(relative) && relative.includes('/'), relative)
  try {
    process.env.PYTHON = relative
    checkSnapshot(snapshots()[0].root, 'this build')
  } finally {
    if (before === undefined) delete process.env.PYTHON
    else process.env.PYTHON = before
  }
})
