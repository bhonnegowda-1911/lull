import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { selectBehavioralQuestions } from '../../lib/behavioral/select'
import { getPrompt } from '../../data/prompts'
import { saveJob } from '../../lib/jobStore'
import Pending from '../../components/Pending'
import type { JobDescription, BehavioralPick } from '../../types'

// The JD → behavioral / managerial round. From a selected target job, rank the curated bank questions
// this company is most likely to ask, each mapped to a stated company value. Picks resolve to real
// bank questions you then practice on the Behavioral tab — same question-agnostic STAR grading.

const CONFIDENCE_STYLE: Record<BehavioralPick['confidence'], string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-stone-100 text-stone-500',
}

interface Props {
  job: JobDescription
  /** Refresh the parent's job list after picks are saved onto the job. */
  onSaved?: () => void
  /** The round's notes — first-hand intel about this interviewer, used to bias selection + practice. */
  interviewerContext?: string
}

export default function BehavioralPlan({ job, onSaved, interviewerContext }: Props) {
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Freshly selected picks (before saving). Falls back to whatever's already saved on the job.
  const [draft, setDraft] = useState<BehavioralPick[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const picks = draft ?? job.behavioralPicks
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
      setDraft(await selectBehavioralQuestions(job, { interviewerContext }))
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
      const ok = await saveJob({ ...job, behavioralPicks: draft })
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
          <h3 className="text-sm font-semibold text-stone-900">Behavioral / managerial round</h3>
          <p className="text-xs text-stone-500">
            Questions this company is likely to ask — matched to the values it states, ranked by likelihood.
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
            title={job.parsed ? 'Rank the behavioral questions this company is likely to ask' : 'Parse the job first on the Jobs tab'}
            className="rounded-md border border-terracotta-300 bg-white px-3 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
          >
            {selecting ? 'Selecting…' : picks.length ? 'Re-select' : 'Predict questions'}
          </button>
        </div>
      </div>

      {selecting && <Pending label="Predicting the behavioral questions this company is likely to ask…" />}
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
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">{prompt.category}</span>
                </div>
                <p className="mt-1.5 text-sm text-stone-600">{prompt.text}</p>
                <p className="mt-1.5 text-xs text-stone-500">
                  <span className="font-semibold text-stone-600">Why they’d ask:</span> {pick.rationale}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/practice/behavioral', { state: { startPromptId: pick.promptId, jobId: job.id, persona: 'hiring_manager', interviewerContext } })}
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
