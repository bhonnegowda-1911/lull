import { describe, expect, it } from 'vitest'
import { inferStyle, type TextSpan } from '../lib/resume/parseFile'

// The pdf.js / mammoth I/O is browser-only and untested; this covers the pure style inference — the
// part that turns raw spans into the ResumeStyle the PDF renderer mirrors.

function span(text: string, size: number, opts: Partial<TextSpan> = {}): TextSpan {
  return { text, size, font: opts.font ?? 'arial', bold: opts.bold ?? false, x: opts.x }
}

describe('inferStyle', () => {
  it('falls back to sane defaults for empty input', () => {
    const s = inferStyle([])
    expect(s.fontFamily).toBe('sans')
    expect(s.sectionOrder).toEqual(['summary', 'skills', 'experience'])
  })

  it('picks name size from the largest span and body size from the mode', () => {
    const spans = [
      span('Priya Nair', 20),
      span('body line one', 10),
      span('body line two', 10),
      span('body line three', 10),
    ]
    const s = inferStyle(spans)
    expect(s.nameSize).toBe(20)
    expect(s.baseFontSize).toBe(10)
  })

  it('detects serif family from font names', () => {
    const spans = [span('Name', 18, { font: 'timesnewroman' }), span('body', 10, { font: 'timesnewroman' })]
    expect(inferStyle(spans).fontFamily).toBe('serif')
  })

  it('reads section order from standout heading spans', () => {
    const spans = [
      span('Jane Doe', 18),
      span('Skills', 12, { bold: true }),
      span('Go, Python', 10),
      span('Experience', 12, { bold: true }),
      span('Did things', 10),
      span('Summary', 12, { bold: true }),
      span('A backend engineer', 10),
    ]
    // Order reflects appearance, not the default — Skills before Experience before Summary here.
    expect(inferStyle(spans).sectionOrder).toEqual(['skills', 'experience', 'summary'])
  })

  it('marks the header centered when the name sits mid-page', () => {
    const centered = inferStyle([span('Jane Doe', 18, { x: 250 }), span('body', 10, { x: 40 })], 612)
    expect(centered.headerAlign).toBe('center')
    const leftAligned = inferStyle([span('Jane Doe', 18, { x: 40 }), span('body', 10, { x: 40 })], 612)
    expect(leftAligned.headerAlign).toBe('left')
  })

  it('clamps absurd sizes into a sane range', () => {
    const s = inferStyle([span('Name', 40), span('body', 4), span('body', 4)])
    expect(s.nameSize).toBeLessThanOrEqual(24)
    expect(s.baseFontSize).toBeGreaterThanOrEqual(9)
  })
})
