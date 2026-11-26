'use client'

import { useState } from 'react'
import { strings } from '@/lib/i18n'

// Copies `text`, or the body at `url` (the page's own Markdown output), with visible feedback.
export function CopyButton({ text, url, label, locale }: { text?: string; url?: string; label: string; locale: string }) {
  const t = strings(locale)
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      let body = text
      if (body === undefined) {
        const response = await fetch(url!)
        if (!response.ok) throw new Error(String(response.status))
        body = await response.text()
      }
      await navigator.clipboard.writeText(body)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2400)
  }

  return (
    <button type="button" className="button small copy" data-state={state} onClick={copy}>
      <img src="/icons/copy.svg" width={16} height={16} alt="" />
      <span aria-live="polite">{state === 'copied' ? t.copied : state === 'failed' ? t.copyFailed : label}</span>
    </button>
  )
}
