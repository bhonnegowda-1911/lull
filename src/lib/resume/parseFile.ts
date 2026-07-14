import type { ResumeStyle, ResumeFontFamily, ResumeSectionKey } from '../../types'

// Parse an uploaded resume file (PDF or Word) into plain text PLUS best-effort style cues, so the
// generated PDF can approximate the candidate's own look instead of the app's fixed template (the
// "mirror your style" path). The style inference is a pure function over normalized text spans so it's
// unit-tested; the pdfjs/mammoth I/O wrappers are thin and browser-only. Nothing leaves the browser —
// parsing happens client-side, in keeping with the app's local-first/BYOK posture.

/** A normalized text span from the source document — the common shape style inference works over,
 *  independent of pdf.js's item type. */
export interface TextSpan {
  text: string
  /** Font size in pt. */
  size: number
  /** Lowercased font name, if the format exposes one. */
  font: string
  bold: boolean
  /** Horizontal start position in page units (for header-centering detection); optional. */
  x?: number
}

const DEFAULT_STYLE: ResumeStyle = {
  fontFamily: 'sans',
  baseFontSize: 10,
  nameSize: 16,
  headingSize: 10.5,
  headerAlign: 'left',
  sectionOrder: ['summary', 'skills', 'experience'],
  accentColor: '#111827',
}

const SECTION_KEYWORDS: { key: ResumeSectionKey; re: RegExp }[] = [
  { key: 'summary', re: /^(summary|profile|about|objective)\b/i },
  { key: 'skills', re: /^(skills|technical skills|technologies|core competencies)\b/i },
  { key: 'experience', re: /^(experience|work experience|employment|professional experience)\b/i },
]

function familyFromFont(font: string): ResumeFontFamily {
  if (/courier|mono|consolas|menlo/i.test(font)) return 'mono'
  if (/times|serif|georgia|garamond|minion|book antiqua|cambria|palatino/i.test(font)) return 'serif'
  return 'sans'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** The most common value in a list (mode) — used for the body font size / family. */
function mode<T>(xs: T[]): T | undefined {
  const counts = new Map<T, number>()
  let best: T | undefined
  let bestN = 0
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1
    counts.set(x, n)
    if (n > bestN) {
      bestN = n
      best = x
    }
  }
  return best
}

/** Infer a ResumeStyle from normalized spans (already in reading order). Pure. `pageWidth`, when
 *  known, enables header-centering detection. Falls back to the app default for anything unclear. */
export function inferStyle(spans: TextSpan[], pageWidth?: number): ResumeStyle {
  const meaningful = spans.filter((s) => s.text.trim())
  if (!meaningful.length) return { ...DEFAULT_STYLE }

  const sizes = meaningful.map((s) => Math.round(s.size * 2) / 2) // round to 0.5pt
  const bodySize = mode(sizes) ?? DEFAULT_STYLE.baseFontSize
  const maxSize = Math.max(...sizes)

  // The name is the largest span near the top; take the first span at (or near) the max size.
  const nameSpan = meaningful.find((s) => Math.round(s.size * 2) / 2 >= maxSize - 0.5)

  const family = mode(meaningful.map((s) => familyFromFont(s.font))) ?? DEFAULT_STYLE.fontFamily

  // Section headings: spans that match a section keyword AND stand out (bold or larger than body).
  const sectionOrder: ResumeSectionKey[] = []
  const headingSizes: number[] = []
  for (const s of meaningful) {
    const stands = s.bold || Math.round(s.size * 2) / 2 > bodySize
    if (!stands) continue
    const hit = SECTION_KEYWORDS.find((k) => k.re.test(s.text.trim()))
    if (hit) {
      if (!sectionOrder.includes(hit.key)) sectionOrder.push(hit.key)
      headingSizes.push(s.size)
    }
  }

  // Header alignment: centered when the name span sits roughly mid-page.
  let headerAlign: ResumeStyle['headerAlign'] = 'left'
  if (nameSpan?.x != null && pageWidth) {
    const rel = nameSpan.x / pageWidth
    if (rel > 0.25) headerAlign = 'center'
  }

  return {
    fontFamily: family,
    baseFontSize: clamp(bodySize, 9, 12),
    nameSize: clamp(nameSpan?.size ?? maxSize, 13, 24),
    headingSize: clamp(headingSizes.length ? Math.max(...headingSizes) : bodySize + 0.5, 9.5, 14),
    headerAlign,
    sectionOrder: sectionOrder.length ? sectionOrder : DEFAULT_STYLE.sectionOrder,
    accentColor: DEFAULT_STYLE.accentColor,
  }
}

/** Extract spans + text from a PDF via pdf.js (browser-only). */
async function parsePdf(file: File): Promise<{ text: string; spans: TextSpan[]; pageWidth?: number }> {
  const pdfjs = await import('pdfjs-dist')
  // Vite resolves the worker to a URL; set it once before loading a document.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const spans: TextSpan[] = []
  const lines: string[] = []
  let pageWidth: number | undefined
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    if (p === 1) pageWidth = page.getViewport({ scale: 1 }).width
    const content = await page.getTextContent()
    for (const item of content.items as Array<{ str?: string; fontName?: string; height?: number; transform?: number[] }>) {
      const text = item.str ?? ''
      if (!text.trim()) continue
      const size = item.height || Math.abs(item.transform?.[3] ?? 10)
      const font = (item.fontName ?? '').toLowerCase()
      spans.push({ text, size, font, bold: /bold|black|semibold|heavy/.test(font), x: item.transform?.[4] })
      lines.push(text)
    }
    lines.push('')
  }
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), spans, pageWidth }
}

/** Extract text from a Word .docx via mammoth (browser-only). Word carries less reliable inline sizing,
 *  so style is inferred from heading structure and defaults. */
async function parseDocx(file: File): Promise<{ text: string; spans: TextSpan[]; html: string }> {
  const mammoth = (await import('mammoth')).default
  const buf = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const spans: TextSpan[] = []
  const lines: string[] = []
  for (const el of Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,p,li'))) {
    const text = (el.textContent ?? '').trim()
    if (!text) continue
    const tag = el.tagName.toLowerCase()
    const isHeading = /^h[1-4]$/.test(tag)
    // Approximate sizes from the heading level so inferStyle can pick out sections.
    const size = tag === 'h1' ? 16 : tag === 'h2' ? 13 : isHeading ? 12 : 10
    spans.push({ text, size, font: '', bold: isHeading })
    lines.push(text)
  }
  return { text: lines.join('\n').trim(), spans, html }
}

/** The result of parsing an uploaded resume: text + inferred style for downstream use, the file kind,
 *  and — for Word — the rendered HTML so the tab can show the document instead of raw text. */
export interface ParsedResumeFile {
  text: string
  style: ResumeStyle
  fileType: 'pdf' | 'docx'
  /** Present for Word only; PDFs are embedded from the original file instead. */
  html?: string
}

/** Parse an uploaded resume file into text + inferred style (+ HTML for Word). Throws on an
 *  unsupported type. */
export async function parseResumeFile(file: File): Promise<ParsedResumeFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { text, spans, pageWidth } = await parsePdf(file)
    return { text, style: inferStyle(spans, pageWidth), fileType: 'pdf' }
  }
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { text, spans, html } = await parseDocx(file)
    return { text, style: inferStyle(spans), fileType: 'docx', html }
  }
  throw new Error('Please upload a PDF or Word (.docx) file.')
}
