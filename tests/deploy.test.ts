import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { site } from '../site.config'
import { DocArticle } from '../components/article'
import { renderDocument } from '../lib/markdown'
import { outputFile, pageHref, pageOf, sourceHref, versions, type DocPage } from '../lib/site'
import { checkDeployment, checkExport, MAX_HOPS, servedAt, slashRule, type Redirect } from '../scripts/check-export'
import { entry, snapshot } from './fixture'

// vercel.json, which the host reads before any build, follows site.config.ts: `/` leads, by a
// temporary HTTP redirect, to the first version's home in the default language; the retired
// section addresses lead to their sections, keeping language and version.
const { redirects } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { redirects: Redirect[] }

test('the root redirects to the default language and first version, temporarily', () => {
  const root = redirects.find((r) => r.source === '/')!
  assert.equal(root.destination, pageHref(site.versions[0].id, site.defaultLocale, '/'))
  assert.equal(slashRule(root.destination), undefined, 'the home is served at the address the root leads to')
  assert.equal(root.permanent, false)
})

test('the retired sections redirect to sections that exist, in every configured language', () => {
  const locales = `(${Object.keys(site.locales).join('|')})`
  const old = redirects.filter((r) => r.source !== '/')
  assert.deepEqual([...new Set(old.map((r) => r.source.replace(/\/$/, '')))].sort(), [`/:locale${locales}/:version/architecture`, `/:locale${locales}/:version/get-started`])
  for (const r of old) {
    assert.equal(r.permanent, false)
    const route = r.destination.replace('/:locale/:version', '').replace(/\/$/, '')
    for (const v of versions()) for (const locale of v.locales) assert.ok(pageOf(v, locale, route), `${r.destination} in ${v.id} ${locale}`)
    assert.ok(!pageOf(versions()[0], 'en', r.source.replace(`/:locale${locales}/:version`, '').replace(/\/$/, '')), `${r.source} is no page any more`)
  }
})

// The export as the host serves it (scripts/check-export.ts). What the host does was read from
// docs.alphaavatar.io on 2026-11-27 and 28: `X.html` is served at `/X/` and `X.html` answers 404;
// where `cli/output.html` and `cli/output/index.html` were both exported, `/cli/output/` answered
// with the first; `/X` leads to `/X/` and, where the last segment reads as a file name, `/X.v/` to
// `/X.v`, both by 308 and before vercel.json's redirects; `/X.v` serves `X.v/index.html`.

test('the host serves a directory index at the directory, without a slash where its name reads as a file, X.html there too, any other file at its path', () => {
  assert.equal(servedAt('index.html'), '/')
  assert.equal(servedAt('en/v0.7.0/cli/output/index.html'), '/en/v0.7.0/cli/output/')
  assert.equal(servedAt('en/v0.7.0/cli/output.html'), '/en/v0.7.0/cli/output/')
  assert.equal(servedAt('en/v0.7.0/index.html'), '/en/v0.7.0')
  assert.equal(servedAt('en/v0.7.0/releases/v0.6.1/index.html'), '/en/v0.7.0/releases/v0.6.1')
  assert.equal(servedAt('en/v0.7.0/cli/doctor.md'), '/en/v0.7.0/cli/doctor.md')
  assert.equal(slashRule('/en/v0.7.0/guide'), '/en/v0.7.0/guide/')
  assert.equal(slashRule('/en/v0.7.0/'), '/en/v0.7.0')
  assert.equal(slashRule('/en/v0.7.0/releases/v0.6.9/'), '/en/v0.7.0/releases/v0.6.9')
  for (const served of ['/', '/en/v0.7.0', '/en/v0.7.0/guide/', '/llms.txt', '/en/v0.7.0/cli/output.html', '/.well-known/x']) assert.equal(slashRule(served), undefined, served)
})

test("every page's address is the one the host serves it at, with no redirect", () => {
  let dotted = 0
  for (const v of versions()) {
    for (const locale of v.locales) {
      for (const p of v.pages.get(locale)!) {
        const href = pageHref(v.id, locale, p.route)
        // Next writes a page's HTML as its directory's index.html.
        assert.equal(servedAt(`${href.slice(1).replace(/\/?$/, '/')}index.html`), href, href)
        assert.equal(slashRule(href), undefined, href)
        if (!href.endsWith('/')) dotted++
      }
    }
  }
  // Each language's home (`/en/v0.7.0`) and its v0.6.x release notes.
  assert.equal(dotted, 20)
})

