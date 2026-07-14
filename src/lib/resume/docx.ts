import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx'
import { resumeFileName } from './generate'
import type { GeneratedResume } from '../../types'

// Export the generated resume as a real Word (.docx) file in the MOST COMMON, ATS-friendly format:
// single column, no tables/text-boxes/graphics/columns (which ATS parsers mangle), a standard section
// order (Summary → Skills → Experience), reverse-chronological roles, real selectable text, and a
// standard font. Tuned to fit one page for a typical candidate via 0.5" margins + compact spacing.
// The user converts to PDF from Google Drive. Built with `docx`; imported dynamically so it stays out
// of the main bundle.

// Letter page geometry, in twips (1 inch = 1440). 0.5" margins → 7.5" (10800 twips) of content width;
// the right tab stop that pushes dates to the margin sits there.
const MARGIN = 720
const CONTENT_WIDTH = 12240 - MARGIN * 2

const FONT = 'Calibri' // Word's default; ubiquitous and ATS-safe.
const BODY = 21 // half-points → 10.5pt
const NAME = 32 // 16pt
const HEADING = 22 // 11pt

/** A section heading: bold, uppercase, with a thin bottom rule — the standard resume look. */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 70 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: HEADING, font: FONT, color: '111111' })],
  })
}

function bullet(text: string, metric?: string): Paragraph {
  const runs = [new TextRun({ text, size: BODY, font: FONT })]
  if (metric) runs.push(new TextRun({ text: ` (${metric})`, size: BODY, font: FONT, color: '444444' }))
  return new Paragraph({ numbering: { reference: 'resume-bullets', level: 0 }, spacing: { after: 20 }, children: runs })
}

/** Build the ordered paragraphs for the resume body. */
function buildChildren(resume: GeneratedResume): Paragraph[] {
  const { header, summary, skills, experience } = resume
  const out: Paragraph[] = []

  // Header — name + contact, centered (a common, ATS-safe layout since it's plain text).
  if (header.name) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: header.title || header.contact ? 20 : 80 },
        children: [new TextRun({ text: header.name, bold: true, size: NAME, font: FONT })],
      }),
    )
  }
  if (header.title) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: header.title, size: BODY, font: FONT, color: '333333' })],
      }),
    )
  }
  if (header.contact) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: header.contact, size: BODY - 1, font: FONT, color: '444444' })],
      }),
    )
  }

  if (summary.trim()) {
    out.push(sectionHeading('Summary'))
    out.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: summary.trim(), size: BODY, font: FONT })] }))
  }

  if (skills.length) {
    out.push(sectionHeading('Skills'))
    for (const s of skills) {
      out.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: `${s.category}: `, bold: true, size: BODY, font: FONT }),
            new TextRun({ text: s.items.join(', '), size: BODY, font: FONT }),
          ],
        }),
      )
    }
  }

  if (experience.length) {
    out.push(sectionHeading('Experience'))
    for (const e of experience) {
      const roleCompany = `${e.role}${e.company ? ` — ${e.company}` : ''}`
      // Role/company on the left, dates pushed to the right margin via a right tab stop.
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 20 },
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
          children: [
            new TextRun({ text: roleCompany, bold: true, size: BODY, font: FONT }),
            ...(e.dates ? [new TextRun({ text: `\t${e.dates}`, size: BODY, font: FONT, color: '444444' })] : []),
          ],
        }),
      )
      for (const b of e.bullets) out.push(bullet(b.text, b.metric))
    }
  }

  return out
}

/** Build the .docx as a Blob. */
export async function resumeToDocxBlob(resume: GeneratedResume): Promise<Blob> {
  const doc = new Document({
    creator: resume.header.name || 'Resume',
    title: resume.header.name ? `${resume.header.name} — Resume` : 'Resume',
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 260, hanging: 180 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        children: buildChildren(resume),
      },
    ],
  })
  return Packer.toBlob(doc)
}

/** Generate the resume .docx and trigger a browser download. */
export async function downloadResumeDocx(resume: GeneratedResume): Promise<void> {
  const blob = await resumeToDocxBlob(resume)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = resumeFileName(resume, 'docx')
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
