import { Layers, Link2 } from 'lucide-react'
import { ROUND_CATALOG, roundCatalog } from '../../../data/rounds'
import { activeSession, newRound, relativeDay, sessionsOf } from '../../../lib/application/schedule'
import { celebrate, celebrateBig } from '../../../lib/ui/celebrate'
import { track } from '../../../lib/metrics/events'
import type { Application, ApplicationStatus, InterviewRoundInstance, RoundType, StageOutcome } from '../../../types'

// Step 3: the configurable interview loop. Add/remove/reorder rounds from the catalog, and per round
// set the date+time, what it's about (topic), focus areas, and outcome. The active round (first not
// passed/failed) drives the phased prep below. Replaces the fixed-4-round ApplicationTracker.

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'not_applied', label: 'Not applied' },
  { value: 'applied', label: 'Applied' },
  { value: 'active', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
]
const STATUS_STYLE: Record<ApplicationStatus, string> = {
  not_applied: 'bg-stone-100 text-stone-600',
  applied: 'bg-sky-100 text-sky-700',
  active: 'bg-terracotta-100 text-terracotta-700',
  offer: 'bg-emerald-100 text-emerald-700',
  accepted: 'bg-emerald-600 text-white',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-stone-200 text-stone-600',
}
const OUTCOME_OPTIONS: { value: StageOutcome; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: "Didn't pass" },
]
const OUTCOME_STYLE: Record<StageOutcome, string> = {
  pending: 'text-stone-400',
  scheduled: 'text-terracotta-600',
  passed: 'text-emerald-600',
  failed: 'text-red-600',
}
const DECIDED: ApplicationStatus[] = ['offer', 'accepted', 'rejected', 'withdrawn']
const selectCls = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm focus:border-terracotta-500 focus:outline-none'
const inputCls = 'w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm focus:border-terracotta-500 focus:outline-none'

interface Props {
  jobId: string
  app: Application
  onChange: (next: Application) => void
}

