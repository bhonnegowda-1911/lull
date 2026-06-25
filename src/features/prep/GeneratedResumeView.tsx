import { useMemo, useState } from 'react'
import { resumeToMarkdown } from '../../lib/resume/generate'
import { analyzeResumeFit } from '../../lib/resume/fit'
import { listStories } from '../../lib/storyStore'
import type { GeneratedResume, ParsedJob, ResumeBullet } from '../../types'
import type { Project } from '../../data/projects'
import type { Story } from '../../data/stories'

// Renders a generated resume with per-bullet provenance chips (which story/project each bullet came
// from) and closes the Phase-2 loop: "Score this draft" re-runs the Phase-1 fit analyzer on the
// generated text and shows the fit delta vs the stored resume. Copy/export as markdown.

export default function GeneratedResumeView({
  resume,
  job,
  baselineFitScore,
  stories,
  projects,
}: {
  resume: GeneratedResume
  job: ParsedJob | null
  /** The stored resume's fit score, if it was analyzed — used to show the delta. */
  baselineFitScore: number | null
  stories: Story[]
  projects: Project[]
}) {
  const [scoring, setScoring] = useState(false)
  const [draftScore, setDraftScore] = useState<number | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Lookups so a bullet's source id resolves to a human label for its chip.
  const storyTitle = useMemo(() => new Map(stories.map((s) => [s.id, s.title || 'Untitled story'])), [stories])
  const projectTitle = useMemo(() => new Map(projects.map((p) => [p.id, p.title || 'Untitled project'])), [projects])

  const markdown = useMemo(() => resumeToMarkdown(resume), [resume])

  async function scoreDraft() {
    if (scoring) return
    setScoring(true)
    setScoreError(null)
    try {
      // Re-pull stories so the analyzer can still mark 'add_story' gaps against the live bank.
      const bank = await listStories().catch(() => stories)
      const fit = await analyzeResumeFit({ resumeText: markdown, job: job!, stories: bank })
      setDraftScore(fit.fitScore)
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : 'Could not score the draft — is the backend running?')
    } finally {
      setScoring(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setScoreError('Clipboard unavailable — select and copy manually.')
    }
  }

  // One-click PDF download via @react-pdf/renderer (real, selectable, ATS-friendly text). The renderer
  // is heavy, so it's lazy-loaded on first use to keep it out of the main bundle.
  async function exportPdf() {
    if (exporting) return
    setExporting(true)
    setScoreError(null)
    try {
      const { downloadResumePdf } = await import('../../lib/resume/pdf')
      await downloadResumePdf(resume)
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : 'Could not export the PDF.')
    } finally {
      setExporting(false)
    }
  }

  const delta = draftScore != null && baselineFitScore != null ? draftScore - baselineFitScore : null

  return (
    <div className="space-y-4 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Tailored resume draft</h3>
          <p className="text-xs text-stone-500">Every bullet is grounded in a story or project — chips show the source.</p>
        </div>
        <div className="flex items-center gap-2">
          {job && (
            <button
              type="button"
              onClick={() => void scoreDraft()}
              disabled={scoring}
              className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {scoring ? 'Scoring…' : 'Score this draft'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            {copied ? 'Copied!' : 'Copy markdown'}
          </button>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={exporting}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Fit delta — the closed loop */}
      {draftScore != null && (
        <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <span className="text-stone-600">Draft fit:</span>
          <span className="text-lg font-bold text-stone-900">{draftScore}</span>
          {delta != null && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${delta > 0 ? 'bg-emerald-100 text-emerald-700' : delta < 0 ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-600'}`}>
              {delta > 0 ? `+${delta}` : delta} vs stored resume ({baselineFitScore})
            </span>
          )}
        </div>
      )}
      {scoreError && <p className="text-xs text-red-600">{scoreError}</p>}

      {/* Header + summary */}
      <div>
        <p className="text-base font-semibold text-stone-900">{resume.header.name || 'Your name'}</p>
        {resume.header.title && <p className="text-xs uppercase tracking-wide text-stone-400">{resume.header.title}</p>}
        {resume.header.contact && <p className="text-xs text-stone-500">{resume.header.contact}</p>}
        {resume.summary && <p className="mt-2 text-sm text-stone-700">{resume.summary}</p>}
      </div>

      {/* Skills */}
      {resume.skills.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Skills</p>
          <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
            {resume.skills.map((s, i) => (
              <li key={i}><span className="font-medium">{s.category}:</span> {s.items.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Experience with provenance */}
      {resume.experience.map((exp, i) => (
        <div key={i}>
          <p className="text-sm font-semibold text-stone-800">
            {exp.role} — {exp.company}{exp.dates ? <span className="font-normal text-stone-400"> · {exp.dates}</span> : null}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {exp.bullets.map((b, j) => (
              <BulletRow key={j} bullet={b} storyTitle={storyTitle} projectTitle={projectTitle} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function BulletRow({
  bullet,
  storyTitle,
  projectTitle,
}: {
  bullet: ResumeBullet
  storyTitle: Map<string, string>
  projectTitle: Map<string, string>
}) {
  const source =
    bullet.sourceStoryId && storyTitle.has(bullet.sourceStoryId)
      ? { label: storyTitle.get(bullet.sourceStoryId)!, cls: 'bg-terracotta-50 text-terracotta-700 ring-terracotta-200' }
      : bullet.sourceProjectId && projectTitle.has(bullet.sourceProjectId)
        ? { label: projectTitle.get(bullet.sourceProjectId)!, cls: 'bg-violet-50 text-violet-700 ring-violet-200' }
        : bullet.sourceResume
          ? { label: 'resume', cls: 'bg-stone-100 text-stone-600 ring-stone-200' }
          : { label: 'ungrounded', cls: 'bg-amber-50 text-amber-700 ring-amber-200' }

  return (
    <li className="text-sm text-stone-700">
      <span className="mr-1 text-stone-400">•</span>
      {bullet.text}
      {bullet.metric && <span className="text-stone-500"> ({bullet.metric})</span>}
      <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${source.cls}`} title="Source of this bullet">
        ▸ {source.label}
      </span>
    </li>
  )
}
