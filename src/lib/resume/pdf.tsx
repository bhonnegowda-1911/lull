import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { resumeFileName } from './generate'
import type { GeneratedResume } from '../../types'

// One-click resume PDF via @react-pdf/renderer. Renders real, selectable text in a clean,
// ATS-friendly single-column reverse-chronological layout (built-in Helvetica — no font embedding,
// no graphics, standard section headers — the format ATS parsers and recruiters expect). The identity
// header (name + title + contact) comes straight from the candidate's own resume. This module is
// imported dynamically from the resume view so react-pdf stays out of the main bundle.

const styles = StyleSheet.create({
  page: {
    paddingVertical: 32,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1f2937',
    lineHeight: 1.3,
  },
  // Centered identity header — compact. Each line keeps its own line-height + small bottom margin so
  // the name never overlaps the title (react-pdf packs baselines tightly otherwise).
  header: { textAlign: 'center', marginBottom: 2 },
  name: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#111827', lineHeight: 1.15, marginBottom: 2 },
  title: { fontSize: 9.5, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.15, marginBottom: 2 },
  contact: { fontSize: 9, color: '#4b5563', lineHeight: 1.15 },
  rule: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', marginTop: 6 },

  section: { marginTop: 10 },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#111827',
    borderBottomWidth: 0.75,
    borderBottomColor: '#d1d5db',
    paddingBottom: 2,
    marginBottom: 5,
  },
  summary: { fontSize: 10 },

  skillRow: { marginBottom: 2 },
  skillCat: { fontFamily: 'Helvetica-Bold' },

  job: { marginBottom: 8 },
  jobHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 2 },
  jobTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: '#111827', flex: 1, paddingRight: 8 },
  jobDates: { fontSize: 9, color: '#6b7280' },
  bulletRow: { flexDirection: 'row', marginBottom: 2, paddingLeft: 4 },
  bulletDot: { width: 9, fontSize: 10 },
  bulletText: { flex: 1 },
  metric: { color: '#4b5563' },
})

function ResumeDocument({ resume }: { resume: GeneratedResume }) {
  const { header, summary, skills, experience } = resume
  return (
    <Document title={header.name || 'Resume'} author={header.name || undefined}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          {header.name ? <Text style={styles.name}>{header.name}</Text> : null}
          {header.title ? <Text style={styles.title}>{header.title}</Text> : null}
          {header.contact ? <Text style={styles.contact}>{header.contact}</Text> : null}
        </View>
        <View style={styles.rule} />

        {summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{summary}</Text>
          </View>
        ) : null}

        {skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {skills.map((s, i) => (
              <Text key={i} style={styles.skillRow}>
                <Text style={styles.skillCat}>{s.category}: </Text>
                {s.items.join(', ')}
              </Text>
            ))}
          </View>
        )}

        {experience.length > 0 && (
          <View style={styles.section}>
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
        )}
      </Page>
    </Document>
  )
}

/** Generate the resume PDF and trigger a browser download. */
export async function downloadResumePdf(resume: GeneratedResume): Promise<void> {
  const blob = await pdf(<ResumeDocument resume={resume} />).toBlob()
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
