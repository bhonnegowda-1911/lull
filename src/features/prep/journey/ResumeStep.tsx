import { useState } from 'react'
import { listStories } from '../../../lib/storyStore'
import { listProjects } from '../../../lib/projectStore'
import { saveSession } from '../../../lib/sessionStore'
import { generateResume } from '../../../lib/resume/generate'
import GeneratedResumeView from '../GeneratedResumeView'
import Pending from '../../../components/Pending'
import type { Project } from '../../../data/projects'
import type { Profile, Story } from '../../../data/stories'
import type { GeneratedResume, JobDescription } from '../../../types'

// Step 2: generate a JD-tailored resume grounded strictly in the candidate's stories + projects, and
// mark the application as applied. Unlocked once fit has been checked; a weak verdict is a caution,
// not a hard block. Extracted from the old MatchTab.

interface Props {
  job: JobDescription
  profile: Profile | null
  baselineFitScore: number | null
  /** Fit has been checked and isn't a clear mismatch — the natural point to tailor a resume. */
  unlocked: boolean
  applied: boolean
  onApplied: () => void
}

export default function ResumeStep({ job, profile, baselineFitScore, unlocked, applied, onApplied }: Props) {
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedResume | null>(null)
  const [sources, setSources] = useState<{ stories: Story[]; projects: Project[] }>({ stories: [], projects: [] })
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!job.parsed || !profile || generating) return
    setGenerating(true)
    setError(null)
    setGenerated(null)
    try {
      const [stories, projects] = await Promise.all([listStories(), listProjects()])
      setSources({ stories, projects })
      const resume = await generateResume({ profile, stories, projects, job: job.parsed })
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
      {generating && <Pending label="Generating a tailored resume from your stories + projects…" />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {generated && (
        <GeneratedResumeView
          resume={generated}
          job={job.parsed}
          baselineFitScore={baselineFitScore}
          stories={sources.stories}
          projects={sources.projects}
        />
      )}
    </div>
  )
}