export default function LoopStep({ jobId, app, onChange }: Props) {
  function setStatus(status: ApplicationStatus) {
    // Funnel signal: log every status change so the pipeline applied→interviewing→offer can be charted.
    track('app_status', { jobId, status })
    onChange({ ...app, status })
  }

  function updateRound(id: string, patch: Partial<InterviewRoundInstance>) {
    const prev = app.rounds.find((r) => r.id === id)
    const rounds = app.rounds.map((r) => {
      if (r.id !== id) return r
      const merged = { ...r, ...patch }
      // Setting a date on an untouched round implies it's now scheduled; clearing it reverts.
      if (patch.scheduledAt && r.outcome === 'pending') merged.outcome = 'scheduled'
      if (patch.scheduledAt === null && merged.outcome === 'scheduled') merged.outcome = 'pending'
      return merged
    })
    // Ground-truth outcome: capture the first time a round becomes terminal (passed/failed), with the
    // predicted fit at that moment — this {prediction, outcome} pair is what powers calibration.
    const becameTerminal = (patch.outcome === 'passed' || patch.outcome === 'failed') && prev?.outcome !== patch.outcome
    if (becameTerminal && prev) {
      track('round_resolved', {
        jobId,
        roundId: prev.id,
        roundType: prev.type,
        practiceMode: roundCatalog(prev.type).practiceMode,
        outcome: patch.outcome as 'passed' | 'failed',
        roundDate: prev.scheduledAt,
        fitScore: app.fit?.score ?? null,
        fitVerdict: app.fit?.verdict ?? null,
      })
    }
    // Celebrate the win the moment a round flips to passed — and go big when it's the last one (loop cleared).
    if (patch.outcome === 'passed' && prev?.outcome !== 'passed') {
      const allPassed = rounds.every((r) => r.outcome === 'passed')
      if (allPassed) celebrateBig()
      else celebrate()
    }
    onChange({ ...app, rounds })
  }

  function removeRound(id: string) {
    onChange({ ...app, rounds: app.rounds.filter((r) => r.id !== id) })
  }

  function move(id: string, dir: -1 | 1) {
    const i = app.rounds.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= app.rounds.length) return
    const rounds = [...app.rounds]
    ;[rounds[i], rounds[j]] = [rounds[j], rounds[i]]
    onChange({ ...app, rounds })
  }

  function addRound(type: RoundType) {
    onChange({ ...app, rounds: [...app.rounds, newRound(type)] })
  }

  const sessions = sessionsOf(app)
  const activeId = activeSession(app)?.id ?? null
  const indexOf = new Map(app.rounds.map((r, i) => [r.id, i]))

  // One round row. `sessionActive` is true for every round in the active session, so a bundled onsite
  // highlights all its interviews together.
  function roundRow(r: InterviewRoundInstance, sessionActive: boolean) {
    const i = indexOf.get(r.id) ?? 0
    return (
      <div
        key={r.id}
        className={`rounded-lg border bg-white p-3 ${sessionActive ? 'border-terracotta-300 ring-1 ring-terracotta-200' : 'border-stone-200'}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-stone-400">#{i + 1}</span>
          <input
            defaultValue={r.label}
            onBlur={(e) => { if (e.target.value !== r.label) updateRound(r.id, { label: e.target.value }) }}
            className="flex-1 min-w-[140px] rounded-md border border-transparent px-1 py-0.5 text-sm font-semibold text-stone-800 hover:border-stone-200 focus:border-terracotta-500 focus:outline-none"
          />
          {sessionActive && <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-[10px] font-medium text-terracotta-700">Active — prep below</span>}
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">{roundCatalog(r.type).label}</span>
          <div className="ml-auto flex items-center gap-1">
            {/* Group this round into the session above (an onsite bundles several). Hidden for the first round. */}
            {i > 0 && (
              <button
                type="button"
                onClick={() => updateRound(r.id, { groupedWithPrev: !r.groupedWithPrev })}
                className={`flex items-center gap-0.5 rounded px-1.5 text-[11px] ${r.groupedWithPrev ? 'text-terracotta-600 hover:text-terracotta-700' : 'text-stone-400 hover:text-stone-700'}`}
                title={r.groupedWithPrev ? 'Split into its own session' : 'Group into the session above'}
              >
                <Link2 size={12} aria-hidden /> {r.groupedWithPrev ? 'Grouped' : 'Group'}
              </button>
            )}
            <button type="button" onClick={() => move(r.id, -1)} disabled={i === 0} className="rounded px-1.5 text-stone-400 hover:text-stone-700 disabled:opacity-30" title="Move up">↑</button>
            <button type="button" onClick={() => move(r.id, 1)} disabled={i === app.rounds.length - 1} className="rounded px-1.5 text-stone-400 hover:text-stone-700 disabled:opacity-30" title="Move down">↓</button>
            <button type="button" onClick={() => removeRound(r.id)} className="rounded px-1.5 text-stone-400 hover:text-red-600" title="Remove round">✕</button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-stone-500">
            <span>Date</span>
            <input type="date" value={r.scheduledAt ?? ''} onChange={(e) => updateRound(r.id, { scheduledAt: e.target.value || null })} className={selectCls} />
          </label>
          <label className="flex items-center gap-1 text-xs text-stone-500">
            <span>Time</span>
            <input type="time" value={r.scheduledTime ?? ''} onChange={(e) => updateRound(r.id, { scheduledTime: e.target.value || null })} className={selectCls} />
          </label>
          {r.scheduledAt && <span className="text-xs text-stone-400">{relativeDay(r.scheduledAt)}</span>}
          <select className={`${selectCls} ${OUTCOME_STYLE[r.outcome]} font-medium ml-auto`} value={r.outcome} onChange={(e) => updateRound(r.id, { outcome: e.target.value as StageOutcome })}>
            {OUTCOME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            defaultValue={r.topic ?? ''}
            onBlur={(e) => { if (e.target.value !== (r.topic ?? '')) updateRound(r.id, { topic: e.target.value }) }}
            placeholder="What's this round about? e.g. API design + on-call"
            className={inputCls}
          />
          <input
            defaultValue={(r.focusAreas ?? []).join(', ')}
            onBlur={(e) => {
              const next = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
              if (next.join(', ') !== (r.focusAreas ?? []).join(', ')) updateRound(r.id, { focusAreas: next })
            }}
            placeholder="Focus areas (comma-separated) e.g. caching, idempotency"
            className={inputCls}
          />
        </div>

        {/* First-hand intel about THIS interviewer — biases question selection and the practice
            follow-ups toward what they actually focus on. */}
        <textarea
          defaultValue={r.notes ?? ''}
          onBlur={(e) => { if (e.target.value !== (r.notes ?? '')) updateRound(r.id, { notes: e.target.value }) }}
          placeholder="Interviewer notes — who they are & what they focus on, e.g. 'recruiter, digs into career story + what I enjoy; asked about the team's top 2 challenges'"
          rows={2}
          className={`${inputCls} mt-2 w-full`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">3 · Interview loop</h3>
          <p className="text-xs text-stone-500">Build this company's loop. Group interviews that happen together (e.g. an onsite) into one session; passing every interview in the active session unlocks the next.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[app.status]}`}>
            {STATUS_OPTIONS.find((o) => o.value === app.status)?.label}
          </span>
          <select className={selectCls} value={app.status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <ol className="space-y-2">
        {sessions.map((s) => {
          const isMulti = s.rounds.length > 1
          const sessionActive = s.id === activeId
          const rows = s.rounds.map((r) => roundRow(r, sessionActive))
          if (!isMulti) return <li key={s.id}>{rows[0]}</li>
          return (
            <li key={s.id} className={`rounded-xl border bg-stone-50/60 p-2 ${sessionActive ? 'border-terracotta-300 ring-1 ring-terracotta-200' : 'border-stone-300'}`}>
              <div className="flex items-center gap-2 px-1 pb-2 pt-1">
                <Layers size={13} className="text-stone-400" aria-hidden />
                <span className="text-xs font-semibold text-stone-600">Interview session · {s.rounds.length} interviews</span>
                <span className="text-[10px] text-stone-400">— prepped together; passing all of them unlocks the next phase</span>
              </div>
              <div className="space-y-2">{rows}</div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500">Add round:</span>
        {ROUND_CATALOG.map((c) => (
          <button
            key={c.type}
            type="button"
            onClick={() => addRound(c.type)}
            title={c.blurb}
            className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-600 hover:border-terracotta-300 hover:text-terracotta-700"
          >
            + {c.label}
          </button>
        ))}
      </div>

      {DECIDED.includes(app.status) && (
        <textarea
          defaultValue={app.decisionNote}
          onBlur={(e) => { if (e.target.value !== app.decisionNote) onChange({ ...app, decisionNote: e.target.value }) }}
          placeholder="Decision notes — offer details, feedback, what to learn for next time…"
          rows={2}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-terracotta-500 focus:outline-none"
        />
      )}
    </div>
  )
}
