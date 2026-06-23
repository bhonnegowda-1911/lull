import { useEffect, useState } from 'react'
import { listJobs } from '../../lib/jobStore'
import { getProfile } from '../../lib/profileStore'
import { listStories } from '../../lib/storyStore'
import { listProjects } from '../../lib/projectStore'
import { saveSession } from '../../lib/sessionStore'
import { analyzeResumeFit } from '../../lib/resume/fit'
import { generateResume } from '../../lib/resume/generate'
import GeneratedResumeView from './GeneratedResumeView'
import InterviewPlan from './InterviewPlan'
import BehavioralPlan from './BehavioralPlan'
import RecruiterPlan from './RecruiterPlan'
import Pending from '../../components/Pending'
import type { Project } from '../../data/projects'
import type { Profile } from '../../data/stories'
import type { Story } from '../../data/stories'
import type { GeneratedResume, JobDescription, ResumeFit } from '../../types'

// The Match tab: the resume↔job loop on one screen. Pick a stored job, score your current resume
// against it, and read the fit score + structured gaps. (Generating a tailored resume from the gaps
// is Phase 2 — the button is a placeholder.)

const VERDICT_STYLE: Record<ResumeFit['verdict'], string> = {
  strong: 'bg-emerald-100 text-emerald-700',
  plausible: 'bg-terracotta-100 text-terracotta-700',
  stretch: 'bg-amber-100 text-amber-700',
  mismatch: 'bg-red-100 text-red-700',
}
const STATUS_STYLE: Record<string, string> = {
  covered: 'text-emerald-600',
  partial: 'text-amber-600',
  missing: 'text-red-600',
}
const FIX_LABEL: Record<string, string> = {
  reword: 'Reword resume',
  add_story: 'Add a story',
  genuine_gap: 'Real gap',
}

