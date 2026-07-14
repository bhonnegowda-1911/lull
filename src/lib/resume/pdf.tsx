import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { resumeFileName } from './generate'
import type { GeneratedResume, ResumeStyle, ResumeSectionKey } from '../../types'

// One-click resume PDF via @react-pdf/renderer. Renders real, selectable text in a clean,
// ATS-friendly single-column reverse-chronological layout. By default it uses built-in Helvetica (no
// font embedding, standard headers — what ATS parsers expect); when the candidate uploaded a resume
// file we pass its inferred ResumeStyle to APPROXIMATE their own look (font family → nearest base-14,
// sizes, header alignment, and section order). The identity header comes straight from their resume.
// Imported dynamically from the resume view so react-pdf stays out of the main bundle.

// @react-pdf ships three base-14 families; arbitrary uploaded fonts can't be embedded, so we map to
// the nearest one (the honest part of "approximate your style").
const FONT_MAP: Record<ResumeStyle['fontFamily'], { base: string; bold: string }> = {
  sans: { base: 'Helvetica', bold: 'Helvetica-Bold' },
  serif: { base: 'Times-Roman', bold: 'Times-Bold' },
  mono: { base: 'Courier', bold: 'Courier-Bold' },
}

const DEFAULT_STYLE: ResumeStyle = {
  fontFamily: 'sans',
  baseFontSize: 10,
  nameSize: 16,
  headingSize: 10.5,
  headerAlign: 'center',
  sectionOrder: ['summary', 'skills', 'experience'],
  accentColor: '#111827',
}

function buildStyles(s: ResumeStyle) {
  const font = FONT_MAP[s.fontFamily]
  return StyleSheet.create({
    page: {
      paddingVertical: 32,
      paddingHorizontal: 48,
      fontFamily: font.base,
      fontSize: s.baseFontSize,
      color: '#1f2937',
      lineHeight: 1.3,
    },
    // Identity header — compact. Each line keeps its own line-height + small bottom margin so the name
    // never overlaps the title (react-pdf packs baselines tightly otherwise).
    header: { textAlign: s.headerAlign, marginBottom: 2 },
    name: { fontSize: s.nameSize, fontFamily: font.bold, color: s.accentColor, lineHeight: 1.15, marginBottom: 2 },
    title: { fontSize: s.baseFontSize - 0.5, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.15, marginBottom: 2 },
    contact: { fontSize: s.baseFontSize - 1, color: '#4b5563', lineHeight: 1.15 },
    rule: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', marginTop: 6 },

    section: { marginTop: 14 },
    sectionTitle: {
      fontSize: s.headingSize,
      fontFamily: font.bold,
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: s.accentColor,
      borderBottomWidth: 0.75,
      borderBottomColor: '#d1d5db',
      paddingBottom: 2,
      marginBottom: 5,
    },
    summary: { fontSize: s.baseFontSize },

    skillRow: { marginBottom: 2 },
    skillCat: { fontFamily: font.bold },

    job: { marginBottom: 8 },
    jobHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 2 },
    jobTitle: { fontFamily: font.bold, fontSize: s.baseFontSize + 0.5, color: s.accentColor, flex: 1, paddingRight: 8 },
    jobDates: { fontSize: s.baseFontSize - 1, color: '#6b7280' },
    bulletRow: { flexDirection: 'row', marginBottom: 2, paddingLeft: 4 },
    bulletDot: { width: 9, fontSize: s.baseFontSize },
    bulletText: { flex: 1 },
    metric: { color: '#4b5563' },
  })
}

function ResumeDocument({ resume, style }: { resume: GeneratedResume; style?: ResumeStyle | null }) {
  const s = style ?? DEFAULT_STYLE
  const styles = buildStyles(s)
  const { header, summary, skills, experience } = resume

  const sectionNodes: Record<ResumeSectionKey, ReactNode> = {
    summary: summary ? (
      <View style={styles.section} key="summary">
        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
    ) : null,
    skills: skills.length > 0 ? (
      <View style={styles.section} key="skills">
        <Text style={styles.sectionTitle}>Skills</Text>
        {skills.map((sk, i) => (
          <Text key={i} style={styles.skillRow}>
            <Text style={styles.skillCat}>{sk.category}: </Text>
            {sk.items.join(', ')}
          </Text>
        ))}
      </View>
    ) : null,
    experience: experience.length > 0 ? (
      <View style={styles.section} key="experience">
        <Text style={styles.sectionTitle}>Experience</Text>
        {experience.map((e, i) => (
          <View key={i} style={styles.job} wrap={false}>
            <View style={styles.jobHead}>
              <Text style={styles.jobTitle}>
                {e.role}
                {e.company ? ` — ${e.company}` : ''}
              </Text>
              {e.dates ? <Text style={styles.jobDates}>{e.dates}</Text> : null}
            </View>
            {e.bullets.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  {b.text}
                  {b.metric ? <Text style={styles.metric}> ({b.metric})</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    ) : null,
  }

  // Render supported sections in the candidate's original order; de-dupe + backfill any omitted.
  const order = [...new Set([...s.sectionOrder, 'summary', 'skills', 'experience'] as ResumeSectionKey[])]

  return (
    <Document title={header.name || 'Resume'} author={header.name || undefined}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          {header.name ? <Text style={styles.name}>{header.name}</Text> : null}
          {header.title ? <Text style={styles.title}>{header.title}</Text> : null}
          {header.contact ? <Text style={styles.contact}>{header.contact}</Text> : null}
        </View>
        <View style={styles.rule} />
        {order.map((k) => sectionNodes[k])}
      </Page>
    </Document>
  )
}

/** Generate the resume PDF and trigger a browser download. Pass the candidate's inferred `style` to
 *  approximate their uploaded resume's look; omit it for the clean default template. */
export async function downloadResumePdf(resume: GeneratedResume, style?: ResumeStyle | null): Promise<void> {
  const blob = await pdf(<ResumeDocument resume={resume} style={style} />).toBlob()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = resumeFileName(resume)
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Revoke after a tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
