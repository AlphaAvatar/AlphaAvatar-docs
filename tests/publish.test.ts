import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { site } from '../site.config'
import { checkout, SITE_REPOSITORY, trigger, wait, type Build } from '../scripts/publish'

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_synthetic/synthetic-hook-key'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const build = (siteCommit: string | null, content: string): Build => ({
  site: siteCommit,
  repository: site.repository,
  versions: [{ id: 'v0.7.0', ref: 'dev/v0.7.0', sha: content, committed: '2026-11-28T00:00:00Z' }],
})

// A site serving `builds` one poll after another (the last one from then on), the GitHub API
// answering from `history` (each repository's commits, oldest first) and `deployments`.
function world(builds: (Build | undefined)[], history: Record<string, string[]>, deployments: { sha: string; created_at: string; status: { state: string; description?: string; log_url?: string } }[] = []) {
  const said: string[] = []
  let polls = 0
  let clock = Date.parse('2026-11-28T12:00:00Z')
  const fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.href.startsWith(`${site.url}/build.json`)) {
      const b = builds[Math.min(polls++, builds.length - 1)]
      return b ? json(b) : new Response('not found', { status: 404 })
    }
    const compare = /^\/repos\/([^/]+\/[^/]+)\/compare\/(\w+)\.\.\.(\w+)$/.exec(url.pathname)
    if (compare) {
      const commits = history[compare[1]]
      const [base, head] = [commits.indexOf(compare[2]), commits.indexOf(compare[3])]
      return json({ status: head > base ? 'ahead' : head === base ? 'identical' : 'behind' })
    }
    if (url.pathname === `/repos/${SITE_REPOSITORY}/deployments`) return json(deployments.map((d, i) => ({ sha: d.sha, created_at: d.created_at, statuses_url: `https://api.github.com/statuses/${i}` })))
    const status = /^\/statuses\/(\d+)$/.exec(url.pathname)
    if (status) return json([deployments[Number(status[1])].status])
    throw new Error(`unexpected request ${url.href}`)
  }) as typeof globalThis.fetch
  const io = { fetch, sleep: async (ms: number) => void (clock += ms), now: () => clock, say: (line: string) => void said.push(line) }
  return { io, said, polls: () => polls }
}

const HISTORY = { [SITE_REPOSITORY]: ['s1', 's2', 's3'], [site.repository]: ['c1', 'c2', 'c3'] }
const WANT = { site: 's2', ref: 'dev/v0.7.0', content: 'c2', since: '2026-11-28T12:00:00.000Z' }

test('the Deploy Hook is posted, its URL never shown, and what Vercel accepted is said to be not yet deployed', async () => {
  await assert.rejects(trigger(undefined), /DOCS_DEPLOY_HOOK_URL is not set/)
  const said: string[] = []
  const sent: { url: string; method?: string }[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), method: init?.method })
    return String(input) === HOOK ? json({ job: { id: 'job-1', state: 'PENDING', createdAt: Date.parse('2026-11-28T12:00:00Z') } }) : new Response('', { status: 404 })
  }) as typeof globalThis.fetch
  assert.deepEqual(await trigger(HOOK, { fetch, say: (l) => void said.push(l) }), { job: 'job-1', since: '2026-11-28T12:00:00.000Z' })
  assert.deepEqual(sent, [{ url: HOOK, method: 'POST' }])
  assert.match(said.join('\n'), /accepted Deploy Hook job `job-1` \(PENDING\).*not yet deployed/)
  await assert.rejects(trigger(`${HOOK}-gone`, { fetch, say: (l) => void said.push(l) }), (e: Error) => /answered 404/.test(e.message) && !e.message.includes('synthetic-hook-key'))
  assert.ok(!said.join('\n').includes('synthetic-hook-key'))
})

