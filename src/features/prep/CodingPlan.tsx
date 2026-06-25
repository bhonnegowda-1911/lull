import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { selectCodingProblems } from '../../lib/coding/generate'
import { getProblem } from '../../data/coding/problems'
import { saveJob } from '../../lib/jobStore'
import Pending from '../../components/Pending'
import type { JobDescription, CodingPick } from '../../types'

// The JD → technical-screen (coding/DSA) round. From a selected target job, rank the canonical coding
// problems this role is most likely to ask (a pattern → known-problem match). Each pick resolves to a
// curated library problem you then practice on the Coding tab — same staged grading. Mirrors
// InterviewPlan (the system-design analog).

const CONFIDENCE_STYLE: Record<CodingPick['confidence'], string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-stone-100 text-stone-500',
}

function HintList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-stone-600">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}

interface Props {
  job: JobDescription
  /** Refresh the parent's job list after picks are saved onto the job. */
  onSaved?: () => void
}

export default function CodingPlan({ job, onSaved }: Props) {
  const navigate = useNavigate()
  const [selecting, setSelecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [draft, setDraft] = useState<CodingPick[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const picks = draft ?? job.codingPicks
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
      setDraft(await selectCodingProblems(job))
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
      const ok = await saveJob({ ...job, codingPicks: draft })
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
          <h3 className="text-sm font-semibold text-stone-900">Technical screen (coding)</h3>
          <p className="text-xs text-stone-500">
            Canonical DSA problems this role is likely to ask — matched to the role's patterns, ranked by likelihood.
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
            title={job.parsed ? 'Rank the coding problems this role is likely to ask' : 'Parse the job first on the Jobs tab'}
            className="rounded-md border border-terracotta-300 bg-white px-3 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
          >
            {selecting ? 'Selecting…' : picks.length ? 'Re-select' : 'Predict problems'}
          </button>
        </div>
      </div>

      {selecting && <Pending label="Predicting the coding problems this role is likely to ask…" />}
      {!job.parsed && <p className="mt-2 text-xs text-amber-600">Parse this job on the Jobs tab first.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-600">Saved — practice these on the Coding tab.</p>}
      {isDraft && <p className="mt-2 text-xs text-stone-500">Draft — save the plan to keep it on this job.</p>}

      {picks.length > 0 && (
        <ol className="mt-3 space-y-2">
          {picks.map((pick, rank) => {
            const problem = getProblem(pick.problemId)
            return (
              <li key={pick.problemId} className="rounded-lg border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-stone-400">#{rank + 1}</span>
                  <span className="text-sm font-semibold text-stone-800">{problem.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CONFIDENCE_STYLE[pick.confidence]}`}>{pick.confidence} likelihood</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">{problem.difficulty}</span>
                </div>
                <p className="mt-1.5 text-xs text-stone-500">
                  <span className="font-semibold text-stone-600">Why they’d ask:</span> {pick.rationale}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/practice/coding', { state: { startProblemId: pick.problemId } })}
                    className="rounded-md bg-terracotta-600 px-3 py-1 text-xs font-medium text-white hover:bg-terracotta-500"
                  >
                    Practice →
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(pick.problemId)}
                    className="text-xs font-medium text-terracotta-600 hover:text-terracotta-500"
                  >
                    {expanded.has(pick.problemId) ? 'Hide problem + grading hints' : 'Show problem + grading hints'}
                  </button>
                </div>
                {expanded.has(pick.problemId) && (
                  <div className="mt-2 border-t border-stone-100 pt-2 text-xs">
                    <p className="text-stone-600">{problem.statement}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <HintList label="Topics" items={problem.topics} />
                      <HintList label="Clarify" items={problem.hints.clarifications} />
                      <HintList label="Optimal" items={[problem.hints.optimal, problem.hints.optimalComplexity]} />
                      <HintList label="Edge cases" items={problem.hints.edgeCases} />
                      <HintList label="Traps" items={problem.hints.traps} />
                    </div>
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
