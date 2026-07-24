import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateCustomRoundPrep, hasCustomPrepContext } from '../../lib/customRound/generate'
import { roundInterviewerContext } from '../../lib/application/globalPrepPlan'
import { roundCatalog } from '../../data/rounds'
import Pending from '../../components/Pending'
import type { CustomRoundPrep, InterviewerPersona, InterviewRoundInstance, JobDescription } from '../../types'

// Where a specialized round's practice happens when it's NOT a conversational (behavioral) mock — a
// refactoring round wants the coding editor, an architecture round the system-design canvas, an
// AI-building round the build sandbox. These pages carry their own problems, so they open unseeded.
const PRACTICE_ENV: Record<'coding' | 'sysdesign' | 'build', { route: string; label: string }> = {
  coding: { route: '/practice/coding', label: 'coding editor' },
  sysdesign: { route: '/practice/sysdesign', label: 'system-design canvas' },
  build: { route: '/practice/build', label: 'build sandbox' },
}

// Prep for a round with NO canonical question bank (custom / take-home). Unlike the catalog selectors,
// there's nothing to rank — so this AUTHORS a bespoke brief from the round's own topic, focus areas,
// and interviewer notes (plus the JD). The result is saved back onto the round instance, not the job.

function ListBlock({ label, items }: { label: string; items: string[] }) {
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
  round: InterviewRoundInstance
  /** Persist the generated brief onto this round instance. */
  onSave: (prep: CustomRoundPrep) => Promise<void> | void
}

export default function CustomRoundPlan({ job, round, onSave }: Props) {
  const navigate = useNavigate()
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Freshly generated brief (before saving). Falls back to whatever's already saved on the round.
  const [draft, setDraft] = useState<CustomRoundPrep | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const prep = draft ?? round.customPrep ?? null
  const isDraft = draft !== null
  const hasContext = hasCustomPrepContext(round)
  // A leadership round is interviewed by a CEO / head of engineering — practice it against that
  // persona; any other conversational no-bank round falls back to the hiring-manager lens.
  const persona: InterviewerPersona = round.type === 'leadership' ? 'leader' : 'hiring_manager'
  // Conversational rounds (product/leadership/generic custom) practice each question as a seeded,
  // timed behavioral mock. Technical-exercise rounds (refactoring/AI-build/architecture) instead open
  // their real practice environment, which can't be seeded per-question.
  const mode = roundCatalog(round.type).practiceMode
  const env = mode && mode !== 'behavioral' ? PRACTICE_ENV[mode] : null

  /** Launch a timed behavioral mock seeded on this exact brief question (same page/timer as the
   *  behavioral rounds), grounded in the round's context and the right interviewer persona. */
  function practice(item: CustomRoundPrep['items'][number]) {
    const interviewerContext = roundInterviewerContext(round)
    navigate('/practice/behavioral', {
      state: {
        jobId: job.id,
        persona,
        ...(interviewerContext ? { interviewerContext } : {}),
        startPrompt: {
          text: item.prompt,
          label: `${round.label} question`,
          assesses: item.assesses,
          tip: item.approach,
          trap: item.trap,
        },
      },
    })
  }

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function generate() {
    if (!hasContext || generating) return
    setGenerating(true)
    setError(null)
    setSaved(false)
    try {
      setDraft(await generateCustomRoundPrep(round, job))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate — is the backend running and an LLM key set?')
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setSaved(true)
      setDraft(null)
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
          <h3 className="text-sm font-semibold text-stone-900">Prep for this round</h3>
          <p className="text-xs text-stone-500">
            No canonical bank for this one — a bespoke brief authored from its topic, focus areas, and your notes above.
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
              {saving ? 'Saving…' : 'Save prep'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !hasContext}
            title={hasContext ? 'Author prep grounded in this round’s topic, focus areas, and notes' : 'Add a topic, focus areas, or interviewer notes above first'}
            className="rounded-md border border-terracotta-300 bg-white px-3 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50 disabled:opacity-50"
          >
            {generating ? 'Generating…' : prep ? 'Regenerate' : 'Generate prep'}
          </button>
        </div>
      </div>

      {generating && <Pending label="Authoring prep grounded in this round’s topic, focus areas, and your notes…" />}
      {!hasContext && !prep && (
        <p className="mt-2 text-xs text-amber-600">
          Add a topic, focus areas, or interviewer notes for this round in the loop above to ground the prep.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-600">Saved to this round.</p>}
      {isDraft && <p className="mt-2 text-xs text-stone-500">Draft — save the prep to keep it on this round.</p>}

      {prep && (
        <div className="mt-3 space-y-3">
          {prep.interviewerRead && (
            <p className="rounded-md border border-terracotta-100 bg-terracotta-50/60 px-3 py-2 text-xs text-stone-700">
              <span className="font-semibold text-terracotta-700">Who you’re talking to:</span> {prep.interviewerRead}
            </p>
          )}
          <p className="rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <span className="font-semibold text-stone-700">What this tests:</span> {prep.summary}
          </p>

          {env && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-terracotta-100 bg-terracotta-50/50 px-3 py-2 text-xs text-stone-600">
              <span>Practice this as a timed exercise in the {env.label} — the questions below are what to expect.</span>
              <button
                type="button"
                onClick={() => navigate(env.route, { state: { jobId: job.id } })}
                className="rounded-md bg-terracotta-600 px-3 py-1 text-xs font-medium text-white hover:bg-terracotta-500"
              >
                Open the {env.label} →
              </button>
            </div>
          )}

          <ol className="space-y-2">
            {prep.items.map((item, i) => (
              <li key={i} className="rounded-lg border border-stone-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-stone-400">#{i + 1}</span>
                  <p className="text-sm font-semibold text-stone-800">{item.prompt}</p>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {!env && (
                    <button
                      type="button"
                      onClick={() => practice(item)}
                      className="rounded-md bg-terracotta-600 px-3 py-1 text-xs font-medium text-white hover:bg-terracotta-500"
                    >
                      Practice →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="text-xs font-medium text-terracotta-600 hover:text-terracotta-500"
                  >
                    {expanded.has(i) ? 'Hide how to prep' : 'Show how to prep'}
                  </button>
                </div>
                {expanded.has(i) && (
                  <div className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600">
                    <p><span className="font-semibold text-stone-700">Assesses:</span> {item.assesses}</p>
                    <p><span className="font-semibold text-stone-700">Approach:</span> {item.approach}</p>
                    {item.greatAnswer && <p><span className="font-semibold text-emerald-700">What makes it great:</span> {item.greatAnswer}</p>}
                    <p><span className="font-semibold text-red-600">Trap:</span> {item.trap}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {prep.prepActions.length > 0 && (
            <div className="rounded-lg border border-stone-200 bg-white p-3 text-xs">
              <ListBlock label="Before the round" items={prep.prepActions} />
            </div>
          )}

          <p className="text-[11px] text-stone-400">
            Generated {new Date(prep.generatedAt).toLocaleDateString()} from this round’s context. Regenerate after editing the topic, focus, or notes above.
          </p>
        </div>
      )}
    </div>
  )
}
