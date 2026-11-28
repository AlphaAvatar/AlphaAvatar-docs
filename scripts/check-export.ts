// What the host serves from out/, checked before a deployment and after one. The host (Vercel,
// serving a Next.js export) first applies Next's trailing-slash rule: `/x` leads to `/x/` and,
// where the last segment reads as a file name (`v0.7.0`), `/x.v/` to `/x.v`, both by 308. Then it
// applies vercel.json's redirects, and then it serves a directory's index.html at the directory,
// `X.html` where the directory X would be, and any other file at its own path. It serves nothing
// at an address ending in `.html`.
//
//   pnpm check:export        out/ as built: no address is served from two different files; every
//                            address of this site that a page, Markdown file, index or the
//                            sitemap names is served as named, with no redirect; each redirect
//                            leads in one step to an address of this site that is served. `pnpm
//                            build` ends with it.
//   pnpm check:export URL    a deployment of what out/ was built from: each address answers 200
//                            with what out/ holds for it, and its old form with a slash leads to
//                            it; every address its pages name answers 200; a missing one answers
//                            404; each redirect leads as vercel.json says to what out/ holds, in
//                            one step, with no loop and never off the site. A protected preview
//                            is read with VERCEL_AUTOMATION_BYPASS_SECRET, sent to it alone:
//                            nothing is requested anywhere else.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { site } from '../site.config'

export type Redirect = { source: string; destination: string; permanent: boolean }

// Next's trailing-slash rule (next/dist/lib/load-custom-routes.js): where it leads an address.
const FILE_WITH_SLASH = /^\/(?!\.well-known(?:\/.*)?)(?:[^/]+\/)*[^/]+\.\w+\/$/
const DIRECTORY_WITHOUT_SLASH = /^\/(?!\.well-known(?:\/.*)?)(?:[^/]+\/)*[^/.]+$/

export function slashRule(address: string): string | undefined {
  if (FILE_WITH_SLASH.test(address)) return address.slice(0, -1)
  if (DIRECTORY_WITHOUT_SLASH.test(address)) return `${address}/`
}

// The address the host serves an exported file at; `file` is relative to out/, with `/`.
export function servedAt(file: string): string {
  if (file === 'index.html') return '/'
  const directory = file.endsWith('/index.html') ? file.slice(0, -'/index.html'.length) : file.endsWith('.html') ? file.slice(0, -'.html'.length) : undefined
  if (directory === undefined) return `/${file}`
  return slashRule(`/${directory}/`) ?? `/${directory}/`
}

const plain = (address: string) => {
  try {
    return decodeURI(address)
  } catch {
    return address
  }
}

const entities = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const OWN = new RegExp(`${site.url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(/[^\\s"'<>()[\\]\\\\]*)`, 'g')

// The addresses of this site a file names: an HTML file's href, src and srcset (a relative one
// read from the file's own address), a search index's hrefs, and the site's own URL anywhere.
export function addressesIn(file: string, text: string): string[] {
  const base = new URL(servedAt(file), site.url)
  const found = new Set<string>()
  const add = (ref: string) => {
    try {
      const url = new URL(ref, base)
      if (url.origin === base.origin) found.add(plain(url.pathname))
    } catch {}
  }
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/\s(?:href|src)="([^"]*)"/g)) add(entities(m[1]))
    for (const m of text.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of entities(m[1]).split(',')) add(part.trim().split(/\s+/)[0])
  }
  if (file.endsWith('.json')) for (const m of text.matchAll(/"href":"([^"]*)"/g)) add(m[1])
  for (const m of text.matchAll(OWN)) add(site.url + m[1])
  return [...found]
}

// The files whose addresses are checked: pages and the site's own outputs, not Next's payloads.
const NAMES = (file: string) => /\.(html|md|json|xml)$/.test(file) || file === 'llms.txt' || file.endsWith('/llms.txt')

// Where a redirect leads an address, if its source matches it.
function redirectRule(r: Redirect) {
  const names: string[] = []
  const source = new RegExp(`^${r.source.replace(/:(\w+)(\(([^)]*)\))?/g, (_, name: string, _group, choices?: string) => (names.push(name), `(${choices ?? '[^/]+'})`))}$`)
  return (address: string) => {
    const m = source.exec(address)
    return m ? names.reduce((to, name, i) => to.replace(`:${name}`, m[i + 1]), r.destination) : undefined
  }
}

const redirectOf = (redirects: Redirect[]) => {
  const rules = redirects.map((r) => ({ to: redirectRule(r), status: r.permanent ? 308 : 307 }))
  return (address: string) => {
    for (const rule of rules) {
      const to = rule.to(address)
      if (to) return { status: rule.status, to }
    }
  }
}

