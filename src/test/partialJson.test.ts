import { describe, expect, it } from 'vitest'
import { parsePartialJson } from '../lib/partialJson'

// The parser feeds progressive UI from a streamed JSON body, so it must salvage the largest valid
// prefix of syntactically incomplete input and never throw — returning `undefined` when nothing is
// recoverable so callers keep their last good snapshot.

describe('parsePartialJson', () => {
  it('round-trips complete input like JSON.parse', () => {
    const obj = { summary: 'ok', scores: { structure: 4 }, notes: ['a', 'b'], conforms: true }
    expect(parsePartialJson(JSON.stringify(obj))).toEqual(obj)
  })

  it('returns undefined for empty / whitespace input', () => {
    expect(parsePartialJson('')).toBeUndefined()
    expect(parsePartialJson('   \n')).toBeUndefined()
  })

  it('closes a truncated string value', () => {
    expect(parsePartialJson('{"summary": "the answer was clea')).toEqual({ summary: 'the answer was clea' })
  })

  it('drops a dangling escape inside an unclosed string', () => {
    expect(parsePartialJson('{"summary": "line one\\')).toEqual({ summary: 'line one' })
  })

  it('closes unclosed objects and arrays', () => {
    expect(parsePartialJson('{"scores": {"structure": 4')).toEqual({ scores: { structure: 4 } })
    expect(parsePartialJson('{"notes": ["a", "b"')).toEqual({ notes: ['a', 'b'] })
  })

  it('drops a trailing comma', () => {
    expect(parsePartialJson('{"notes": ["a", "b", ')).toEqual({ notes: ['a', 'b'] })
    expect(parsePartialJson('{"a": 1, ')).toEqual({ a: 1 })
  })

  it('drops a key that has no value yet', () => {
    expect(parsePartialJson('{"a": 1, "summary":')).toEqual({ a: 1 })
    expect(parsePartialJson('{"a": 1, "summary": ')).toEqual({ a: 1 })
  })

  it('drops a half-typed key string with no colon', () => {
    expect(parsePartialJson('{"a": 1, "sum')).toEqual({ a: 1 })
    expect(parsePartialJson('{"comp')).toEqual({})
  })

  it('drops an incomplete scalar literal', () => {
    expect(parsePartialJson('{"conforms": tru')).toEqual({})
    expect(parsePartialJson('{"a": 1, "b": nul')).toEqual({ a: 1 })
    expect(parsePartialJson('{"a": 12.')).toEqual({})
  })

  it('keeps a complete scalar mid-stream', () => {
    expect(parsePartialJson('{"a": 123')).toEqual({ a: 123 })
    expect(parsePartialJson('{"a": false')).toEqual({ a: false })
  })

  it('handles nested partials (object → array → object)', () => {
    const text = '{"perBeat": {"situation": {"present": true, "score": 4, "note": "clear set'
    expect(parsePartialJson(text)).toEqual({
      perBeat: { situation: { present: true, score: 4, note: 'clear set' } },
    })
  })

  it('does not treat braces inside a string as structure', () => {
    expect(parsePartialJson('{"summary": "use {curly} braces"')).toEqual({ summary: 'use {curly} braces' })
  })

  it('preserves earlier fields when the latest one is incomplete', () => {
    const text = '{"conforms": true, "summary": "solid answer", "scores": {"structure": 5, "detail'
    expect(parsePartialJson(text)).toEqual({
      conforms: true,
      summary: 'solid answer',
      scores: { structure: 5 },
    })
  })
})