const exported = (files: Record<string, string>) => new Map(Object.entries(files).map(([f, body]) => [f, Buffer.from(body)]))
const page = (title: string, body = '') => `<!DOCTYPE html><html><head><title>${title}</title><script>self.__next_f.push(["build ${Math.random()}"])</script></head><body>${body}</body></html>`
const NOT_FOUND = page('Not found', '<a href="/en/v0.7.0">Home</a>')
// What vercel.json's redirects lead to, in both languages.
const LED_TO = Object.fromEntries(
  ['en', 'zh-CN'].flatMap((l) => [
    [`${l}/v0.7.0/index.html`, page('Home', `<a href="/${l}/v0.7.0/guide/">Guide</a>`)],
    [`${l}/v0.7.0/guide/index.html`, page('Guide')],
    [`${l}/v0.7.0/reference/index.html`, page('Reference')],
  ]),
)

// The gallery's files as 8bb6641 exported them, and as they are exported now.
const beside = {
  '404.html': NOT_FOUND,
  '404/index.html': NOT_FOUND,
  ...LED_TO,
  'en/v0.7.0/index.html': page('Home', '<a href="/en/v0.7.0/cli/output/">Output gallery</a>'),
  'en/v0.7.0/cli/output/index.html': page('Output gallery', '<iframe src="/en/v0.7.0/cli/output.html"></iframe><a href="/en/v0.7.0/cli/output.html">View HTML</a>'),
  'en/v0.7.0/cli/output.html': '<!doctype html><title>Gallery</title><a href="#doctor-rounds">doctor-rounds</a>',
  'en/v0.7.0/cli/doctor.md': `[gallery](${site.url}/en/v0.7.0/cli/output.html#doctor-rounds)`,
}
const apart = {
  '404.html': NOT_FOUND,
  '404/index.html': NOT_FOUND,
  ...LED_TO,
  'en/v0.7.0/index.html': page('Home', '<a href="/en/v0.7.0/cli/output/">Output gallery</a>'),
  'en/v0.7.0/cli/output/index.html': page('Output gallery', '<iframe src="/_html/en/v0.7.0/cli/output/"></iframe><a href="/_html/en/v0.7.0/cli/output/">View HTML</a>'),
  '_html/en/v0.7.0/cli/output/index.html': '<!doctype html><title>Gallery</title><a href="#doctor-rounds">doctor-rounds</a>',
  'en/v0.7.0/cli/doctor.md': `[gallery](${site.url}/_html/en/v0.7.0/cli/output/#doctor-rounds) [home](${site.url}/en/v0.7.0)`,
}

test('an HTML file beside its page takes the page address and is named where nothing is served; in a directory of its own it is not', async () => {
  assert.deepEqual(await checkExport(exported(beside), redirects), [
    '/en/v0.7.0/cli/output/ is served from en/v0.7.0/cli/output/index.html and en/v0.7.0/cli/output.html, which differ: the host serves only one of them',
    '/en/v0.7.0/cli/output.html is not served, and 2 file(s) name it: en/v0.7.0/cli/output/index.html, en/v0.7.0/cli/doctor.md',
  ])
  assert.deepEqual(await checkExport(exported(apart), redirects), [])
})

test('an address the host leads elsewhere is named by its own address: the slash rule and vercel.json both', async () => {
  const named = { ...apart, 'en/v0.7.0/guide/index.html': page('Guide', '<a href="/en/v0.7.0/">Home</a> <a href="../releases">Releases</a> <a href="/en/v0.7.0/get-started/">Old</a> <a href="/">Root</a>') }
  assert.deepEqual((await checkExport(exported(named), redirects)).sort(), [
    '/ leads to /en/v0.7.0 by 307, and 1 file(s) name it: en/v0.7.0/guide/index.html; name /en/v0.7.0',
    '/en/v0.7.0/ leads to /en/v0.7.0 by 308, and 1 file(s) name it: en/v0.7.0/guide/index.html; name /en/v0.7.0',
    '/en/v0.7.0/get-started/ leads to /en/v0.7.0/guide/ by 307, and 1 file(s) name it: en/v0.7.0/guide/index.html; name /en/v0.7.0/guide/',
    '/en/v0.7.0/releases leads to /en/v0.7.0/releases/ by 308, and 1 file(s) name it: en/v0.7.0/guide/index.html; name /en/v0.7.0/releases/',
  ])
})

// Redirects of their own, each instance of which must lead in one step to an address served.
const redirect = (source: string, destination: string, permanent = true): Redirect => ({ source, destination, permanent })
const CHAIN = Array.from({ length: MAX_HOPS + 2 }, (_, i) => redirect(`/hop-${i}/`, `/hop-${i + 1}/`))

