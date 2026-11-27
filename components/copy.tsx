'use client'

import { useEffect, useRef, useState } from 'react'
import { strings } from '@/lib/i18n'

export type CopyState = 'idle' | 'copied' | 'failed'

// The clipboard API, else a selected textarea and the copy command. Whether that copies, says it
// did not or throws, the textarea goes and the focus comes back to where it was. Throws when
// neither copies.
export async function write(body: string) {
  try {
    await navigator.clipboard.writeText(body)
    return
  } catch {}
  const focused = document.activeElement as HTMLElement | null
  const area = Object.assign(document.createElement('textarea'), { value: body, readOnly: true })
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' })
  document.body.append(area)
  let copied = false
  try {
    area.select()
    copied = document.execCommand('copy')
  } finally {
    area.remove()
    focused?.focus({ preventScroll: true })
  }
  if (!copied) throw new Error('copy failed')
}

// Copies `text`, or the body at `url` (the page's own Markdown output). The button keeps the
// focus; "Copied" shows for 2 s, and both outcomes are announced. A failure stays until the next
// try, which is the retry. On a failure `select` offers the text for copying by hand, true when it
// is selected; what is announced says what there is to do, never a selection that is not there.
export function CopyButton({
  text,
  url,
  label,
  locale,
  select,
  onResult,
}: {
  text?: string
  url?: string
  label: string
  locale: string
  select?: () => boolean
  onResult?: (state: CopyState) => void
}) {
  const t = strings(locale)
  const [state, setState] = useState<CopyState>('idle')
  const [note, setNote] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const show = (next: CopyState) => {
    setState(next)
    onResult?.(next)
  }

  async function copy() {
    window.clearTimeout(timer.current)
    setNote('') // A failure again is announced again.
    try {
      let body = text
      if (body === undefined) {
        const response = await fetch(url!)
        if (!response.ok) throw new Error(String(response.status))
        body = await response.text()
      }
      await write(body)
      show('copied')
      setNote(t.copied)
      timer.current = window.setTimeout(() => {
        show('idle')
        setNote('')
      }, 2000)
    } catch {
      show('failed')
      setNote(select ? (select() ? t.copyByHand : t.copyBySelecting) : url ? t.copyMarkdownFailed : t.copyFailedNote)
    }
  }

  return (
    <>
      <button type="button" className="button small copy" data-state={state} onClick={copy}>
        <img src="/icons/copy.svg" width={16} height={16} alt="" />
        <span>{state === 'copied' ? t.copied : state === 'failed' ? t.copyFailed : label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {note}
      </span>
    </>
  )
}