// Every way a redirect's source is written: each listed choice, each version for `:version`.
function instances(r: Redirect): { from: string; to: string; status: number }[] {
  let found = [{ from: r.source, to: r.destination }]
  for (const [, name, , choices] of r.source.matchAll(/:(\w+)(\(([^)]*)\))?/g)) {
    const values = choices?.split('|') ?? (name === 'version' ? site.versions.map((v) => v.id) : [])
    const param = new RegExp(`:${name}(\\([^)]*\\))?`)
    found = found.flatMap((f) => values.map((value) => ({ from: f.from.replace(param, value), to: f.to.replace(param, value) })))
  }
  return found.map((f) => ({ ...f, status: r.permanent ? 308 : 307 }))
}

const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex')

// Each address and the files served at it.
function addresses(files: Map<string, Buffer>) {
  const at = new Map<string, string[]>()
  for (const file of files.keys()) at.set(plain(servedAt(file)), [...(at.get(plain(servedAt(file))) ?? []), file])
  return at
}

// One answer: a redirect names where it leads, a path of this site or, off it, the whole URL.
type Step = { status: number; to?: string; body?: Buffer }

// A redirect's Location, read from the URL that answered it: its path, query and fragment where it
// stays at that origin, else the URL it leads off to.
export function leadsTo(location: string, from: URL | string): string {
  const to = new URL(location, from)
  return to.origin === new URL(from).origin ? plain(to.pathname) + to.search + to.hash : to.href
}

// The URL of an address of this site at `base`: its path, query and fragment set in base's URL,
// never read as a reference, so that a path such as `//elsewhere/…` stays a path there.
export function urlAt(address: string, base: string): URL {
  const [, path, search = '', hash = ''] = /^([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/.exec(address)!
  const url = new URL(base)
  url.pathname = encodeURI(path)
  url.search = search
  url.hash = hash
  return url
}

// More redirects than this from one address, a loop, leaving the site or an address that is not
// served ends it.
export const MAX_HOPS = 5

// The redirects an address leads through, to the first answer that is not one.
async function trace(address: string, step: (address: string) => Promise<Step>) {
  const hops: { status: number; to: string }[] = []
  const seen = new Set([address])
  for (let at = address; ; ) {
    const answer = await step(at)
    if (!answer.to) return { hops, at, answer, end: 'answer' as const }
    hops.push({ status: answer.status, to: answer.to })
    if (!answer.to.startsWith('/')) return { hops, at: answer.to, answer, end: 'off site' as const }
    if (seen.has(answer.to)) return { hops, at: answer.to, answer, end: 'loop' as const }
    if (hops.length > MAX_HOPS) return { hops, at: answer.to, answer, end: 'too many' as const }
    seen.add(answer.to)
    at = answer.to
  }
}

// Each redirect, as the host answers it: past the host's own trailing-slash 308 at most, one step
// to its destination, which answers 200 (and, at a deployment, with what out/ holds there).
async function checkRedirects(redirects: Redirect[], step: (address: string) => Promise<Step>, same?: (address: string, body: Buffer) => string | undefined) {
  const problems: string[] = []
  for (const r of redirects) {
    for (const { from, to, status } of instances(r)) {
      const t = await trace(from, step)
      const chain = [from, ...t.hops.map((h) => `${h.status} ${h.to}`)].join(' → ')
      const last = t.hops.at(-1)
      if (t.end === 'off site') problems.push(`${from} leads off the site: ${chain}`)
      else if (t.end === 'loop') problems.push(`${from} loops: ${chain}`)
      else if (t.end === 'too many') problems.push(`${from} takes more than ${MAX_HOPS} redirects: ${chain}`)
      else if (t.answer.status !== 200) problems.push(`${from} ends at ${t.at}, which answers ${t.answer.status}: ${chain}`)
      else if (!last || last.status !== status || last.to !== to || t.hops.length > 1 + Number(t.hops[0].status === 308 && slashRule(from) === t.hops[0].to)) {
        problems.push(`${from} answers ${chain}, not ${status} to ${to} and 200 there`)
      } else {
        const other = same?.(t.at, t.answer.body!)
        if (other) problems.push(`${from} leads to ${t.at}, which answers with ${other}`)
      }
    }
  }
  return problems
}

export async function checkExport(files: Map<string, Buffer>, redirects: Redirect[]): Promise<string[]> {
  const problems: string[] = []
  const at = addresses(files)
  // Next writes its not-found page twice; files that are the same are one.
  for (const [address, served] of at) {
    if (served.length > 1 && new Set(served.map((f) => digest(files.get(f)!))).size > 1) {
      problems.push(`${address} is served from ${served.join(' and ')}, which differ: the host serves only one of them`)
    }
  }

  // The host's answer at an address of out/.
  const redirect = redirectOf(redirects)
  const answer = (address: string): Step => {
    const slash = slashRule(address)
    if (slash) return { status: 308, to: slash }
    return redirect(address) ?? (at.has(address) ? { status: 200 } : { status: 404 })
  }

  const named = new Map<string, string[]>()
  for (const [file, body] of files) {
    if (!NAMES(file)) continue
    for (const address of addressesIn(file, body.toString('utf8'))) if (answer(address).status !== 200) named.set(address, [...(named.get(address) ?? []), file])
  }
  for (const [address, from] of named) {
    const a = answer(address)
    const by = `${from.length} file(s) name it: ${from.slice(0, 3).join(', ')}${from.length > 3 ? ', …' : ''}`
    problems.push(a.to ? `${address} leads to ${a.to} by ${a.status}, and ${by}; name ${a.to}` : `${address} is not served, and ${by}`)
  }

  problems.push(...(await checkRedirects(redirects, async (address) => answer(address))))
  return problems
}

// What a reader sees of a page: its title and text, without scripts and styles, whose build
// identifiers differ from one build of the same sources to the next.
export const visible = (html: string) =>
  entities(
    html
      .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )

// Next's own files (its not-found page and the payloads beside pages) and the build's assets,
// whose names change with the build.
const NOT_FOUND = (file: string) => file === '404.html' || file.startsWith('404/') || file.startsWith('_not-found/')
const BUILT = (file: string) => file.startsWith('_next/') || (file.endsWith('.txt') && !NAMES(file))

async function each<T>(items: T[], run: (item: T) => Promise<void>, at = 8) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: at }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item)
    }),
  )
}

