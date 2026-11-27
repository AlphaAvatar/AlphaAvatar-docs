// Syntax colors for code blocks that name their language, by each language's grammar: a word's
// place (a command, a flag, a key, a keyword), quotes and comments. Text without a language, or
// one of another language, gets no color: nothing is read into words such as PASS or a path.

export type TokenKind = 'comment' | 'keyword' | 'string' | 'key' | 'command'
export type Token = { text: string; kind?: TokenKind }

type Line = Token[]

// Adjacent pieces of one kind become one token.
function lineOf(): { push: (text: string, kind?: TokenKind) => void; line: Line } {
  const line: Line = []
  return {
    line,
    push(text, kind) {
      if (!text) return
      const last = line.at(-1)
      if (last && last.kind === kind) last.text += text
      else line.push(kind ? { text, kind } : { text })
    },
  }
}

// The end of a quote opened before `from` (the index of its closing quote), or -1.
function quoteEnd(text: string, from: number, quote: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\' && quote === '"') i++
    else if (text[i] === quote) return i
  }
  return -1
}

/* Bash */

const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', 'case', 'esac', 'function', 'export', 'local', 'return', 'select', '!'])

// A command's first word is the command; assignments before it are keys; words starting with `-`
// are flags; quotes are strings; `#` at a word's start opens a comment. A line ending in `\`
// continues the command, and a quote may run over lines.
function bash(code: string): Line[] {
  const out: Line[] = []
  let quote: string | null = null
  let command = true
  for (const text of code.split('\n')) {
    const { push, line } = lineOf()
    let i = 0
    if (quote) {
      const end = quoteEnd(text, 0, quote)
      push(end < 0 ? text : text.slice(0, end + 1), 'string')
      if (end < 0) {
        out.push(line)
        continue
      }
      i = end + 1
      quote = null
    }
    while (i < text.length) {
      const rest = text.slice(i)
      const space = /^\s+/.exec(rest)
      if (space) {
        push(space[0])
        i += space[0].length
        continue
      }
      if (rest[0] === '#') {
        push(rest, 'comment')
        break
      }
      const operator = /^(\|\||&&|\$\(|[|;&()`<>])/.exec(rest)
      if (operator) {
        push(operator[0])
        i += operator[0].length
        if (!'<>)'.includes(operator[0])) command = true
        continue
      }
      // A word, quotes and all: unquoted and quoted parts.
      const parts: Token[] = []
      while (i < text.length && !/[\s|;&()`<>]/.test(text[i])) {
        if (text[i] === '"' || text[i] === "'") {
          const end = quoteEnd(text, i + 1, text[i])
          if (end < 0) {
            parts.push({ text: text.slice(i), kind: 'string' })
            quote = text[i]
            i = text.length
            break
          }
          parts.push({ text: text.slice(i, end + 1), kind: 'string' })
          i = end + 1
        } else {
          const plain = /^(\\.|[^\s|;&()`<>'"\\])+/.exec(text.slice(i))?.[0] ?? text[i]
          parts.push({ text: plain })
          i += plain.length
        }
      }
      const word = parts.map((p) => p.text).join('')
      const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/.exec(word)
      if (command && assignment && !parts[0].kind) {
        push(assignment[0].slice(0, -1), 'key')
        push('=')
        const value = word.slice(assignment[0].length)
        push(value, /^(["']).*\1$/.test(value) ? 'string' : undefined)
      } else if (command && SHELL_KEYWORDS.has(word)) {
        push(word, 'keyword')
        command = !['for', 'case', 'function', 'export', 'local', 'select'].includes(word)
      } else if (command && !parts.some((p) => p.kind)) {
        push(word, 'command')
        command = false
      } else if (word.startsWith('-') && !parts[0].kind) {
        push(word, 'keyword')
      } else {
        for (const p of parts) push(p.text, p.kind)
        command = false
      }
    }
    command = !quote && !text.endsWith('\\') ? true : command
    out.push(line)
  }
  return out
}

/* YAML */

const YAML_CONSTANTS = /^(true|false|null|~|yes|no|on|off)$/i

// A value: quoted strings, constants, a comment after it; the rest stays as written.
function yamlValue(push: (text: string, kind?: TokenKind) => void, value: string) {
  let comment = -1
  let quote: string | null = null
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      comment = i
      break
    }
  }
  const body = comment < 0 ? value : value.slice(0, comment)
  const [, lead, core, trail] = /^(\s*)(.*?)(\s*)$/.exec(body)!
  push(lead)
  if (/^(["']).*\1$/.test(core)) push(core, 'string')
  else if (YAML_CONSTANTS.test(core)) push(core, 'keyword')
  else push(core)
  push(trail)
  if (comment >= 0) push(value.slice(comment), 'comment')
}

function yaml(code: string): Line[] {
  const out: Line[] = []
  // The indentation of a key whose value is a block scalar (`|`, `>`): deeper lines are text.
  let block: number | null = null
  for (const text of code.split('\n')) {
    const { push, line } = lineOf()
    const indent = /^\s*/.exec(text)![0].length
    if (block !== null && (!text.trim() || indent > block)) {
      push(text)
      out.push(line)
      continue
    }
    block = null
    let rest = text
    const lead = /^(\s*(?:-\s+)*)/.exec(rest)![0]
    push(lead)
    rest = rest.slice(lead.length)
    if (rest.startsWith('#')) {
      push(rest, 'comment')
      out.push(line)
      continue
    }
    const key = /^("(?:\\.|[^"\\])*"|'[^']*'|[^\s#'"{}[\],&*!|>%@`-][^#:]*?|-[^\s#:][^#:]*?)(\s*:)(?=\s|$)/.exec(rest)
    if (key) {
      push(key[1], 'key')
      push(key[2])
      rest = rest.slice(key[0].length)
      if (/^\s*[|>][-+0-9]*\s*(#.*)?$/.test(rest)) block = indent
    }
    yamlValue(push, rest)
    out.push(line)
  }
  return out
}

/* JSON */

function json(code: string): Line[] {
  return code.split('\n').map((text) => {
    const { push, line } = lineOf()
    for (const m of text.matchAll(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|[^"]+?(?=["]|\b(?:true|false|null)\b|$)|./g)) {
      if (m[1]) {
        push(m[1], m[2] ? 'key' : 'string')
        push(m[2] ?? '')
      } else if (m[3]) push(m[3], 'keyword')
      else push(m[0])
    }
    return line
  })
}

/* Python */

const PYTHON_KEYWORDS = new Set(
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case'.split(' '),
)

function python(code: string): Line[] {
  const out: Line[] = []
  let triple: string | null = null
  for (const text of code.split('\n')) {
    const { push, line } = lineOf()
    let i = 0
    if (triple) {
      const end = text.indexOf(triple)
      push(end < 0 ? text : text.slice(0, end + 3), 'string')
      if (end < 0) {
        out.push(line)
        continue
      }
      i = end + 3
      triple = null
    }
    // The name after `def` or `class`.
    let named = false
    while (i < text.length) {
      const rest = text.slice(i)
      let m: RegExpExecArray | null
      if ((m = /^#.*/.exec(rest))) {
        push(m[0], 'comment')
        break
      }
      if ((m = /^[rbfuRBFU]{0,2}("""|''')/.exec(rest))) {
        const end = text.indexOf(m[1], i + m[0].length)
        if (end < 0) {
          push(rest, 'string')
          triple = m[1]
          break
        }
        push(text.slice(i, end + 3), 'string')
        i = end + 3
      } else if ((m = /^[rbfuRBFU]{0,2}(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/.exec(rest))) {
        push(m[0], 'string')
        i += m[0].length
      } else if ((m = /^@[A-Za-z_][\w.]*/.exec(rest))) {
        push(m[0], 'key')
        i += m[0].length
      } else if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
        push(m[0], named ? 'command' : PYTHON_KEYWORDS.has(m[0]) ? 'keyword' : undefined)
        named = m[0] === 'def' || m[0] === 'class'
        i += m[0].length
        continue
      } else {
        m = /^\s+|^./.exec(rest)!
        push(m[0])
        i += m[0].length
        if (/^\s+$/.test(m[0])) continue
      }
      named = false
    }
    out.push(line)
  }
  return out
}

/* .env, INI, TOML */

function conf(code: string): Line[] {
  return code.split('\n').map((text) => {
    const { push, line } = lineOf()
    if (/^\s*[#;]/.test(text)) push(text, 'comment')
    else if (/^\s*\[.*\]\s*$/.test(text)) push(text, 'keyword')
    else {
      const m = /^(\s*)(export\s+)?([A-Za-z0-9_.-]+)(\s*=\s*)(.*)$/.exec(text)
      if (!m) push(text)
      else {
        push(m[1])
        push(m[2] ?? '', 'keyword')
        push(m[3], 'key')
        push(m[4])
        yamlValue(push, m[5])
      }
    }
    return line
  })
}

const GRAMMARS: Record<string, [string, (code: string) => Line[]]> = {
  bash: ['Bash', bash],
  sh: ['Shell', bash],
  shell: ['Shell', bash],
  zsh: ['Zsh', bash],
  yaml: ['YAML', yaml],
  yml: ['YAML', yaml],
  json: ['JSON', json],
  python: ['Python', python],
  py: ['Python', python],
  dotenv: ['.env', conf],
  env: ['.env', conf],
  ini: ['INI', conf],
  toml: ['TOML', conf],
}

// The code's lines in tokens and its language's name, for a language this site reads; undefined
// for any other, which is shown as plain text.
export function highlight(lang: string | undefined, code: string): { label: string; lines: Line[] } | undefined {
  const grammar = lang ? GRAMMARS[lang.toLowerCase()] : undefined
  return grammar && { label: grammar[0], lines: grammar[1](code) }
}
