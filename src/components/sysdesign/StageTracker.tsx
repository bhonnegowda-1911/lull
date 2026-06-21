import { STAGES } from '../../data/sysdesign/stages'

// Vertical stepper showing the interview stages, the current one, and which are done or
// skipped. Time budgets are shown as a gentle pacing cue, not a hard timer. The stage list and
// heading are props (defaulting to the system-design stages) so the Build mode reuses it.

export type StageStatus = 'done' | 'current' | 'skipped' | 'upcoming'

const DOT: Record<StageStatus, string> = {
  done: 'bg-green-500 text-white',
  current: 'bg-indigo-600 text-white',
  skipped: 'bg-slate-300 text-white',
  upcoming: 'bg-white text-slate-400 border border-slate-300',
}

// Minimal stage shape the tracker renders — both Stage and BuildStage satisfy it.
export interface TrackableStage {
  id: string
  label: string
  minutes: number
  goal: string
}

interface StageTrackerProps {
  currentStageId: string
  statusById: Record<string, StageStatus>
  stages?: TrackableStage[]
  heading?: string
}

export default function StageTracker({
  currentStageId,
  statusById,
  stages = STAGES,
  heading = 'Interview stages',
}: StageTrackerProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">{heading}</h3>
      <ol className="mt-3 space-y-1">
        {stages.map((stage, i) => {
          const status: StageStatus =
            statusById[stage.id] || (stage.id === currentStageId ? 'current' : 'upcoming')
          const isCurrent = stage.id === currentStageId
          return (
            <li key={stage.id} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${DOT[status]}`}
              >
                {status === 'done' ? '✓' : status === 'skipped' ? '–' : i + 1}
              </span>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-sm ${isCurrent ? 'font-semibold text-indigo-800' : 'text-slate-700'}`}
                  >
                    {stage.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">~{stage.minutes}m</span>
                </div>
                {isCurrent && <p className="text-xs text-slate-500">{stage.goal}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