export async function checkDeployment(base: string, files: Map<string, Buffer>, redirects: Redirect[]): Promise<string[]> {
  const problems: string[] = []
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const origin = new URL(base).origin
  const step = async (address: string): Promise<Step> => {
    const url = urlAt(address, base)
    // A request, and the secret with it, goes to the deployment only.
    if (url.origin !== origin) throw new Error(`check-export: ${address} would be requested from ${url.origin}, not ${origin}`)
    const response = await fetch(url, { redirect: 'manual', headers: secret ? { 'x-vercel-protection-bypass': secret } : {} })
    const body = Buffer.from(await response.arrayBuffer())
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    return { status: response.status, to: location ? leadsTo(location, url) : undefined, body }
  }
  const told = (s: Step) => `${s.status}${s.to ? ` to ${s.to}` : ''}`
  const redirect = redirectOf(redirects)
  const all = addresses(files)

  // Whether what the deployment answered at an address is what out/ holds there: a page by what a
  // reader sees, any other file byte for byte; else what it is.
  const same = (address: string, body: Buffer) => {
    const served = all.get(address) ?? []
    const matching = served.filter((file) => (file.endsWith('.html') ? visible(body.toString('utf8')) === visible(files.get(file)!.toString('utf8')) : digest(body) === digest(files.get(file)!)))
    if (!served.length || matching.length !== served.length) return `${matching.length ? matching.join(' and ') : 'something else'}, of ${served.join(' and ') || 'nothing out/ serves'}`
  }

  const named = new Set<string>()
  const at = [...all].filter(([address, served]) => !redirect(address) && !served.some((f) => NOT_FOUND(f) || f.startsWith('_next/')))
  // An address out/ serves from two different files must answer with neither: checkExport says why.
  await each(at, async ([address, served]) => {
    const answer = await step(address)
    if (answer.status !== 200) return void problems.push(`${address} answers ${told(answer)}, not ${served.join(' or ')}`)
    if (BUILT(served[0])) return
    const other = same(address, answer.body!)
    if (other) problems.push(`${address} answers with ${other}`)
    if (NAMES(served[0])) for (const a of addressesIn(served[0], answer.body!.toString('utf8'))) named.add(a)
    // A page whose address has no slash was at the one with a slash before: it still leads there.
    if (served[0].endsWith('index.html') && !address.endsWith('/')) {
      const old = await step(`${address}/`)
      if (old.status !== 308 || old.to !== address) problems.push(`${address}/ answers ${told(old)}, not 308 to ${address}`)
    }
  })

  // What the deployed pages and files name beyond out/'s addresses: the build's assets, and any
  // mistake. Each is answered as named.
  const served = new Set(at.map(([address]) => address))
  await each([...named].filter((a) => !served.has(a)), async (address) => {
    const answer = await step(address)
    if (answer.status !== 200) problems.push(`${address}, which the deployment names, answers ${told(answer)}`)
  })

  const missing = `/${site.defaultLocale}/${site.versions[0].id}/no-such-page-${Date.now()}/`
  const notFound = await step(missing)
  if (notFound.status !== 404 || visible(notFound.body!.toString('utf8')) !== visible(files.get('404.html')?.toString('utf8') ?? '')) {
    problems.push(`${missing} answers ${told(notFound)}, not the not-found page with 404`)
  }

  problems.push(...(await checkRedirects(redirects, step, same)))
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.join(process.cwd(), 'out')
  const list = readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(out, path.join(d.parentPath, d.name)).split(path.sep).join('/'))
  const files = new Map(list.map((f) => [f, readFileSync(path.join(out, f))]))
  const { redirects } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { redirects: Redirect[] }
  const base = process.argv[2]
  const problems = base ? await checkDeployment(base, files, redirects) : await checkExport(files, redirects)
  for (const p of problems.sort()) console.error(`check-export: ${p}`)
  if (problems.length) process.exit(1)
  console.log(`check-export: ${base ?? 'out/'}: ${addresses(files).size} addresses from ${files.size} files, as the host serves them`)
}
