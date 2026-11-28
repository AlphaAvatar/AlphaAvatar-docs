// The steps of the Publish workflow (.github/workflows/publish.yml), which builds the production
// site again when the main repository's documentation changes, or by hand, and checks it once
// it is served. Accepted is not deployed: `trigger` says what Vercel accepted, `wait` what the
// site serves.
//
//   tsx scripts/publish.ts trigger      POST DOCS_DEPLOY_HOOK_URL, the Vercel Deploy Hook of the
//                                       production branch; never shows the URL. Notes the
//                                       deployment the site served then (BEFORE; `none` if unnamed)
//   tsx scripts/publish.ts wait SITE REF CONTENT SINCE FILE [BEFORE]
//                                       wait until build.json at the site says this repository's
//                                       commit SITE or a later one, and for REF the main
//                                       repository's commit CONTENT or a later one, and, given
//                                       BEFORE, another deployment than BEFORE; write it to FILE.
//                                       Fail after WAIT_MINUTES (30), saying which production
//                                       deployments Vercel reported failed meanwhile.
//   tsx scripts/publish.ts checkout SHA this checkout moved to commit SHA, fetched first
//   tsx scripts/publish.ts pin FILE DIR a repository at DIR whose refs are the commits FILE names,
//                                       to build out/ from exactly them (ALPHAAVATAR_SOURCE=DIR)

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { site } from '../site.config'

export type Build = { site: string | null; deployment: string | null; repository: string; versions: { id: string; ref: string; sha: string; committed: string }[] }

export const SITE_REPOSITORY = 'AlphaAvatar/AlphaAvatar-docs'
const DEPLOYMENTS = 'https://vercel.com/alphaavatars-projects/alpha-avatar-docs/deployments'

type Io = { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; now: () => number; say: (line: string) => void }

const io: Io = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  now: () => Date.now(),
  say: (line) => {
    console.log(line)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
  },
}

const output = (name: string, value: string) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)

// The build.json the site serves, if it answers.
async function served(fetch: Io['fetch'], now: Io['now']) {
  const response = await fetch(`${site.url}/build.json?at=${now()}`, { cache: 'no-store' }).catch(() => undefined)
  return response?.ok ? ((await response.json()) as Build) : undefined
}

// The deployment served when the request is made is noted first: the build the request starts is
// another one, even where that one already serves the commits wanted.
export async function trigger(hook: string | undefined, { fetch, now, say }: Pick<Io, 'fetch' | 'now' | 'say'> = io) {
  if (!hook) throw new Error('DOCS_DEPLOY_HOOK_URL is not set: add the Deploy Hook URL as an Actions secret of this repository')
  const before = (await served(fetch, now))?.deployment ?? null
  const response = await fetch(hook, { method: 'POST' })
  if (!response.ok) throw new Error(`the Deploy Hook answered ${response.status}: nothing was triggered`)
  const { job } = (await response.json()) as { job: { id: string; state: string; createdAt: number } }
  const at = new Date(job.createdAt).toISOString()
  say(`Vercel accepted Deploy Hook job \`${job.id}\` (${job.state}) at ${at}, while the site served ${before ? `deployment \`${before}\`` : 'no deployment it names'}: a production build of this repository's main branch, not yet deployed.`)
  return { job: job.id, since: at, before }
}

// GitHub's API, read with the workflow's token.
const github = (get: typeof fetch) => async <T>(path: string): Promise<T> => {
  const token = process.env.GITHUB_TOKEN
  const response = await get(`https://api.github.com/${path}`, { headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) } })
  if (!response.ok) throw new Error(`GitHub API ${path} answered ${response.status}`)
  return (await response.json()) as T
}

// Whether commit `at` is `wanted` or later on its branch.
async function reaches(api: ReturnType<typeof github>, repository: string, wanted: string, at: string) {
  if (wanted === at) return true
  const { status } = await api<{ status: string }>(`repos/${repository}/compare/${wanted}...${at}`)
  return status === 'ahead' || status === 'identical'
}

// The production deployments Vercel reports failed (not cancelled) since `since`, or of the site
// commit wanted, which can have been built before the wait began. None of them can be told for
// the build this run waits for: GitHub's record of a deployment names its commit, not what
// started it (a Deploy Hook request, a push, an earlier run), and the same commit is built again
// by each request. So they are said, as what may explain a build that never comes, and what the
// site serves and the time limit decide.
async function failures(api: ReturnType<typeof github>, want: { site: string; since: string }) {
  const deployments = await api<{ sha: string; created_at: string; statuses_url: string }[]>(`repos/${SITE_REPOSITORY}/deployments?environment=Production&per_page=10`)
  const found: string[] = []
  for (const d of deployments.filter((d) => d.sha === want.site || Date.parse(d.created_at) >= Date.parse(want.since) - 1000)) {
    const [last] = await api<{ state: string; description?: string; log_url?: string; target_url?: string }[]>(d.statuses_url.replace('https://api.github.com/', ''))
    if (last && (last.state === 'failure' || last.state === 'error') && !/cancel/i.test(last.description ?? '')) {
      found.push(`production deployment of ${d.sha.slice(0, 7)} created ${d.created_at}: ${last.state}, ${last.description ?? 'no description'} (${last.log_url || last.target_url || DEPLOYMENTS})`)
    }
  }
  return found
}