test('the wait ends once the site serves the site commit and the content commit wanted, or later ones', async () => {
  // Nothing yet, then the old build, then a build newer than wanted on both counts.
  const w = world([undefined, build('s1', 'c1'), build('s1', 'c2'), build('s3', 'c3')], HISTORY)
  const live = await wait(WANT, w.io)
  assert.equal(live.site, 's3')
  assert.equal(w.polls(), 4)
  assert.match(w.said.at(-1)!, /^Deployed: .* serves this repository at `s3` and dev\/v0.7.0 at `c3`, which includes `c2`\.$/)
  // Exactly what was wanted ends it at once.
  assert.equal((await wait(WANT, world([build('s2', 'c2')], HISTORY).io)).site, 's2')
})

test('a failed deployment that cannot be told for the build waited for is said, not taken for its outcome: the wait goes on until the site serves it', async () => {
  const deployments = [
    // Another commit's deployment, failed since the trigger.
    { sha: 's1', created_at: '2026-11-28T12:01:00Z', status: { state: 'failure', description: 'Deployment has failed', log_url: 'https://vercel.example/logs/1' } },
    // The wanted commit, built and failed before the wait began (a push's own build).
    { sha: 's2', created_at: '2026-11-28T11:58:00Z', status: { state: 'error', description: 'Build failed', log_url: 'https://vercel.example/logs/2' } },
    { sha: 's2', created_at: '2026-11-28T12:02:00Z', status: { state: 'error', description: 'Deployment has been canceled' } },
    { sha: 's0', created_at: '2026-11-28T11:00:00Z', status: { state: 'failure', description: 'long ago' } },
  ]
  // The build waited for is still building for three polls, then served.
  const w = world([build('s1', 'c1'), build('s1', 'c1'), build('s1', 'c1'), build('s2', 'c2')], HISTORY, deployments)
  assert.equal((await wait(WANT, w.io)).site, 's2')
  assert.equal(w.polls(), 4)
  const notes = w.said.filter((l) => l.startsWith('Vercel reports a failed'))
  assert.deepEqual(notes.map((l) => /deployment of (\w+) created/.exec(l)![1]), ['s1', 's2'])
  assert.ok(notes.every((l) => l.endsWith('not necessarily the build waited for, so the wait goes on.')))
  assert.match(w.said.at(-1)!, /^Deployed: /)

  // When it never comes, the time limit ends the wait, naming what failed meanwhile.
  await assert.rejects(
    wait(WANT, world([build('s1', 'c1')], HISTORY, deployments).io, 1),
    /after 1 minutes .* still serves site s1, dev\/v0\.7\.0 c1, not dev\/v0\.7\.0 c2 or later from site s2 or later: .*; failed meanwhile: production deployment of s1 .*logs\/1.*; production deployment of s2 .*logs\/2/,
  )
})

// A checkout made at commit A of a repository to which B is pushed afterwards, as Publish's is
// when the site serves a commit pushed while it waited.
test('the checkout moves to a commit pushed after it was made, fetching it first', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'publish-checkout-'))
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], { cwd, encoding: 'utf8' }).trim()
  const [remote, writer, site] = ['remote.git', 'writer', 'site'].map((d) => path.join(root, d))
  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', remote)
  git(root, 'clone', '--quiet', remote, writer)
  git(writer, 'commit', '--quiet', '--allow-empty', '-m', 'A')
  git(writer, 'push', '--quiet', 'origin', 'HEAD:main')
  git(root, 'clone', '--quiet', remote, site)
  git(writer, 'commit', '--quiet', '--allow-empty', '-m', 'B')
  git(writer, 'push', '--quiet', 'origin', 'HEAD:main')
  const b = git(writer, 'rev-parse', 'HEAD')
  assert.throws(() => git(site, 'cat-file', '-e', `${b}^{commit}`), 'B is not in the checkout yet')
  checkout(site, b)
  assert.equal(git(site, 'rev-parse', 'HEAD'), b)
  // Already there: nothing to fetch.
  checkout(site, b)
  assert.equal(git(site, 'rev-parse', 'HEAD'), b)
})

test('a site that does not say its own commit is never taken for the one wanted', async () => {
  await assert.rejects(wait(WANT, world([build(null, 'c3')], HISTORY).io, 1), /still serves site unknown, dev\/v0\.7\.0 c3/)
})