export default function MatchTab() {
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [fit, setFit] = useState<ResumeFit | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Phase 2 — JD-targeted generation grounded in the story bank + projects.
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedResume | null>(null)
  const [genSources, setGenSources] = useState<{ stories: Story[]; projects: Project[] }>({ stories: [], projects: [] })

  useEffect(() => {
    void (async () => {
      const [js, p] = await Promise.all([listJobs(), getProfile()])
      setJobs(js)
      setProfile(p)
      if (js.length) setSelectedId(js[0].id)
      setLoading(false)
    })()
  }, [])

  const selected = jobs.find((j) => j.id === selectedId) ?? null
  const resumeText = profile?.resumeText ?? ''

  // Re-list jobs after InterviewPlan saves drafted problems onto the selected job, keeping selection.
  async function refreshJobs() {
    setJobs(await listJobs())
  }

  function reset() {
    setFit(null)
    setGenerated(null)
    setError(null)
  }

  async function analyze() {
    if (!selected?.parsed || analyzing) return
    setAnalyzing(true)
    setError(null)
    setFit(null)
    try {
      const stories = await listStories()
      const result = await analyzeResumeFit({ resumeText, job: selected.parsed, stories })
      setFit(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze fit — is the backend running and an LLM key set?')
    } finally {
      setAnalyzing(false)
    }
  }

  async function generate() {
    if (!selected?.parsed || !profile || generating) return
    setGenerating(true)
    setError(null)
    setGenerated(null)
    try {
      const [stories, projects] = await Promise.all([listStories(), listProjects()])
      setGenSources({ stories, projects })
      const resume = await generateResume({ profile, stories, projects, job: selected.parsed })
      setGenerated(resume)
      // Persist the draft as an append-only rep so versions can be compared later.
      void saveSession({
        id: crypto.randomUUID(),
        kind: 'resume_gen',
        status: 'completed',
        title: `${selected.title}${selected.company ? ` — ${selected.company}` : ''}`,
        level: selected.parsed.seniority,
        payload: { resume, jobId: selected.id },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate — is the backend running, and do you have stories/projects to ground it?')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>

  if (!jobs.length) {
    return <p className="text-sm text-stone-500">No job descriptions yet. Add one on the Jobs tab first.</p>
  }

  const noResume = resumeText.trim().length === 0
  const selectCls = 'rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-terracotta-500 focus:outline-none'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={selectedId} onChange={(e) => { setSelectedId(e.target.value); reset() }}>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}{j.company ? ` — ${j.company}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={analyzing || !selected?.parsed || noResume}
          className="rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          {analyzing ? 'Analyzing…' : 'Analyze fit'}
        </button>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating || !selected?.parsed}
          title="Generate a resume grounded in your stories + projects, tailored to this job"
          className="rounded-md border border-terracotta-300 bg-white px-4 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate tailored resume'}
        </button>
      </div>

      {noResume && (
        <p className="text-xs text-amber-600">Add your resume on the Resume tab — fit is scored against it.</p>
      )}
      {analyzing && <Pending label="Scoring your resume against this job…" />}
      {generating && <Pending label="Generating a tailored resume from your stories + projects…" />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {fit && (
        <div className="space-y-4">
          {/* Score + verdict */}
          <div className="flex items-center gap-4 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xl font-bold text-white">
              {fit.fitScore}
            </div>
            <div className="min-w-0">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${VERDICT_STYLE[fit.verdict]}`}>
                {fit.verdict}
              </span>
              <p className="mt-1 text-sm text-stone-600">{fit.summary}</p>
            </div>
          </div>

          {/* Seniority + quantified impact */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Seniority</p>
              <p className="mt-1 text-stone-700">
                JD: <span className="capitalize">{fit.seniorityMatch.jdLevel}</span> · Resume reads:{' '}
                <span className="capitalize">{fit.seniorityMatch.resumeImpliedLevel}</span>{' '}
                <span className={`font-medium ${fit.seniorityMatch.assessment === 'under' ? 'text-red-600' : fit.seniorityMatch.assessment === 'over' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ({fit.seniorityMatch.assessment})
                </span>
              </p>
              <p className="mt-1 text-xs text-stone-500">{fit.seniorityMatch.note}</p>
            </div>
            <div className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Quantified impact</p>
              <p className="mt-1 text-stone-700">{fit.quantifiedImpact.score}/5</p>
              <p className="mt-1 text-xs text-stone-500">{fit.quantifiedImpact.note}</p>
            </div>
          </div>

          {/* Requirement coverage */}
          <div className="rounded-lg border border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Requirement coverage</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {fit.requirementCoverage.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 text-xs font-semibold uppercase ${STATUS_STYLE[r.status] ?? 'text-stone-500'}`}>{r.status}</span>
                  <span className="text-stone-700">
                    {r.requirement}
                    {r.evidence && <span className="text-stone-400"> — {r.evidence}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Keyword coverage */}
          <div className="rounded-lg border border-stone-200 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">ATS keywords · {fit.keywordCoverage.coveragePct}%</p>
            {fit.keywordCoverage.missing.length > 0 ? (
              <p className="mt-1 text-stone-600">
                <span className="text-red-600">Missing:</span> {fit.keywordCoverage.missing.join(', ')}
              </p>
            ) : (
              <p className="mt-1 text-emerald-600">All key terms covered.</p>
            )}
          </div>

          {/* Gaps */}
          {fit.gaps.length > 0 && (
            <div className="rounded-lg border border-stone-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Gaps</p>
              <ul className="mt-2 space-y-2 text-sm">
                {fit.gaps.map((g, i) => (
                  <li key={i} className="rounded-md bg-stone-50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-800">{g.title}</span>
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">{FIX_LABEL[g.fixable] ?? g.fixable}</span>
                      <span className={`text-[10px] font-semibold uppercase ${g.severity === 'high' ? 'text-red-600' : g.severity === 'medium' ? 'text-amber-600' : 'text-stone-400'}`}>{g.severity}</span>
                    </div>
                    <p className="mt-0.5 text-stone-600">{g.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Strengths */}
          {fit.strengths.length > 0 && (
            <div className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Strengths</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
                {fit.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

        </div>
      )}

      {generated && (
        <GeneratedResumeView
          resume={generated}
          job={selected?.parsed ?? null}
          baselineFitScore={fit?.fitScore ?? null}
          stories={genSources.stories}
          projects={genSources.projects}
        />
      )}

      {/* The interview loop in the order a company runs it: recruiter screen → behavioral → system design. */}
      {selected && <RecruiterPlan key={`rec-${selected.id}`} job={selected} onSaved={() => void refreshJobs()} />}
      {selected && <BehavioralPlan key={`bx-${selected.id}`} job={selected} onSaved={() => void refreshJobs()} />}
      {selected && <InterviewPlan key={`sd-${selected.id}`} job={selected} onSaved={() => void refreshJobs()} />}
    </div>
  )
}
