// What the host serves from out/, checked before a deployment and after one. The host (Vercel,
// serving a Next.js export) answers vercel.json's redirects first; it serves a directory's
// index.html at the directory, `X.html` at `/X/` (`/X` leads there), any other file at its own
// path, and nothing at an address ending in `.html`.
//
//   pnpm check:export        out/ as built: no address is served from two different files, and
//                            every address of this site that a page, Markdown file, index or the
//                            sitemap names is served or redirected. `pnpm build` ends with it.
//   pnpm check:export URL    a deployment of what out/ was built from: each address answers with
//                            what out/ holds for it, every address its pages name answers, a
//                            missing one answers 404, and each redirect answers as vercel.json
//                            says. A protected preview is read with VERCEL_AUTOMATION_BYPASS_SECRET.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { site } from '../site.config'

export type Redirect = { source: string; destination: string; permanent: boolean }

// The address the host serves an exported file at; `file` is relative to out/, with `/`.
export function servedAt(file: string): string {
  if (file === 'index.html' || file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`
  if (file.endsWith('.html')) return `/${file.slice(0, -'.html'.length)}/`
  return `/${file}`
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

function redirectRule(source: string) {
  return new RegExp(`^${source.replace(/:(\w+)(\(([^)]*)\))?/g, (_, _name, _group, choices?: string) => `(${choices ?? '[^/]+'})`)}$`)
}

export function answered(address: string, served: Set<string>, redirects: Redirect[]) {
  return served.has(address) || (!address.endsWith('/') && served.has(`${address}/`)) || redirects.some((r) => redirectRule(r.source).test(address))
}

const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex')

// Each address and the files served at it.
function addresses(files: Map<string, Buffer>) {
  const at = new Map<string, string[]>()
  for (const file of files.keys()) at.set(plain(servedAt(file)), [...(at.get(plain(servedAt(file))) ?? []), file])
  return at
}

export function checkExport(files: Map<string, Buffer>, redirects: Redirect[]): string[] {
  const problems: string[] = []
  const at = addresses(files)
  // Next writes its not-found page twice; files that are the same are one.
  for (const [address, served] of at) {
    if (served.length > 1 && new Set(served.map((f) => digest(files.get(f)!))).size > 1) {
      problems.push(`${address} is served from ${served.join(' and ')}, which differ: the host serves only one of them`)
    }
  }

  const served = new Set(at.keys())
  const missing = new Map<string, string[]>()
  for (const [file, body] of files) {
    if (!NAMES(file)) continue
    for (const address of addressesIn(file, body.toString('utf8'))) {
      if (!answered(address, served, redirects)) missing.set(address, [...(missing.get(address) ?? []), file])
    }
  }
  for (const [address, from] of missing) {
    problems.push(`${address} is not served, and ${from.length} file(s) name it: ${from.slice(0, 3).join(', ')}${from.length > 3 ? ', …' : ''}`)
  }
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
  await Promise.all(Array.from({ length: at }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item)
  }))
}

// Every way a redirect's source is written: each listed choice, each version for `:version`.
function instances(r: Redirect): { from: string; to: string }[] {
  let found = [{ from: r.source, to: r.destination }]
  for (const [, name, , choices] of r.source.matchAll(/:(\w+)(\(([^)]*)\))?/g)) {
    const values = choices?.split('|') ?? (name === 'version' ? site.versions.map((v) => v.id) : [])
    const param = new RegExp(`:${name}(\\([^)]*\\))?`)
    found = found.flatMap((f) => values.map((value) => ({ from: f.from.replace(param, value), to: f.to.replace(param, value) })))
  }
  return found
}

// What a deployment answers at an address, past the host's own 308 from `X.v/` to `X.v` (a last
// segment with a dot is read as a file name); `moved` says it took that step.
type Answer = { response: Response; body: Buffer; moved: boolean }

export async function checkDeployment(base: string, files: Map<string, Buffer>, redirects: Redirect[]): Promise<{ problems: string[]; moved: string[] }> {
  const problems: string[] = []
  const moved: string[] = []
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const get = (address: string) => fetch(new URL(encodeURI(address), base), { redirect: 'manual', headers: secret ? { 'x-vercel-protection-bypass': secret } : {} })
  const answer = async (address: string): Promise<Answer> => {
    let response = await get(address)
    const to = response.status === 308 && plain(new URL(response.headers.get('location') ?? '', base).pathname)
    const slashless = address.endsWith('/') && to === address.slice(0, -1)
    if (slashless) {
      await response.arrayBuffer()
      response = await get(to)
    }
    return { response, body: Buffer.from(await response.arrayBuffer()), moved: slashless }
  }
  const redirected = (address: string) => redirects.some((r) => redirectRule(r.source).test(address))
  const named = new Set<string>()

  const at = [...addresses(files)].filter(([address, served]) => !redirected(address) && !served.some((f) => NOT_FOUND(f) || f.startsWith('_next/')))
  // An address out/ serves from two different files must answer with neither: checkExport says why.
  await each(at, async ([address, served]) => {
    const { response, body, moved: slashless } = await answer(address)
    if (slashless) moved.push(address)
    if (response.status !== 200) return void problems.push(`${address} answers ${response.status}, not ${served.join(' or ')}`)
    if (BUILT(served[0])) return
    const same = (file: string) => (file.endsWith('.html') ? visible(body.toString('utf8')) === visible(files.get(file)!.toString('utf8')) : digest(body) === digest(files.get(file)!))
    const matching = served.filter(same)
    if (matching.length !== served.length) problems.push(`${address} answers with ${matching.length ? matching.join(' and ') : 'something else'}, of ${served.join(' and ')}`)
    if (NAMES(served[0])) for (const a of addressesIn(matching[0] ?? served[0], body.toString('utf8'))) named.add(a)
  })

  // What the deployed pages and files name beyond out/'s addresses: the build's assets, and any
  // mistake.
  const served = new Set(at.map(([address]) => address))
  await each([...named].filter((a) => !served.has(a) && !redirected(a)), async (address) => {
    const { response } = await answer(address)
    if (response.status >= 400) problems.push(`${address}, which the deployment names, answers ${response.status}`)
  })

  const missing = `/${site.defaultLocale}/${site.versions[0].id}/no-such-page-${Date.now()}/`
  const notFound = await answer(missing)
  if (notFound.response.status !== 404 || visible(notFound.body.toString('utf8')) !== visible(files.get('404.html')?.toString('utf8') ?? '')) {
    problems.push(`${missing} answers ${notFound.response.status}, not the not-found page with 404`)
  }

  // A redirect is reached through the host's own trailing-slash 308s, if any.
  for (const r of redirects) {
    const status = r.permanent ? 308 : 307
    for (const { from, to } of instances(r)) {
      const hops: string[] = []
      let address = from
      for (let hop = 0; hop < 3; hop++) {
        const response = await get(address)
        await response.arrayBuffer()
        const location = response.headers.get('location')
        if (!location || response.status < 300 || response.status >= 400) break
        const next = plain(new URL(location, base).pathname)
        hops.push(`${response.status} ${next}`)
        if (response.status === status && next === to) break
        address = next
      }
      if (hops.at(-1) !== `${status} ${to}`) problems.push(`${from} answers ${hops.join(' → ') || 'no redirect'}, not ${status} to ${to}`)
    }
  }
  return { problems, moved }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.join(process.cwd(), 'out')
  const list = readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(out, path.join(d.parentPath, d.name)).split(path.sep).join('/'))
  const files = new Map(list.map((f) => [f, readFileSync(path.join(out, f))]))
  const { redirects } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { redirects: Redirect[] }
  const base = process.argv[2]
  const { problems, moved } = base ? await checkDeployment(base, files, redirects) : { problems: checkExport(files, redirects), moved: [] }
  for (const p of problems.sort()) console.error(`check-export: ${p}`)
  if (problems.length) process.exit(1)
  console.log(`check-export: ${base ?? 'out/'}: ${addresses(files).size} addresses from ${files.size} files, as the host serves them`)
  if (moved.length) console.log(`check-export: ${moved.length} reached by the host's 308 to the address without its slash: ${moved.sort().join(', ')}`)
}
