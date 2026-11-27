import assert from 'node:assert/strict'
import { test } from 'node:test'
import { languageHref, type LanguageOption } from '../components/menus'
import { anchorOf } from '../components/navigation'
import { planFor } from '../components/timeline'

// Every reader of a URL's anchor: an anchor that does not decode is none, and a name such as
// `constructor` is never an entry of the site's own maps; either way the page opens as it is.

const PROPERTIES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']

test('an anchor is decoded, and one that does not decode is none', () => {
  assert.equal(anchorOf('#install'), 'install')
  assert.equal(anchorOf(`#${encodeURIComponent('安装 Host')}`), '安装 Host')
  assert.equal(anchorOf(''), '')
  assert.equal(anchorOf('#'), '')
  for (const hash of ['#%', '#%E4', '#a%zz', '#%E4%B8']) assert.equal(anchorOf(hash), '', hash)
})

test('switching language keeps an anchor the map has nothing of its own for, and drops one that does not decode', () => {
  const option: LanguageOption = { locale: 'zh-CN', label: '简体中文', href: '/zh-CN/v/cli/setup/', anchors: { install: '安装', removed: '' } }
  assert.equal(languageHref(option, '', '#install'), `/zh-CN/v/cli/setup/#${encodeURIComponent('安装')}`)
  assert.equal(languageHref(option, '', '#removed'), '/zh-CN/v/cli/setup/')
  assert.equal(languageHref(option, '', '#same-there'), '/zh-CN/v/cli/setup/#same-there')
  for (const name of PROPERTIES) assert.equal(languageHref(option, '', `#${name}`), `/zh-CN/v/cli/setup/#${name}`, name)
  assert.equal(languageHref(option, '', '#%'), '/zh-CN/v/cli/setup/')
  assert.equal(languageHref(option, '?milestone=v0.7.0', '#%E4'), '/zh-CN/v/cli/setup/?milestone=v0.7.0')
  assert.equal(languageHref(option, '?milestone=v0.7.0', ''), '/zh-CN/v/cli/setup/?milestone=v0.7.0')
})

test('an anchor opens a full plan only when a plan holds it', () => {
  const planOf = { 'v0-7-0': 'v0.7.0', 'cfg-01': 'v0.7.0', backlog: 'backlog' }
  assert.equal(planFor(planOf, 'cfg-01'), 'v0.7.0')
  assert.equal(planFor(planOf, 'backlog'), 'backlog')
  assert.equal(planFor(planOf, ''), undefined)
  assert.equal(planFor(planOf, 'planning-notes'), undefined)
  for (const name of PROPERTIES) assert.equal(planFor(planOf, name), undefined, name)
  assert.equal(planFor(planOf, anchorOf('#%')), undefined)
})
