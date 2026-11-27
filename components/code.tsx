'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'
import { CopyButton } from './copy'

// Lines a preview shows: 320 px at Large, Laptop and Tablet, 240 px on a phone, at 22 px a line
// within the viewport's 16 px padding (app/styles.css, .code-viewport).
const PREVIEW_LINES = 13
const PREVIEW_LINES_MOBILE = 9

export type CodeKind = 'source' | 'plain' | 'terminal'

// A code block: `children` is the code as the server colored it (a language's grammar, a
// recording's own colors, or none); `text` is all of it as copied, hidden preview lines too.
// Only the code scrolls sideways; a long block shows its first lines until expanded, and then
// takes its full height in the article. Without JavaScript the whole block shows.
export function CodeBlock({ kind, label, text, lines, locale, children }: { kind: CodeKind; label: string; text: string; lines: number; locale: string; children: ReactNode }) {
  const t = strings(locale)
  const id = useId()
  const block = useRef<HTMLDivElement>(null)
  const code = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)

  const toggle = () => {
    // Collapsing keeps the block's start in view; the toggle keeps the focus.
    if (expanded) {
      requestAnimationFrame(() => {
        const top = block.current?.getBoundingClientRect().top ?? 0
        if (top < 0) block.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
    setExpanded(!expanded)
  }

  // After a failed copy the code is selected, ready to copy by hand.
  const onResult = (state: string) => {
    setFailed(state === 'failed')
    if (state === 'failed' && code.current) window.getSelection()?.selectAllChildren(code.current)
  }

  return (
    <div
      ref={block}
      className="code-block"
      data-kind={kind}
      data-long={lines > PREVIEW_LINES ? '' : undefined}
      data-long-mobile={lines > PREVIEW_LINES_MOBILE ? '' : undefined}
      data-expanded={expanded ? '' : undefined}
    >
      <div className="code-toolbar">
        <span className="code-label">{label}</span>
        <CopyButton text={text} label={t.copyCode} locale={locale} onResult={onResult} />
      </div>
      {failed && <p className="code-hint">{t.copyByHand}</p>}
      <div id={`${id}code`} className="code-viewport" tabIndex={0} role="region" aria-label={t.codeRegion(label)}>
        <pre>
          <code ref={code}>{children}</code>
        </pre>
      </div>
      {lines > PREVIEW_LINES_MOBILE && (
        <div className="code-footer js-only">
          <span className="code-preview">{expanded ? '' : t.preview}</span>
          <button type="button" className="button" aria-expanded={expanded} aria-controls={`${id}code`} onClick={toggle}>
            {expanded ? t.collapse : kind === 'source' ? t.showFullCode(lines) : t.showFullOutput(lines)}
          </button>
        </div>
      )}
    </div>
  )
}
