import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isValidElement, type ReactNode } from 'react'
import { rank, snippet, type Indexed, type SearchRecord } from '../components/search'

const indexed = (r: Omit<SearchRecord, 'id' | 'section' | 'sectionId' | 'lang' | 'path'>): Indexed => ({
  ...r,
  id: r.href,
  sectionId: 'reference',
  section: 'Reference',
  lang: 'en',
  path: 'docs/cli/doctor.md',
  haystack: [r.title.toLowerCase(), r.heading.toLowerCase(), r.text.toLowerCase()],
})
const plain = (nodes: ReactNode[]) => nodes.map((n) => (isValidElement<{ children: string }>(n) ? n.props.children : n)).join('')
const marks = (nodes: ReactNode[]) => nodes.filter(isValidElement).length

const records = [
  indexed({ href: '/a/', title: 'alphaavatar doctor', heading: 'Runtime start', text: 'The Host starts the bundle runtime as start does.' }),
  indexed({ href: '/b/', title: 'Deployment', heading: 'Run Doctor', text: 'Static checks run first.' }),
  indexed({ href: '/c/', title: 'Setup', heading: 'Next steps', text: `${'x '.repeat(80)}then run doctor to check it.` }),
]

test('title, heading and text matches are all found', () => {
  assert.deepEqual(rank(records, 'doctor').map((r) => r.href).sort(), ['/a/', '/b/', '/c/'])
})

test('a section matched only by its title or heading shows the start of its text', () => {
  for (const r of records.slice(0, 2)) {
    const nodes = snippet(r.text, 'doctor')
    assert.equal(plain(nodes), r.text)
    assert.equal(marks(nodes), 0)
  }
})

test('a text match shows the text around it, marked', () => {
  const nodes = snippet(records[2].text, 'doctor')
  assert.ok(plain(nodes).startsWith('…'))
  assert.ok(plain(nodes).includes('then run doctor to check it.'))
  assert.equal(marks(nodes), 1)
})
