import { useState } from 'react'
import { listStories, saveStory } from '../../../lib/storyStore'
import { listProjects } from '../../../lib/projectStore'
import { saveSession } from '../../../lib/sessionStore'
import { generateResume, gapFillsToStories } from '../../../lib/resume/generate'
import { reviewGapAnswers, type GapReview } from '../../../lib/resume/gapReview'
import GeneratedResumeView from '../GeneratedResumeView'
import GapFiller from './GapFiller'
import Pending from '../../../components/Pending'
import type { Project } from '../../../data/projects'
import type { Profile, Story } from '../../../data/stories'
import type { GeneratedResume, JobDescription, ResumeFit } from '../../../types'

// Step 2: generate a JD-tailored resume grounded strictly in the candidate's stories + projects, and
// mark the application as applied. Unlocked once fit has been checked; a weak verdict is a caution,
// not a hard block. Extracted from the old MatchTab.

interface Props {
  job: JobDescription
  profile: Profile | null
  baselineFitScore: number | null
  /** The prior fit run's full result, if any — feeds the generator the requirements/gaps to surface. */
  fit: ResumeFit | null
  /** Fit has been checked and isn't a clear mismatch — the natural point to tailor a resume. */
  unlocked: boolean
  applied: boolean
  onApplied: () => void
}

export default function ResumeStep({ job, profile, baselineFitScore, fit, unlocked, applied, onApplied }: Props) {
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedResume | null>(null)
  const [sources, setSources] = useState<{ stories: Story[]; projects: Project[] }>({ stories: [], projects: [] })
  const [error, setError] = useState<string | null>(null)
  // One note per fit gap (aligned to fit.gaps order); each non-empty note becomes a grounded story.
  const [gapNotes, setGapNotes] = useState<string[]>([])
  const [saveGapsToBank, setSaveGapsToBank] = useState(false)
  // LLM review per gap (aligned to gaps order); null where not yet reviewed or the answer was blank.
  const [gapReviews, setGapReviews] = useState<(GapReview | null)[]>([])
  const [checking, setChecking] = useState(false)

  const gaps = fit?.gaps ?? []

  async function checkAnswers() {
    if (!job.parsed || checking) return
    setChecking(true)
    try {
      const answers = gaps.map((g, i) => ({ requirement: g.title, note: gapNotes[i] ?? '' }))
      const reviews = await reviewGapAnswers({ job: job.parsed, answers })
      // reviews come back only for non-empty answers, in order — map them back onto gap positions.
      const queue = [...reviews]
      setGapReviews(gaps.map((_, i) => (answers[i].note.trim() ? queue.shift() ?? null : null)))
    } catch {
      // Non-blocking nudge — a failed check shouldn't stop the candidate generating.
    } finally {
      setChecking(false)
    }
  }

  async function generate() {
    if (!job.parsed || !profile || generating) return
    setGenerating(true)
    setError(null)
    setGenerated(null)
    try {
      const [stories, projects] = await Promise.all([listStories(), listProjects()])
      // Answers typed against the fit gaps become first-class story sources for this generation.
      const gapStories = gapFillsToStories(gaps.map((g, i) => ({ requirement: g.title, note: gapNotes[i] ?? '' })))
      if (saveGapsToBank && gapStories.length) {
        await Promise.all(gapStories.map((s) => saveStory({ ...s, id: crypto.randomUUID() })))
      }
      const allStories = [...gapStories, ...stories]
      setSources({ stories: allStories, projects })
      const resume = await generateResume({ profile, stories: allStories, projects, job: job.parsed, fit })
      setGenerated(resume)
      void saveSession({
        id: crypto.randomUUID(),
        kind: 'resume_gen',
        status: 'completed',
        title: `${job.title}${job.company ? ` — ${job.company}` : ''}`,
        level: job.parsed.seniority,
        payload: { resume, jobId: job.id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate — is the backend running, and do you have stories/projects to ground it?')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">2 · Tailor a resume &amp; apply</h3>
          <p className="text-xs text-stone-500">Generate a resume grounded in your own stories + projects, tailored to this JD.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !job.parsed}
            className="rounded-md border border-terracotta-300 bg-white px-4 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate tailored resume'}
          </button>
          <button
            type="button"
            onClick={onApplied}
            disabled={applied}
            className="rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
          >
            {applied ? 'Applied ✓' : 'Mark as applied'}
          </button>
        </div>
      </div>

      {!unlocked && <p className="text-xs text-stone-400">Tip: check fit above first — then tailor the resume to close the gaps it surfaces.</p>}

      {gaps.length > 0 && !generated && (
        <div className="space-y-2">
          <GapFiller
            gaps={gaps}
            notes={gapNotes}
            // Keep each answer's suggestion visible while the candidate edits to address it — the
            // reviews refresh only when they click "Check my answers" again.
            onChange={setGapNotes}
            reviews={gapReviews}
            onCheck={() => void checkAnswers()}
            checking={checking}
            disabled={generating}
          />
          <label className="flex items-center gap-2 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={saveGapsToBank}
              onChange={(e) => setSaveGapsToBank(e.target.checked)}
              disabled={generating}
              className="rounded border-stone-300"
            />
            Also save my answers as draft stories for reuse
          </label>
        </div>
      )}

      {generating && <Pending label="Generating a tailored resume from your stories + projects…" />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {generated && (
        <GeneratedResumeView
          resume={generated}
          job={job.parsed}
          baselineFitScore={baselineFitScore}
          stories={sources.stories}
          projects={sources.projects}
          style={profile?.resumeStyle ?? null}
        />
      )}
    </div>
  )
}
