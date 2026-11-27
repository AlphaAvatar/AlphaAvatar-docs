import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Element } from 'hast'
import { toString } from 'hast-util-to-string'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { visit } from 'unist-util-visit'
import { Markdown } from '../components/article'
import { renderDocument } from '../lib/markdown'
import { loadVersion } from '../lib/site'

const DIAGRAM = 'flowchart LR\n    a["Source"] -- one-to-many --> b["Segment"]'
const SOURCE = `# Notes\n\n\`\`\`mermaid\n${DIAGRAM}\n\`\`\`\n\n\`\`\`bash\necho hi\n\`\`\`\n`

test('a Mermaid block is handed to the diagram component with its code kept', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-diagram-'))
  mkdirSync(path.join(root, 'docs'))
  writeFileSync(
    path.join(root, 'docs/manifest.yaml'),
    'schema: 1\nrepository: test\nsections:\n  - {id: main, title: Main}\ndocuments:\n' +
      '  - {id: notes, path: docs/notes.md, title: Notes, type: guide, lang: en, route: /notes, section: main, order: 1, visibility: public, status: current, applies_to: snapshot}\n',
  )
  writeFileSync(path.join(root, 'docs/notes.md'), SOURCE)
  const v = loadVersion({ id: 't', label: 't', ref: 'main', sha: '0'.repeat(40), committed: '', root })
  const rendered = renderDocument(v, v.docs.get('docs/notes.md')!, 'en')

  const blocks: Element[] = []
  visit(rendered.hast, 'element', (node: Element) => {
    if (node.tagName === 'code' && (node.properties.className as string[] | undefined)?.includes('language-mermaid')) blocks.push(node)
  })
  assert.equal(blocks.length, 1)
  assert.equal(toString(blocks[0]).trimEnd(), DIAGRAM)
  assert.ok(rendered.markdown.includes(`\`\`\`mermaid\n${DIAGRAM}\n\`\`\``))

  // On the server the diagram is its code block: the fallback without JavaScript or on failure.
  const html = renderToString(createElement(Markdown, { hast: rendered.hast, locale: 'en' }))
  assert.equal(html.match(/data-diagram="mermaid"/g)?.length, 1)
  assert.match(html, /<pre><code class="language-mermaid">flowchart LR\n {4}a\[&quot;Source&quot;\] -- one-to-many --&gt; b\[&quot;Segment&quot;\]/)
  assert.match(html, /<code class="language-bash">echo hi/)
})
