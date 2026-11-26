'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'

// The search overlay: opened from the header or Cmd/Ctrl+K, it searches the index of the
// version and language being read and keeps its query between openings.

type SearchRecord = { href: string; title: string; heading: string; section: string; lang: string; path: string; text: string }
type Indexed = SearchRecord & { haystack: [string, string, string] }

const OPEN = 'docs:search'

function rank(records: Indexed[], query: string): Indexed[] {
  const phrase = query.trim().toLowerCase()
  const terms = phrase.split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const scored: [Indexed, number][] = []
  for (const r of records) {
    const [title, heading, text] = r.haystack
    // Every term must occur; the whole phrase and title or heading matches rank higher.
    let score = (title.includes(phrase) ? 12 : 0) + (heading.includes(phrase) ? 8 : 0) + (text.includes(phrase) ? 4 : 0)
    for (const term of terms) {
      const s = (title.includes(term) ? 8 : 0) + (heading.includes(term) ? 4 : 0) + (text.includes(term) ? 1 : 0)
      if (!s) {
        score = 0
        break
      }
      score += s
    }
    if (score) scored.push([r, score])
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, 30).map(([r]) => r)
}

function snippet(text: string, query: string): ReactNode[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  const at = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0)))
  const start = Math.max(0, at - 60)
  const part = (start ? '…' : '') + text.slice(start, start + 200)
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return part.split(pattern).map((piece, i) => (i % 2 ? <mark key={i}>{piece}</mark> : piece))
}

export function SearchTrigger({ locale, compact }: { locale: string; compact?: boolean }) {
  const t = strings(locale)
  const open = () => window.dispatchEvent(new Event(OPEN))
  if (compact) {
    return (
      <button type="button" className="button icon only-mobile" aria-label={t.searchTitle} onClick={open}>
        <img src="/icons/search.svg" width={20} height={20} alt="" />
      </button>
    )
  }
  return (
    <button type="button" className="search-trigger" aria-label={t.searchTitle} onClick={open}>
      <img src="/icons/search.svg" width={20} height={20} alt="" />
      <span>
        {t.search} <kbd>⌘K</kbd>
      </span>
    </button>
  )
}

export function SearchDialog({ indexUrl, locale, context }: { indexUrl: string; locale: string; context: string[] }) {
  const t = strings(locale)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<Indexed[]>()
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const response = await fetch(indexUrl)
      if (!response.ok) throw new Error(String(response.status))
      const data = (await response.json()) as { records: SearchRecord[] }
      setRecords(data.records.map((r) => ({ ...r, haystack: [r.title.toLowerCase(), r.heading.toLowerCase(), r.text.toLowerCase()] })))
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [indexUrl])

  useEffect(() => {
    const open = () => {
      if (!dialog.current?.open) dialog.current?.showModal()
      input.current?.select()
      if (!records && state !== 'loading') load()
    }
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
      }
    }
    window.addEventListener(OPEN, open)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener(OPEN, open)
      window.removeEventListener('keydown', key)
    }
  }, [records, state, load])

  const results = useMemo(() => (records ? rank(records, query) : []), [records, query])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1)
      setActive(next)
      document.getElementById(`result-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      dialog.current?.close()
      window.location.href = results[active].href
    }
  }

  const status =
    state === 'loading'
      ? t.searchLoading
      : state === 'failed'
        ? t.searchFailed
        : query.trim() && records
          ? results.length
            ? t.searchCount(results.length)
            : t.searchEmpty
          : ''

  return (
    <dialog ref={dialog} className="modal" aria-labelledby="search-title" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
      <div className="dialog-head">
        <h2 id="search-title">{t.searchTitle}</h2>
        <button type="button" className="button small" onClick={() => dialog.current?.close()}>
          {t.close}
        </button>
      </div>
      <div className="search-field">
        <img src="/icons/search.svg" width={20} height={20} alt="" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchTitle}
          aria-controls="search-results"
          aria-activedescendant={results.length ? `result-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
      </div>
      <div className="chips" style={{ marginTop: 12 }}>
        {context.map((c) => (
          <span key={c} className="tag">
            {c}
          </span>
        ))}
      </div>
      <p className="search-status" role="status">
        {status}
        {state === 'failed' && (
          <>
            {' '}
            <button type="button" className="button small" onClick={load}>
              {t.searchRetry}
            </button>
          </>
        )}
      </p>
      <ul id="search-results" className="results" role="listbox" aria-label={t.searchTitle}>
        {results.map((r, i) => (
          <li key={r.href + i} id={`result-${i}`} role="option" aria-selected={i === active}>
            <a className="result" href={r.href} onClick={() => dialog.current?.close()} onMouseEnter={() => setActive(i)}>
              <div className="result-title" lang={r.lang}>
                {r.title}
              </div>
              {r.heading !== r.title && (
                <div className="result-heading" lang={r.lang}>
                  {r.heading}
                </div>
              )}
              <div className="result-text" lang={r.lang}>
                {snippet(r.text, query)}
              </div>
              <div className="result-meta">
                {r.section} · {r.path}
              </div>
            </a>
          </li>
        ))}
      </ul>
      <p className="dialog-hint">{t.searchHint}</p>
    </dialog>
  )
}
