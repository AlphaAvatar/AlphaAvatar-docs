import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { checkSnapshot, snapshots } from '../lib/sources'

// A repository of its own, as small as the main repository's documentation check accepts: a
// Roadmap whose Timeline releases v0.1.0 on 2026-01-05, and its release notes dated `published`;
// the check is the one of the snapshot this build reads. It sits under .cache/ of another git
// repository, as the build's snapshots sit under this one's.
function fixture(published: string, files: Record<string, string> = {}) {
  const repo = mkdtempSync(path.join(tmpdir(), 'docs-check-'))
  execFileSync('git', ['init', '--quiet'], { cwd: repo })
  const root = path.join(repo, '.cache/snapshots/fixture')
  for (const script of ['check_docs.py', 'cli_preview.py']) {
    mkdirSync(path.join(root, 'scripts/docs'), { recursive: true })
    cpSync(path.join(snapshots()[0].root, 'scripts/docs', script), path.join(root, 'scripts/docs', script))
  }
  const all: Record<string, string> = {
    'docs/manifest.yaml': [
      'schema: 2',
      'sections:',
      '  - id: updates',
      '    title: Updates',
      '    summary: Plans and releases.',
      '    groups:',
      '      - {id: plan, title: Plan}',
      '      - {id: releases, title: Release notes}',
      'groups:',
      '  - {id: cli-output-recordings, pattern: "docs/cli/cli-output.json", title: CLI output recordings, type: illustration, lang: en, visibility: internal, status: illustrative}',
      'documents:',
      '  - {id: roadmap, path: docs/ROADMAP.md, title: Roadmap, type: roadmap, lang: en, route: /roadmap, group: plan, order: 1, visibility: public, status: current, applies_to: snapshot}',
      `  - {id: release-v0.1.0, path: docs/releases/v0.1.0.md, title: v0.1.0, type: release, lang: en, route: /releases/v0.1.0, group: releases, order: 1, visibility: public, status: historical, applies_to: v0.1.0, release: {tag: v0.1.0, published: ${published}}}`,
      '',
    ].join('\n'),
    'docs/ROADMAP.md': [
      '# Roadmap',
      '',
      '| Milestone | Version | Theme | Release | Released | Release notes |',
      '| --- | --- | --- | --- | --- | --- |',
      '| [`v0.1.0`](#v0.1.0) | v0.1.0 | The first release | released | 2026-01-05 | [v0.1.0](releases/v0.1.0.md) |',
      '',
      '<a id="v0.1.0"></a>',
      '### v0.1.0',
      '',
      'Released.',
      '',
    ].join('\n'),
    'docs/releases/v0.1.0.md': '# v0.1.0\n\nThe first release.\n',
    'docs/cli/cli-output.json': JSON.stringify({ palette: {}, pages: [], panels: [] }),
    ...files,
  }
  for (const [file, body] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), body)
  }
  return root
}

// The problems the check reports for a snapshot, none where it passes.
function problemsOf(root: string): string[] {
  try {
    checkSnapshot(root, 'fixture')
    return []
  } catch (e) {
    const message = (e as Error).message
    if (!message.startsWith('fixture fails its documentation check')) throw e
    return message.split('\n').slice(1).filter((line) => !line.startsWith('docs: '))
  }
}

test('the snapshot this build publishes passes its own documentation check', () => {
  checkSnapshot(snapshots()[0].root, 'this build')
})

// Each case is told by the problems it adds to the same fixture without it, so that the check's
// other rules, now or later, do not decide the outcome.
test('a release date that differs from the Roadmap fails the check, and with it the build', () => {
  const same = problemsOf(fixture('2026-01-05'))
  const moved = problemsOf(fixture('2026-02-01'))
  const added = moved.filter((line) => !same.includes(line))
  assert.ok(added.length > 0, moved.join('\n'))
  assert.ok(
    added.every((line) => line.includes('2026-01-05') && line.includes('2026-02-01') && line.includes('docs/releases/v0.1.0.md')),
    added.join('\n'),
  )
})

test("inside another git repository the check still reads the snapshot's own files", () => {
  const same = problemsOf(fixture('2026-01-05'))
  const unlisted = problemsOf(fixture('2026-01-05', { 'docs/unlisted.md': '# Unlisted\n' }))
  const added = unlisted.filter((line) => !same.includes(line))
  assert.ok(added.length > 0 && added.every((line) => line.includes('docs/unlisted.md')), unlisted.join('\n'))
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
