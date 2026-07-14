// Tolerant partial-JSON parser for streamed structured output. As the model emits its JSON one
// token at a time, the accumulated text is almost always syntactically incomplete (an unclosed
// string, a half-written array, a dangling key). This repairs the largest valid prefix so the UI
// can render fields as they close, then falls back to `undefined` when even that can't be salvaged —
// callers keep the last good snapshot rather than flashing. Best-effort by design: it targets the
// shapes real streams produce (closed strings/objects/arrays, trailing separators, partial scalars),
// not adversarial input.

/** True when `token` is a complete JSON scalar on its own (number, true, false, null). */
function isCompleteScalar(token: string): boolean {
  try {
    JSON.parse(token)
    return true
  } catch {
    return false
  }
}

/**
 * Parse possibly-incomplete JSON into the largest valid value it can represent, or `undefined` when
 * nothing parseable can be recovered. Complete input round-trips exactly like `JSON.parse`.
 */
export function parsePartialJson(input: string): unknown {
  const text = input.trim()
  if (!text) return undefined

  // Fast path: already valid.
  try {
    return JSON.parse(text)
  } catch {
    // fall through to repair
  }

  // Single pass: copy chars while tracking string state and the open-container stack. Only strings
  // can contain structural characters, so everything outside a string is real structure.
  const stack: Array<'{' | '['> = []
  let inString = false
  let escaped = false
  let s = ''
  for (const c of text) {
    if (inString) {
      s += c
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
    s += c
  }

  // Close a dangling string (dropping a trailing incomplete escape first, e.g. `"ab\`).
  if (inString) {
    if (escaped) s = s.slice(0, -1)
    s += '"'
  }

  s = s.replace(/\s+$/, '')

  // Drop a trailing incomplete scalar token (e.g. `tru`, `12.`, `nul`). Closed strings end in `"`
  // and are excluded by the character class, so only barewords/numbers are considered.
  const tail = s.match(/[^\s{}[\]:,"]+$/)
  if (tail && !isCompleteScalar(tail[0])) {
    s = s.slice(0, s.length - tail[0].length).replace(/\s+$/, '')
  }

  // Drop trailing separators / a key with no value, so the container closes cleanly.
  // Order matters: strip commas, then a dangling `"key":`, then an incomplete key string.
  s = s.replace(/,\s*$/, '')
  s = s.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, '') // `…, "key":` with no value yet
  if (stack[stack.length - 1] === '{') {
    // A trailing string in key position (no colon) is a half-typed key — drop it.
    s = s.replace(/([{,])\s*"(?:[^"\\]|\\.)*"$/, '$1')
  }
  s = s.replace(/,\s*$/, '')

  // Close open containers in reverse order.
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']'
  }

  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
