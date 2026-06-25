import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { selectRecruiterQuestions } from '../../lib/recruiter/select'
import { getPrompt } from '../../data/prompts'
import { saveJob } from '../../lib/jobStore'
import Pending from '../../components/Pending'
import type { JobDescription, RecruiterPick } from '../../types'

// The JD → recruiter-screen round. From a selected target job, rank the curated recruiter-screen
// questions (motivation, logistics, high-level fit) this company is most likely to ask. Picks resolve
// to real bank questions you then practice on the Behavioral tab — recruiter screens are verbal Q&A,
// so they reuse the same record → grade flow.

const CONFIDENCE_STYLE: Record<RecruiterPick['confidence'], string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-stone-100 text-stone-500',
}

interface Props {
  job: JobDescription
  /** Refresh the parent's job list after picks are saved onto the job. */
  onSaved?: () => void
  /** The round's notes — first-hand intel about this recruiter, used to bias selection + practice. */
  interviewerContext?: string
}

export default function RecruiterPlan({ job, onSaved, interviewerContext }: Props) {
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Freshly selected picks (before saving). Falls back to whatever's already saved on the job.
  const [draft, setDraft] = useState<RecruiterPick[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const picks = draft ?? job.recruiterPicks
  const isDraft = draft !== null

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function select() {
    if (!job.parsed || selecting) return
    setSelecting(true)
    setError(null)
    setSaved(false)
    try {
      setDraft(await selectRecruiterQuestions(job, { interviewerContext }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not select — is the backend running and an LLM key set?')
    } finally {
      setSelecting(false)
    }
  }

  async function save() {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      const ok = await saveJob({ ...job, recruiterPicks: draft })
      if (!ok) throw new Error('Save failed — is the backend running?')
      setSaved(true)
      setDraft(null)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Recruiter screen</h3>
          <p className="text-xs text-stone-500">
            The first call — motivation, logistics, and high-level fit. Ranked by what this screen will focus on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save plan'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void select()}
            disabled={selecting || !job.parsed}
            title={job.parsed ? 'Rank the recruiter-screen questions this company is likely to ask' : 'Parse the job first on the Jobs tab'}
            className="rounded-md border border-terracotta-300 bg-white px-3 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
          >
            {selecting ? 'Selecting…' : picks.length ? 'Re-select' : 'Predict questions'}
          </button>
        </div>
      </div>

      {selecting && <Pending label="Predicting the recruiter-screen questions this company is likely to ask…" />}
      {!job.parsed && <p className="mt-2 text-xs text-amber-600">Parse this job on the Jobs tab first.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-600">Saved — practice these on the Behavioral tab.</p>}
      {isDraft && <p className="mt-2 text-xs text-stone-500">Draft — save the plan to keep it on this job.</p>}

      {picks.length > 0 && (
        <ol className="mt-3 space-y-2">
          {picks.map((pick, rank) => {
            const prompt = getPrompt(pick.promptId)
            return (
              <li key={pick.promptId} className="rounded-lg border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-stone-400">#{rank + 1}</span>
                  <span className="text-sm font-semibold text-stone-800">{prompt.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CONFIDENCE_STYLE[pick.confidence]}`}>{pick.confidence} likelihood</span>
                </div>
                <p className="mt-1.5 text-sm text-stone-600">{prompt.text}</p>
                <p className="mt-1.5 text-xs text-stone-500">
                  <span className="font-semibold text-stone-600">Why they’d ask:</span> {pick.rationale}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/practice/behavioral', { state: { startPromptId: pick.promptId, jobId: job.id, persona: 'recruiter', interviewerContext } })}
                    className="rounded-md bg-terracotta-600 px-3 py-1 text-xs font-medium text-white hover:bg-terracotta-500"
                  >
                    Practice →
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(pick.promptId)}
                    className="text-xs font-medium text-terracotta-600 hover:text-terracotta-500"
                  >
                    {expanded.has(pick.promptId) ? 'Hide prep guidance' : 'Show prep guidance'}
                  </button>
                </div>
                {expanded.has(pick.promptId) && (
                  <div className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600">
                    <p><span className="font-semibold text-stone-700">Assesses:</span> {prompt.assesses}</p>
                    <p><span className="font-semibold text-stone-700">Tip:</span> {prompt.tip}</p>
                    <p><span className="font-semibold text-red-600">Trap:</span> {prompt.trap}</p>
                    <p><span className="font-semibold text-amber-600">Leave out:</span> {prompt.avoid}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
