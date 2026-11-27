import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Markdown } from '../components/article'
import { highlight, type Token } from '../lib/highlight'
import { renderDocument } from '../lib/markdown'
import { terminalLines, terminalText } from '../lib/terminal'
import { entry, snapshot } from './fixture'

const kinds = (line: Token[]) => line.filter((t) => t.kind).map((t) => `${t.kind}:${t.text}`)

test('Bash: the command, assignments before it, flags, quotes and comments, by their place', () => {
  const { label, lines } = highlight(
    'bash',
    [
      'alphaavatar setup my-avatar --plan   # print the plan',
      'ENV_FILE=.env.dev alphaavatar doctor | tee "a b" #2',
      'curl -fsSL https://x/install.sh | bash',
      'alphaavatar config init \\',
      '  --avatar-id x',
      "echo 'two",
      "lines' done",
    ].join('\n'),
  )!
  assert.equal(label, 'Bash')
  assert.deepEqual(lines.map(kinds), [
    ['command:alphaavatar', 'keyword:--plan', 'comment:# print the plan'],
    ['key:ENV_FILE', 'command:alphaavatar', 'command:tee', 'string:"a b"', 'comment:#2'],
    ['command:curl', 'keyword:-fsSL', 'command:bash'],
    ['command:alphaavatar'],
    ['keyword:--avatar-id'],
    ['command:echo', "string:'two"],
    ["string:lines'"],
  ])
})

test('YAML: keys, constants, quoted strings and comments; a block scalar is text', () => {
  const { lines } = highlight(
    'yaml',
    ['# host profile', 'doctor:', '  external_services: true   # default false', '  name: "a: b"', '  prompt: |', '    key: not a key', '- item: 3'].join('\n'),
  )!
  assert.deepEqual(lines.map(kinds), [
    ['comment:# host profile'],
    ['key:doctor'],
    ['key:external_services', 'keyword:true', 'comment:# default false'],
    ['key:name', 'string:"a: b"'],
    ['key:prompt'],
    [],
    ['key:item'],
  ])
})

test('every grammar keeps the text exactly; text and unknown languages get no color', () => {
  const code = 'PASS  /srv/a.yaml\nFAIL  alphaavatar doctor --json\n  "quoted" # not a comment'
  for (const lang of ['bash', 'yaml', 'json', 'python', 'dotenv', 'ini']) {
    const back = highlight(lang, code)!.lines.map((l) => l.map((t) => t.text).join('')).join('\n')
    assert.equal(back, code, lang)
  }
  for (const lang of [undefined, 'text', 'console-output', 'mermaidish']) assert.equal(highlight(lang, code), undefined, String(lang))
})

test('a recording: the palette for 4-bit codes, RGB and 256 colors as recorded, cursor codes applied', () => {
  const palette = { '31': '#FCA5A5', '32': '#86EFAC', '33': '#FDE047', '90': '#A1A1AA' }
  const screen = [
    '\x1b[1;38;2;34;211;238mAlphaAvatar\x1b[0m / \x1b[38;5;196mred\x1b[39m \x1b[38;5;2mgreen\x1b[0m \x1b[38;5;244mgray\x1b[0m',
    '\x1b[32mPASS\x1b[0m  ok   ',
    'old text\r\x1b[Knew\x1b[90m dim\x1b[0m',
    'gone\nalso gone\x1b[1A\r\x1b[J\x1b[31mFAIL\x1b[0m',
  ].join('\n')
  const lines = terminalLines(screen, palette)
  assert.deepEqual(lines[0], [
    { text: 'AlphaAvatar', color: 'rgb(34,211,238)', bold: true },
    { text: ' / ' },
    { text: 'red', color: 'rgb(255,0,0)' },
    { text: ' ' },
    { text: 'green', color: '#86EFAC' },
    { text: ' ' },
    { text: 'gray', color: 'rgb(128,128,128)' },
  ])
  assert.deepEqual(lines[1], [{ text: 'PASS', color: '#86EFAC' }, { text: '  ok   ' }])
  // The text is the screen's, not the codes stripped: overwritten and erased text is gone.
  assert.equal(terminalText(lines), 'AlphaAvatar / red green gray\nPASS  ok\nnew dim\nFAIL')
})

