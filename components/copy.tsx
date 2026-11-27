'use client'

import { useEffect, useRef, useState } from 'react'
import { strings } from '@/lib/i18n'

export type CopyState = 'idle' | 'copied' | 'failed'

// The clipboard API, else a selected textarea and the copy command; focus comes back to where it
// was. Throws when neither copies.
async function write(body: string) {
  try {
    await navigator.clipboard.writeText(body)
    return
  } catch {}
  const focused = document.activeElement as HTMLElement | null
  const area = Object.assign(document.createElement('textarea'), { value: body, readOnly: true })
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' })
  document.body.append(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  focused?.focus({ preventScroll: true })
  if (!copied) throw new Error('copy failed')
}

// Copies `text`, or the body at `url` (the page's own Markdown output). The button keeps the
// focus; "Copied" shows for 2 s, and both outcomes are announced. A failure stays until the next
// try, which is the retry; `onResult` lets a code block offer its text for copying by hand.
export function CopyButton({ text, url, label, locale, onResult }: { text?: string; url?: string; label: string; locale: string; onResult?: (state: CopyState) => void }) {
  const t = strings(locale)
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const show = (next: CopyState) => {
    setState(next)
    onResult?.(next)
  }

  async function copy() {
    window.clearTimeout(timer.current)
    try {
      let body = text
      if (body === undefined) {
        const response = await fetch(url!)
        if (!response.ok) throw new Error(String(response.status))
        body = await response.text()
      }
      await write(body)
      show('copied')
      timer.current = window.setTimeout(() => show('idle'), 2000)
    } catch {
      show('failed')
    }
  }

  return (
    <>
      <button type="button" className="button small copy" data-state={state} onClick={copy}>
        <img src="/icons/copy.svg" width={16} height={16} alt="" />
        <span>{state === 'copied' ? t.copied : state === 'failed' ? t.copyFailed : label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? t.copied : state === 'failed' ? t.copyFailedNote : ''}
      </span>
    </>
  )
}
