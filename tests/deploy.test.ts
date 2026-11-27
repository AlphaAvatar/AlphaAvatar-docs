import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { site } from '../site.config'
import { DocArticle } from '../components/article'
import { renderDocument } from '../lib/markdown'
import { outputFile, pageHref, pageOf, sourceHref, versions, type DocPage } from '../lib/site'
import { answered, checkDeployment, checkExport, servedAt } from '../scripts/check-export'
import { entry, snapshot } from './fixture'

// vercel.json, which the host reads before any build, follows site.config.ts: `/` leads, by a
// temporary HTTP redirect, to the first version's home in the default language; the retired
// section addresses lead to their sections, keeping language and version.
const { redirects } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { redirects: { source: string; destination: string; permanent: boolean }[] }

test('the root redirects to the default language and first version, temporarily', () => {
  const root = redirects.find((r) => r.source === '/')!
  assert.equal(root.destination, pageHref(site.versions[0].id, site.defaultLocale, '/'))
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
// docs.alphaavatar.io on 2026-11-27: `X.html` is served at `/X/` and `X.html` answers 404; where
// `cli/output.html` and `cli/output/index.html` were both exported, `/cli/output/` answered with
// the first; `/X` leads to `/X/` and, where the last segment holds a dot, `/X.v/` to `/X.v`, both
// by 308 and before vercel.json's redirects.

const exported = (files: Record<string, string>) => new Map(Object.entries(files).map(([f, body]) => [f, Buffer.from(body)]))
const page = (title: string, body = '') => `<!DOCTYPE html><html><head><title>${title}</title><script>self.__next_f.push(["build ${Math.random()}"])</script></head><body>${body}</body></html>`
const NOT_FOUND = page('Not found', '<a href="/en/v0.7.0/">Home</a>')

// The gallery's files as 8bb6641 exported them, and as they are exported now.
const beside = {
  '404.html': NOT_FOUND,
  '404/index.html': NOT_FOUND,
  'en/v0.7.0/index.html': page('Home', '<a href="/en/v0.7.0/cli/output/">Output gallery</a>'),
  'en/v0.7.0/cli/output/index.html': page('Output gallery', '<iframe src="/en/v0.7.0/cli/output.html"></iframe><a href="/en/v0.7.0/cli/output.html">View HTML</a>'),
  'en/v0.7.0/cli/output.html': '<!doctype html><title>Gallery</title><a href="#doctor-rounds">doctor-rounds</a>',
  'en/v0.7.0/cli/doctor.md': `[gallery](${site.url}/en/v0.7.0/cli/output.html#doctor-rounds)`,
}
const apart = {
  '404.html': NOT_FOUND,
  '404/index.html': NOT_FOUND,
  'en/v0.7.0/index.html': page('Home', '<a href="/en/v0.7.0/cli/output/">Output gallery</a>'),
  'en/v0.7.0/cli/output/index.html': page('Output gallery', '<iframe src="/_html/en/v0.7.0/cli/output/"></iframe><a href="/_html/en/v0.7.0/cli/output/">View HTML</a>'),
  '_html/en/v0.7.0/cli/output/index.html': '<!doctype html><title>Gallery</title><a href="#doctor-rounds">doctor-rounds</a>',
  'en/v0.7.0/cli/doctor.md': `[gallery](${site.url}/_html/en/v0.7.0/cli/output/#doctor-rounds) [retired](${site.url}/en/v0.7.0/get-started/)`,
}

test('the host serves a directory index at the directory, X.html at /X/, any other file at its path', () => {
  assert.equal(servedAt('index.html'), '/')
  assert.equal(servedAt('en/v0.7.0/cli/output/index.html'), '/en/v0.7.0/cli/output/')
  assert.equal(servedAt('en/v0.7.0/cli/output.html'), '/en/v0.7.0/cli/output/')
  assert.equal(servedAt('en/v0.7.0/cli/doctor.md'), '/en/v0.7.0/cli/doctor.md')
  assert.ok(answered('/en/v0.7.0/cli/output', new Set(['/en/v0.7.0/cli/output/']), []), 'an address without its slash leads to it')
  assert.ok(!answered('/en/v0.7.0/cli/output.html', new Set(['/en/v0.7.0/cli/output/']), []), 'no address ending in .html is served')
  assert.ok(answered('/en/v0.7.0/get-started/', new Set(), redirects), 'a redirect answers')
})

test('an HTML file beside its page takes the page address and is named where nothing is served; in a directory of its own it is not', () => {
  assert.deepEqual(checkExport(exported(beside), redirects), [
    '/en/v0.7.0/cli/output/ is served from en/v0.7.0/cli/output/index.html and en/v0.7.0/cli/output.html, which differ: the host serves only one of them',
    '/en/v0.7.0/cli/output.html is not served, and 2 file(s) name it: en/v0.7.0/cli/output/index.html, en/v0.7.0/cli/doctor.md',
  ])
  assert.deepEqual(checkExport(exported(apart), redirects), [])
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
})

// A host that serves an export as docs.alphaavatar.io does.
function host(files: Record<string, string>) {
  const served = new Map<string, string>()
  for (const file of Object.keys(files).sort((a, b) => Number(b.endsWith('/index.html')) - Number(a.endsWith('/index.html')))) served.set(servedAt(file), file)
  const rules = redirects.map((r) => ({ ...r, re: new RegExp(`^${r.source.replace(/:(\w+)(\(([^)]*)\))?/g, (_, _n, _g, c?: string) => `(${c ?? '[^/]+'})`)}$`) }))
  return async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const at = url.pathname
    const last = at.replace(/\/$/, '').split('/').at(-1) ?? ''
    const move = (to: string, status: number) => new Response(null, { status, headers: { location: to } })
    if (at !== '/' && at.endsWith('/') && last.includes('.')) return move(at.slice(0, -1), 308)
    if (!at.endsWith('/') && !last.includes('.')) return move(`${at}/`, 308)
    for (const r of rules) {
      const m = r.re.exec(at)
      if (m) return move(r.destination.replace(/:locale/, m[1]).replace(/:version/, m[2] ?? ''), r.permanent ? 308 : 307)
    }
    const file = served.get(at) ?? served.get(`${at}/`)
    return file ? new Response(files[file], { status: 200 }) : new Response(files['404.html'], { status: 404 })
  }
}

test('a deployment is read as out/ says: an address answering with one of two files, and a named address answering 404, are found', async () => {
  const fetchBefore = globalThis.fetch
  try {
    globalThis.fetch = host(beside) as typeof fetch
    const before = await checkDeployment('https://deployment.test', exported(beside), redirects)
    assert.deepEqual(before.problems.sort(), [
      '/en/v0.7.0/cli/output.html, which the deployment names, answers 404',
      '/en/v0.7.0/cli/output/ answers with en/v0.7.0/cli/output.html, of en/v0.7.0/cli/output/index.html and en/v0.7.0/cli/output.html',
    ])
    globalThis.fetch = host(apart) as typeof fetch
    const after = await checkDeployment('https://deployment.test', exported(apart), redirects)
    assert.deepEqual(after.problems, [])
    assert.deepEqual(after.moved, ['/en/v0.7.0/'])
  } finally {
    globalThis.fetch = fetchBefore
  }
})
