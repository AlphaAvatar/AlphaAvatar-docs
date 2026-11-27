import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Version } from './site'

// Recorded terminal screens (the main repository's docs/cli/cli-output.json): each panel's
// lines in runs of one color and weight, and the text the terminal showed. The data's `palette`
// gives the 4-bit colors, for its own HTML pages and this site alike; 256-color and RGB codes
// are taken as recorded. Codes that move the cursor are applied, never merely stripped, so the
// text is what was on the screen.

export type Run = { text: string; color?: string; bold?: boolean }
export type Palette = Record<string, string>
export type Panel = { name: string; columns: number; exit: string; title: Record<string, string>; label?: Record<string, string>; screen: string }
export type Recordings = { palette: Palette; panels: Map<string, Panel> }

const CUBE = [0, 95, 135, 175, 215, 255]

// A 256-color index: the 16 4-bit colors from the palette, then xterm's cube and grays.
function xterm(index: number, palette: Palette): string | undefined {
  if (index < 16) return palette[String(index < 8 ? 30 + index : 82 + index)]
  if (index < 232) {
    const cube = index - 16
    return `rgb(${CUBE[Math.floor(cube / 36)]},${CUBE[Math.floor(cube / 6) % 6]},${CUBE[cube % 6]})`
  }
  const gray = 8 + 10 * (index - 232)
  return `rgb(${gray},${gray},${gray})`
}

type Style = { color?: string; bold?: boolean }

function applySgr(params: string, style: Style, palette: Palette): Style {
  const codes = params.split(';').map((c) => Number(c) || 0)
  let { color, bold } = style
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    if (code === 0) [color, bold] = [undefined, undefined]
    else if (code === 1) bold = true
    else if (code === 22) bold = undefined
    else if (code === 39) color = undefined
    else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) color = palette[String(code)]
    else if (code === 38 && codes[i + 1] === 5 && i + 2 < codes.length) {
      color = xterm(codes[i + 2], palette)
      i += 2
    } else if (code === 38 && codes[i + 1] === 2 && i + 4 < codes.length) {
      color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`
      i += 4
    }
  }
  return { color, bold }
}

// The screen as a terminal shows it once the output ends: a carriage return starts its line
// again, a newline moves down (writing over what a line had), cursor-up moves back, an erase
// below drops the lines after the cursor; other codes show nothing.
export function terminalLines(screen: string, palette: Palette): Run[][] {
  const lines: Run[][] = [[]]
  let row = 0
  let style: Style = {}
  const write = (text: string) => {
    const line = lines[row]
    const last = line.at(-1)
    if (last && last.color === style.color && last.bold === style.bold) last.text += text
    else line.push({ text, ...(style.color && { color: style.color }), ...(style.bold && { bold: true }) })
  }
  for (const m of screen.matchAll(/\x1b\[([0-9;?]*)([A-Za-z])|\r\n|\n|\r|\x1b|[^\x1b\r\n]+/g)) {
    const [token, params, final] = m
    if (final === 'm') style = applySgr(params, style, palette)
    else if (final === 'A') row = Math.max(row - (Number(params) || 1), 0)
    else if (final === 'J') lines.splice(row + 1)
    else if (final || token === '\x1b') continue
    else if (token === '\n' || token === '\r\n') {
      row++
      if (row === lines.length) lines.push([])
      else lines[row] = []
    } else if (token === '\r') lines[row] = []
    else write(token)
  }
  while (lines.length > 1 && !lines[0].length) lines.shift()
  while (lines.length > 1 && !lines.at(-1)!.length) lines.pop()
  return lines
}

// The text the terminal showed; a line's trailing blanks are not part of it.
export const terminalText = (lines: Run[][]) => lines.map((l) => l.map((r) => r.text).join('').trimEnd()).join('\n')

const cache = new Map<string, Recordings | null>()

export function recordings(v: Version): Recordings | null {
  if (!cache.has(v.source.root)) {
    const file = path.join(v.source.root, 'docs/cli/cli-output.json')
    const data = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { palette?: Palette; panels: Panel[] }) : undefined
    cache.set(v.source.root, data ? { palette: data.palette ?? {}, panels: new Map(data.panels.map((p) => [p.name, p])) } : null)
  }
  return cache.get(v.source.root)!
}
