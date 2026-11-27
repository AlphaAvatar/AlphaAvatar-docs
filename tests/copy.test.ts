import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { write } from '../components/copy'

// A page as write() sees it: the clipboard API, a focused button, the body and the copy command.
type Area = { value: string; readOnly: boolean; style: Record<string, string>; select(): void; remove(): void }

function page({ clipboard, command }: { clipboard: 'writes' | 'refuses' | 'absent'; command: 'copies' | 'false' | 'throws' }) {
  const log: string[] = []
  const body: Area[] = []
  const button = { focus: (options?: FocusOptions) => log.push(`focus button ${JSON.stringify(options)}`) }
  const doc = {
    activeElement: button as unknown,
    body: { append: (area: Area) => (body.push(area), log.push('append')) },
    createElement: (tag: string) => {
      assert.equal(tag, 'textarea')
      const area: Area = {
        value: '',
        readOnly: false,
        style: {},
        select: () => {
          log.push(`select ${JSON.stringify(area.value)}`)
          doc.activeElement = area
        },
        remove: () => (body.splice(body.indexOf(area), 1), log.push('remove')),
      }
      return area
    },
    execCommand: (name: string) => {
      log.push(`execCommand ${name}`)
      if (command === 'throws') throw new Error('not allowed')
      return command === 'copies'
    },
  }
  const navigator =
    clipboard === 'absent'
      ? {}
      : { clipboard: { writeText: async (text: string) => (log.push(`clipboard ${JSON.stringify(text)}`), clipboard === 'refuses' ? Promise.reject(new Error('denied')) : undefined) } }
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true })
  return { log, body }
}

const saved = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'), navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') }
afterEach(() => {
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
})

const TEXT = 'line 1\n  line 2'
const fallback = (focus: string) => ['append', `select ${JSON.stringify(TEXT)}`, 'execCommand copy', 'remove', focus]
const refocus = 'focus button {"preventScroll":true}'

test('the clipboard API copies: nothing else is touched', async () => {
  const { log, body } = page({ clipboard: 'writes', command: 'throws' })
  await write(TEXT)
  assert.deepEqual(log, [`clipboard ${JSON.stringify(TEXT)}`])
  assert.equal(body.length, 0)
})

test('the copy command copies: the textarea goes and the focus comes back', async () => {
  const { log, body } = page({ clipboard: 'refuses', command: 'copies' })
  await write(TEXT)
  assert.deepEqual(log, [`clipboard ${JSON.stringify(TEXT)}`, ...fallback(refocus)])
  assert.equal(body.length, 0)
})

test('the copy command says it did not copy: a failure, after the same cleanup', async () => {
  const { log, body } = page({ clipboard: 'refuses', command: 'false' })
  await assert.rejects(write(TEXT), /copy failed/)
  assert.deepEqual(log, [`clipboard ${JSON.stringify(TEXT)}`, ...fallback(refocus)])
  assert.equal(body.length, 0)
})

test('the copy command throws: a failure, and still the textarea goes and the focus comes back', async () => {
  const { log, body } = page({ clipboard: 'refuses', command: 'throws' })
  await assert.rejects(write(TEXT), /not allowed/)
  assert.deepEqual(log, [`clipboard ${JSON.stringify(TEXT)}`, ...fallback(refocus)])
  assert.equal(body.length, 0)
})

test('no clipboard API at all, as on a page not served securely: the copy command is tried', async () => {
  const { log, body } = page({ clipboard: 'absent', command: 'throws' })
  await assert.rejects(write(TEXT), /not allowed/)
  assert.deepEqual(log, fallback(refocus))
  assert.equal(body.length, 0)
})