test('a redirect whose end is not served, that loops, takes too many steps or more than one is found in out/', async () => {
  const files = exported(apart)
  assert.deepEqual(await checkExport(files, [redirect('/old/', '/gone/')]), ['/old/ ends at /gone/, which answers 404: /old/ → 308 /gone/'])
  assert.deepEqual(await checkExport(files, [redirect('/a/', '/b/'), redirect('/b/', '/a/')]), ['/a/ loops: /a/ → 308 /b/ → 308 /a/', '/b/ loops: /b/ → 308 /a/ → 308 /b/'])
  const long = await checkExport(files, CHAIN)
  assert.equal(long[0], `/hop-0/ takes more than ${MAX_HOPS} redirects: /hop-0/ → ${Array.from({ length: MAX_HOPS + 1 }, (_, i) => `308 /hop-${i + 1}/`).join(' → ')}`)
  // The root's redirect as it was: the home it led to is served without the slash.
  assert.deepEqual(await checkExport(files, [redirect('/', '/en/v0.7.0/', false)]), ['/ answers / → 307 /en/v0.7.0/ → 308 /en/v0.7.0, not 307 to /en/v0.7.0/ and 200 there'])
  assert.deepEqual(await checkExport(files, [redirect('/old/', '/en/v0.7.0/guide')]), ['/old/ answers /old/ → 308 /en/v0.7.0/guide → 308 /en/v0.7.0/guide/, not 308 to /en/v0.7.0/guide and 200 there'])
  // A source an earlier redirect takes first reaches the destination only in two steps.
  assert.deepEqual(await checkExport(files, [redirect('/a/', '/b/'), redirect('/:p(a|b)/', '/en/v0.7.0/guide/')]), [
    '/a/ answers /a/ → 308 /b/ → 308 /en/v0.7.0/guide/, not 308 to /b/ and 200 there',
    '/a/ answers /a/ → 308 /b/ → 308 /en/v0.7.0/guide/, not 308 to /en/v0.7.0/guide/ and 200 there',
  ])
  // The host's own slash 308 comes first: it is no step of the redirect's, and a source without
  // the slash is reached only through the one with it.
  const retired = redirects.filter((r) => r.source.includes('get-started'))
  assert.deepEqual(await checkExport(files, retired), [])
  assert.deepEqual(await checkExport(files, retired.filter((r) => !r.source.endsWith('/'))), [
    '/en/v0.7.0/get-started ends at /en/v0.7.0/get-started/, which answers 404: /en/v0.7.0/get-started → 308 /en/v0.7.0/get-started/',
    '/zh-CN/v0.7.0/get-started ends at /zh-CN/v0.7.0/get-started/, which answers 404: /zh-CN/v0.7.0/get-started → 308 /zh-CN/v0.7.0/get-started/',
  ])
})

test('an HTML document is shown and linked from its own directory, which no page takes', () => {
  const v = snapshot(
    { 'docs/gallery.html': '<!doctype html><title>Gallery</title>', 'docs/a.md': '# A\n\nSee [the gallery](gallery.html#doctor-rounds).\n' },
    [entry('a', 'docs/a.md', 'A', 'en', '/a', '', 'main', 1), entry('gallery', 'docs/gallery.html', 'Gallery', 'en', '/cli/output', ', format: html', 'main', 2)],
  )
  const doc = v.docs.get('docs/gallery.html')!
  const href = sourceHref(v.id, doc)
  assert.equal(href, '/_html/en/t/cli/output/')
  assert.equal(servedAt(outputFile(href).slice(1)), href)
  for (const locale of v.locales) for (const p of v.pages.get(locale)!) assert.notEqual(pageHref(v.id, locale, p.route), href)

  const html = renderToString(createElement(DocArticle, { v, page: pageOf(v, 'en', '/cli/output') as DocPage }))
  assert.match(html, /<iframe class="html-frame" src="\/_html\/en\/t\/cli\/output\/"/)
  assert.match(html, /<a href="\/_html\/en\/t\/cli\/output\/">View HTML source<\/a>/)
  assert.ok(!/(?:src|href)="\/[^"]*\.html"/.test(html), 'no address of this site ending in .html')
  assert.ok(renderDocument(v, v.docs.get('docs/a.md')!, 'en').markdown.includes(`(${site.url}/_html/en/t/cli/output/#doctor-rounds)`))

  // Where its route reads as a file name, its directory is still the one it is served from.
  const dotted = snapshot({ 'docs/notes.html': '<!doctype html><title>Notes</title>' }, [entry('notes', 'docs/notes.html', 'Notes', 'en', '/notes/v0.1', ', format: html')])
  const at = sourceHref(dotted.id, dotted.docs.get('docs/notes.html')!)
  assert.equal(at, '/_html/en/t/notes/v0.1')
  assert.equal(outputFile(at), '/_html/en/t/notes/v0.1/index.html')
  assert.equal(servedAt(outputFile(at).slice(1)), at)
})