// `before`, for a Deploy Hook's request: the deployment served when it was accepted (null: none
// named), which does not answer it.
export async function wait(want: { site: string; ref: string; content: string; since: string; before?: string | null }, { fetch, sleep, now, say }: Io = io, minutes = Number(process.env.WAIT_MINUTES || 30)) {
  const api = github(fetch)
  const until = now() + minutes * 60_000
  const requested = want.before !== undefined
  let seen = ''
  const noted = new Set<string>()
  for (;;) {
    const live = await served(fetch, now)
    const content = live?.versions.find((v) => v.ref === want.ref)?.sha
    const serving = live ? `site ${live.site?.slice(0, 7) ?? 'unknown'}, ${want.ref} ${content?.slice(0, 7) ?? 'unknown'}${live.deployment ? ` (deployment ${live.deployment})` : ''}` : 'no build.json'
    if (serving !== seen) say(`${new Date(now()).toISOString()}: ${site.url} serves ${(seen = serving)}`)
    const fresh = !requested || (!!live?.deployment && live.deployment !== want.before)
    if (fresh && live?.site && content && (await reaches(api, SITE_REPOSITORY, want.site, live.site)) && (await reaches(api, site.repository, want.content, content))) {
      const by = live.deployment ? `, in deployment \`${live.deployment}\`` : ''
      const after = requested ? `, not the one served when Vercel accepted the request (${want.before ? `\`${want.before}\`` : 'none named'})` : ''
      say(`Deployed: ${site.url} serves this repository at \`${live.site}\` and ${want.ref} at \`${content}\`, which includes \`${want.content}\`${by}${after}.`)
      return live
    }
    for (const failure of await failures(api, want)) {
      if (noted.has(failure)) continue
      noted.add(failure)
      say(`Vercel reports a failed ${failure}; not necessarily the build waited for, so the wait goes on.`)
    }
    if (now() >= until) {
      const why = noted.size ? `; failed meanwhile: ${[...noted].join('; ')}` : ''
      const after = requested ? ` in another deployment than ${want.before ?? 'the unnamed one'} served when the request was accepted` : ''
      throw new Error(`after ${minutes} minutes ${site.url} still serves ${serving}, not ${want.ref} ${want.content.slice(0, 7)} or later from site ${want.site.slice(0, 7)} or later${after}: the build failed, was cancelled or is still queued (${DEPLOYMENTS})${why}`)
    }
    await sleep(20_000)
  }
}

// The site can serve a commit of this repository pushed after the checkout at `dir` was made:
// it is fetched before the checkout moves to it.
export function checkout(dir: string, sha: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  const has = () => {
    try {
      git('cat-file', '-e', `${sha}^{commit}`)
      return true
    } catch {
      return false
    }
  }
  if (!has()) git('fetch', '--quiet', 'origin')
  if (!has()) git('fetch', '--quiet', 'origin', sha)
  git('checkout', '--quiet', '--detach', sha)
}

export function pin(build: Build, dir: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] })
  mkdirSync(dir, { recursive: true })
  git('init', '--quiet')
  for (const v of build.versions) {
    git('fetch', '--quiet', '--depth=1', `https://github.com/${build.repository}.git`, v.sha)
    git('update-ref', `refs/heads/${v.ref}`, v.sha)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'trigger') {
      const { since, before } = await trigger(process.env.DOCS_DEPLOY_HOOK_URL)
      output('since', since)
      output('before', before ?? 'none')
    } else if (command === 'wait') {
      const [siteCommit, ref, content, since, file, before] = args
      const live = await wait({ site: siteCommit, ref, content, since, before: before ? (before === 'none' ? null : before) : undefined })
      writeFileSync(file, JSON.stringify(live, null, 2) + '\n')
      output('site', live.site!)
      output('deployment', live.deployment ?? '')
    } else if (command === 'checkout') checkout(process.cwd(), args[0])
    else if (command === 'pin') pin(JSON.parse(readFileSync(args[0], 'utf8')) as Build, args[1])
    else throw new Error('usage: publish.ts trigger | wait SITE REF CONTENT SINCE FILE [BEFORE] | checkout SHA | pin FILE DIR')
  } catch (e) {
    console.error(`publish: ${(e as Error).message}`)
    process.exit(1)
  }
}
