import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { site } from '../site.config'
import { pageHref, pageOf, versions } from '../lib/site'

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
