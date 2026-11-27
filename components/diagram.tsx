'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { strings } from '@/lib/i18n'
import { CopyButton } from './copy'

// Diagram types drawn at their own size, so a wide one scrolls instead of shrinking its text.
const NATURAL = ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'journey', 'timeline', 'mindmap', 'requirement', 'architecture', 'block']

// A Mermaid code block. The server's code block (`children`) is what a page without JavaScript
// shows, and stays when Mermaid cannot draw the diagram; Mermaid itself is loaded only by pages
// that hold one. The source stays one click away and can be copied.
export function Diagram({ code, locale, children }: { code: string; locale: string; children: ReactNode }) {
  const t = strings(locale)
  const id = `diagram-${useId().replace(/[^\w-]/g, '')}`
  const [svg, setSvg] = useState<string>()
  const [source, setSource] = useState(false)

  useEffect(() => {
    let live = true
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        // The site's tokens: canvas, white-alpha surfaces and borders, white text, link-blue edges.
        const font = getComputedStyle(document.body).fontFamily
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          theme: 'base',
          darkMode: true,
          fontFamily: font,
          themeVariables: {
            darkMode: true,
            fontFamily: font,
            fontSize: '14px',
            background: '#02040b',
            primaryColor: 'rgba(255, 255, 255, 0.045)',
            mainBkg: 'rgba(255, 255, 255, 0.045)',
            secondaryColor: 'rgba(255, 255, 255, 0.08)',
            tertiaryColor: 'rgba(255, 255, 255, 0.08)',
            primaryBorderColor: 'rgba(255, 255, 255, 0.1)',
            nodeBorder: 'rgba(255, 255, 255, 0.1)',
            clusterBkg: 'rgba(255, 255, 255, 0.045)',
            clusterBorder: 'rgba(255, 255, 255, 0.1)',
            primaryTextColor: 'rgba(255, 255, 255, 0.9)',
            nodeTextColor: 'rgba(255, 255, 255, 0.9)',
            textColor: 'rgba(255, 255, 255, 0.9)',
            titleColor: '#ffffff',
            lineColor: '#60a5fa',
            edgeLabelBackground: '#02040b',
          },
          ...Object.fromEntries(NATURAL.map((type) => [type, { useMaxWidth: false }])),
        })
        const { svg } = await mermaid.render(id, code)
        if (live) setSvg(svg)
      })
      .catch(() => document.getElementById(`d${id}`)?.remove())
    return () => {
      live = false
    }
  }, [id, code])

  return (
    <div className="code-block" data-diagram="mermaid">
      <div className="code-toolbar">
        <span>mermaid</span>
        <span className="code-actions">
          {svg && (
            <button type="button" className="button small" onClick={() => setSource((s) => !s)}>
              {source ? t.showDiagram : t.showCode}
            </button>
          )}
          <CopyButton text={code} label={t.copyCode} locale={locale} />
        </span>
      </div>
      {svg && !source ? <div className="diagram" tabIndex={0} dangerouslySetInnerHTML={{ __html: svg }} /> : children}
    </div>
  )
}