// A snapshot with a recording and a document showing it.
const PANEL = { name: 'demo', columns: 40, exit: '0', title: { en: 'Demo' }, screen: '\x1b[32mOK\x1b[0m   done   \n\x1b[90m# next\x1b[0m' }
let fixtures = 0
const recorded = (block: string) =>
  snapshot(
    {
      'docs/cli/cli-output.json': JSON.stringify({ palette: { '32': '#86EFAC', '90': '#A1A1AA' }, pages: [], panels: [PANEL] }),
      'docs/a.md': `# A\n\n${block}\n\n\`\`\`text\nPASS  /srv/a.yaml\n\`\`\`\n\n\`\`\`bash\nalphaavatar setup --plan\n\`\`\`\n`,
    },
    [entry('a', 'docs/a.md', 'A', 'en', '/a')],
    undefined,
    `code-${++fixtures}`,
  )

test('a terminal block shows its recording in color, and its text is what is copied', () => {
  const v = recorded('```terminal demo\nOK   done\n# next\n```')
  const r = renderDocument(v, v.docs.get('docs/a.md')!, 'en')
  assert.deepEqual(r.problems, [])
  const html = renderToString(createElement(Markdown, { hast: r.hast, locale: 'en' }))
  assert.match(html, /<span style="color:#86EFAC">OK<\/span>   done/)
  assert.match(html, /<span style="color:#A1A1AA"># next<\/span>/)
  assert.match(html, /Terminal · ANSI/)
  // The plain block stays plain: PASS and a path get no color.
  assert.match(html, /<code>PASS  \/srv\/a\.yaml<\/code>/)
  assert.match(html, /<span class="tok-command">alphaavatar<\/span> setup <span class="tok-keyword">--plan<\/span>/)
  // The Markdown output keeps the text block as written.
  assert.match(r.markdown, /```terminal demo\nOK   done\n# next\n```/)
})

test('a terminal block that differs from its recording, or names none, stops the build', () => {
  const changed = recorded('```terminal demo\nOK   done\n```')
  assert.deepEqual(renderDocument(changed, changed.docs.get('docs/a.md')!, 'en').problems, ['docs/a.md: terminal block demo differs from its recording'])
  const unknown = recorded('```terminal other\nOK\n```')
  assert.deepEqual(renderDocument(unknown, unknown.docs.get('docs/a.md')!, 'en').problems, [
    'docs/a.md: terminal block other: no such recording in docs/cli/cli-output.json',
  ])
})

test('a long block previews its first lines, keeps them all for copying and says how many there are', () => {
  const long = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
  const v = recorded(`\`\`\`text\n${long}\n\`\`\``)
  const r = renderDocument(v, v.docs.get('docs/a.md')!, 'en')
  const html = renderToString(createElement(Markdown, { hast: r.hast, locale: 'en' }))
  const block = html.split('<div class="code-block"').find((b) => b.includes('line 30'))!
  assert.match(block, /data-long="" data-long-mobile=""/)
  assert.match(block, /Show full output · 30 lines/)
  assert.match(block, /aria-expanded="false"/)
  assert.ok(block.includes('role="region"') && block.includes('tabindex="0"') && block.includes('aria-label="Plain text code; scrolls sideways"'))
  // Ten lines fit Large but not a phone: a phone-only preview.
  const ten = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n')
  const v2 = recorded(`\`\`\`text\n${ten}\n\`\`\``)
  const html2 = renderToString(createElement(Markdown, { hast: renderDocument(v2, v2.docs.get('docs/a.md')!, 'en').hast, locale: 'en' }))
  const block2 = html2.split('<div class="code-block"').find((b) => b.includes('l9'))!
  assert.ok(!block2.includes('data-long=""') && block2.includes('data-long-mobile=""'))
})