// A host that serves an export as docs.alphaavatar.io does; `change` alters what it answers.
function host(files: Record<string, string>, rules: Redirect[] = redirects, change: (at: string) => Response | undefined = () => undefined) {
  const served = new Map<string, string>()
  for (const file of Object.keys(files).sort((a, b) => Number(b.endsWith('/index.html')) - Number(a.endsWith('/index.html')))) served.set(servedAt(file), file)
  const compiled = rules.map((r) => {
    const names: string[] = []
    const re = new RegExp(`^${r.source.replace(/:(\w+)(\(([^)]*)\))?/g, (_, n: string, _g, c?: string) => (names.push(n), `(${c ?? '[^/]+'})`))}$`)
    return { ...r, re, names }
  })
  return async (input: string | URL | Request) => {
    const at = new URL(String(input)).pathname
    const last = at.replace(/\/$/, '').split('/').at(-1) ?? ''
    const move = (to: string, status: number) => new Response(null, { status, headers: { location: to } })
    const changed = change(at)
    if (changed) return changed
    if (at !== '/' && at.endsWith('/') && /\.\w+$/.test(last)) return move(at.slice(0, -1), 308)
    if (!at.endsWith('/') && !last.includes('.')) return move(`${at}/`, 308)
    for (const r of compiled) {
      const m = r.re.exec(at)
      if (m) return move(r.names.reduce((to, n, i) => to.replace(`:${n}`, m[i + 1]), r.destination), r.permanent ? 308 : 307)
    }
    const file = served.get(at)
    return file ? new Response(files[file], { status: 200 }) : new Response(files['404.html'], { status: 404 })
  }
}

async function deployed(files: Record<string, string>, rules: Redirect[] = redirects, change?: (at: string) => Response | undefined) {
  const fetchBefore = globalThis.fetch
  try {
    globalThis.fetch = host(files, rules, change) as typeof fetch
    return (await checkDeployment('https://deployment.test', exported(files), rules)).sort()
  } finally {
    globalThis.fetch = fetchBefore
  }
}

test('a deployment is read as out/ says: an address answering with one of two files, and a named address answering 404, are found', async () => {
  assert.deepEqual(await deployed(beside), [
    '/en/v0.7.0/cli/output.html, which the deployment names, answers 404',
    '/en/v0.7.0/cli/output/ answers with en/v0.7.0/cli/output.html, of en/v0.7.0/cli/output/index.html and en/v0.7.0/cli/output.html',
  ])
  assert.deepEqual(await deployed(apart), [])
})

test('at a deployment, a page is answered at its own address, its old one with a slash leads there, and each redirect ends where out/ says', async () => {
  // The home no longer at its old address with a slash, and its address answered by a redirect.
  assert.deepEqual(await deployed(apart, redirects, (at) => (at === '/zh-CN/v0.7.0/' ? new Response('gone', { status: 404 }) : undefined)), [
    '/zh-CN/v0.7.0/ answers 404, not 308 to /zh-CN/v0.7.0',
  ])
  assert.deepEqual(await deployed(apart, redirects, (at) => (at === '/en/v0.7.0' ? new Response(null, { status: 308, headers: { location: '/en/v0.7.0/' } }) : undefined)), [
    '/ loops: / → 307 /en/v0.7.0 → 308 /en/v0.7.0/ → 308 /en/v0.7.0',
    '/en/v0.7.0 answers 308 to /en/v0.7.0/, not en/v0.7.0/index.html',
  ])
  // A redirect's end that is missing, a loop, too many steps, and an end that is not out/'s page.
  assert.deepEqual(await deployed(apart, [redirect('/old/', '/gone/')]), ['/old/ ends at /gone/, which answers 404: /old/ → 308 /gone/'])
  assert.deepEqual(await deployed(apart, [redirect('/a/', '/b/'), redirect('/b/', '/a/')]), ['/a/ loops: /a/ → 308 /b/ → 308 /a/', '/b/ loops: /b/ → 308 /a/ → 308 /b/'])
  assert.ok((await deployed(apart, CHAIN))[0].startsWith(`/hop-0/ takes more than ${MAX_HOPS} redirects: `))
  assert.deepEqual(await deployed(apart, redirects, (at) => (at === '/en/v0.7.0/guide/' ? new Response(page('Something else'), { status: 200 }) : undefined)), [
    '/en/v0.7.0/get-started leads to /en/v0.7.0/guide/, which answers with something else, of en/v0.7.0/guide/index.html',
    '/en/v0.7.0/get-started/ leads to /en/v0.7.0/guide/, which answers with something else, of en/v0.7.0/guide/index.html',
    '/en/v0.7.0/guide/ answers with something else, of en/v0.7.0/guide/index.html',
  ])
})
