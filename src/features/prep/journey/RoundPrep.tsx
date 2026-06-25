import { roundCatalog } from '../../../data/rounds'
import { relativeDay } from '../../../lib/application/schedule'
import type { RoundSession } from '../../../lib/application/schedule'
import RecruiterPlan from '../RecruiterPlan'
import BehavioralPlan from '../BehavioralPlan'
import InterviewPlan from '../InterviewPlan'
import CodingPlan from '../CodingPlan'
import CustomRoundPlan from '../CustomRoundPlan'
import type { CustomRoundPrep, InterviewRoundInstance, JobDescription } from '../../../types'

// Step 4: prep for the ACTIVE session (unlock-on-pass, per session). A session can bundle several
// interviews that happen together (e.g. an onsite's coding + system design + managerial) — they all
// unlock and are prepped together here. For each interview we predict its likely items via the
// catalog-selected source and ground them in its topic/focus areas. The day-by-day schedule itself
// lives in the single, cross-application Prep plan on the home page.

/** One interview's prediction block: its meta + the catalog-sourced predicted-items selector. */
function RoundBlock({ job, round, onRefreshJob, onSaveCustomPrep }: { job: JobDescription; round: InterviewRoundInstance; onRefreshJob: () => void; onSaveCustomPrep: (roundId: string, prep: CustomRoundPrep) => Promise<void> | void }) {
  const picks = roundCatalog(round.type).picks
  const focusAreas = (round.focusAreas ?? []).filter((a) => a.trim())
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-stone-800">{round.label}</h4>
        <p className="text-xs text-stone-500">
          {round.scheduledAt
            ? <>On {round.scheduledAt} ({relativeDay(round.scheduledAt)}){round.scheduledTime ? ` at ${round.scheduledTime}` : ''}.</>
            : <>Set a date for this interview in the loop above so it joins your prep plan.</>}
        </p>
        {(round.topic || focusAreas.length > 0) && (
          <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {round.topic && <p><span className="font-semibold text-stone-700">About:</span> {round.topic}</p>}
            {focusAreas.length > 0 && <p className="mt-0.5"><span className="font-semibold text-stone-700">Focus:</span> {focusAreas.join(' · ')}</p>}
          </div>
        )}
      </div>

      {/* Predicted items for this interview, sourced per the catalog. */}
      {picks === 'recruiter' && <RecruiterPlan job={job} onSaved={onRefreshJob} interviewerContext={round.notes} />}
      {picks === 'behavioral' && <BehavioralPlan job={job} onSaved={onRefreshJob} interviewerContext={round.notes} />}
      {picks === 'coding' && <CodingPlan job={job} onSaved={onRefreshJob} />}
      {picks === 'problem' && <InterviewPlan job={job} onSaved={onRefreshJob} />}
      {picks === 'mixed' && (
        <>
          <BehavioralPlan job={job} onSaved={onRefreshJob} interviewerContext={round.notes} />
          <InterviewPlan job={job} onSaved={onRefreshJob} />
        </>
      )}
      {picks === null && (
        <CustomRoundPlan job={job} round={round} onSave={(prep) => onSaveCustomPrep(round.id, prep)} />
      )}
      {picks === 'project' && (
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 text-xs text-stone-500 shadow-sm">
          This interview has no canonical question bank — prep is grounded in the
          <span className="font-medium text-stone-700"> topic and focus areas</span> set above, and you
          should rehearse it against your captured projects in Library → Projects.
        </div>
      )}
    </div>
  )
}

interface Props {
  job: JobDescription
  /** The active session's still-undecided interviews — all prepped together. */
  rounds: InterviewRoundInstance[]
  /** The session immediately after the active one, shown locked until the active session is passed. */
  nextSession: RoundSession | null
  /** Reload the job after a plan component saves picks onto it. */
  onRefreshJob: () => void
  /** Persist an authored brief onto one round instance (custom / take-home rounds). */
  onSaveCustomPrep: (roundId: string, prep: CustomRoundPrep) => Promise<void> | void
}

export default function RoundPrep({ job, rounds, nextSession, onRefreshJob, onSaveCustomPrep }: Props) {
  if (rounds.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 text-sm text-stone-500 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-900">4 · Prep</h3>
        <p className="mt-1">No active interviews to prep right now. 🎉</p>
      </div>
    )
  }

  const isSession = rounds.length > 1
  const next = nextSession?.rounds ?? []

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">
          4 · Prep for: {isSession ? `this session (${rounds.length} interviews)` : rounds[0].label}
        </h3>
        {isSession && (
          <p className="text-xs text-stone-500">These interviews happen together — prep them as one session: {rounds.map((r) => r.label).join(' · ')}.</p>
        )}
      </div>

      {rounds.map((r) => (
        <div key={r.id} className={isSession ? 'rounded-xl border border-stone-200/80 bg-white/60 p-3 shadow-sm' : ''}>
          <RoundBlock job={job} round={r} onRefreshJob={onRefreshJob} onSaveCustomPrep={onSaveCustomPrep} />
        </div>
      ))}

      {/* The day-by-day schedule now lives in the unified, cross-application plan. */}
      <div className="rounded-lg border border-stone-200/80 bg-stone-50/60 p-3 text-xs text-stone-500">
        Your day-by-day run-up is built across all your interviews at once — find it in the
        <span className="font-medium text-stone-700"> Prep plan</span> on the
        {' '}<a href="/" className="font-medium text-terracotta-600 hover:text-terracotta-500">pipeline home</a>.
        {' '}Set each interview’s date above so it’s included, and regenerate there after changes.
      </div>

      {/* Locked peek at the next phase. */}
      {next.length > 0 && (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/60 p-3 text-xs text-stone-500">
          <span className="font-medium text-stone-600">Next phase (locked):</span>{' '}
          {next[0].label}{next.length > 1 ? ` +${next.length - 1} more` : ''}
          {next[0].scheduledAt ? ` — ${next[0].scheduledAt}` : ''}. Unlocks when you pass the current session.
        </div>
      )}
    </div>
  )
}
