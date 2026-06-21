import { LEVELS, LEVEL_LABEL, getStage, type SysDesignLevel } from '../../data/sysdesign/stages'
import type { SysDesignReport as SysDesignReportData } from '../../lib/sysdesign/report'

// Final leveling report for a completed system-design session. Mirrors the behavioral
// app's level-signal card: an overall level on a ladder, per-stage ratings, how to reach
// the next level, and ranked priorities.

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-red-200 bg-red-50',
  medium: 'border-amber-200 bg-amber-50',
  low: 'border-slate-200 bg-slate-50',
}
const SEVERITY_DOT: Record<string, string> = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-slate-400' }

function ratingColor(r: number): string {
  return r >= 4 ? 'text-green-700 bg-green-100' : r >= 3 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
}

function LevelLadder({ level }: { level: SysDesignLevel }) {
  const idx = LEVELS.indexOf(level)
  return (
    <div className="mt-3 flex gap-1">
      {LEVELS.map((l, i) => (
        <div key={l} className="flex-1 text-center">
          <div className={`h-1.5 rounded-full ${i <= idx ? 'bg-indigo-500' : 'bg-indigo-200'}`} />
          <div className={`mt-1 text-[10px] ${i === idx ? 'font-semibold text-indigo-800' : 'text-indigo-400'}`}>
            {LEVEL_LABEL[l]}
          </div>
        </div>
      ))}
    </div>
  )
}

interface SysDesignReportProps {
  report: SysDesignReportData | null
  onRestart: () => void
  /** Resolve a stage id to its display label. Defaults to the system-design stages; the Build
   *  mode passes its own so this renderer is shared across both leveling reports. */
  stageLabel?: (id: string) => string
}

export default function SysDesignReport({
  report,
  onRestart,
  stageLabel = (id) => getStage(id).label,
}: SysDesignReportProps) {
  if (!report) return null
  const { overall, perStage = [], toReachHigher = [], topPriorities = [], referenceSolution } = report

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-indigo-900">Level signal</h3>
          <span className="rounded-full bg-indigo-600 px-3 py-0.5 text-sm font-semibold text-white">
            {LEVEL_LABEL[overall.level] || overall.level}
          </span>
        </div>
        <LevelLadder level={overall.level} />
        {overall.rationale && <p className="mt-3 text-sm text-indigo-900/90">{overall.rationale}</p>}
        {overall.signals?.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-indigo-900/80">
            {overall.signals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}

        {toReachHigher.length > 0 && (
          <div className="mt-4 border-t border-indigo-200 pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              How to level up
            </div>
            <div className="mt-2 space-y-3">
              {toReachHigher.map((t, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {LEVEL_LABEL[t.level] || t.level}
                    </span>
                    <span className="text-xs text-indigo-700">to perform at this level:</span>
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-indigo-900/85">
                    {(t.guidance || []).map((g, j) => (
                      <li key={j}>{g}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-indigo-500">
          The level this performance demonstrates — scope, prioritization, and tradeoff
          reasoning — not a verdict on you.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">Stage by stage</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {perStage.map((s) => (
            <div key={s.stageId} className="py-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ratingColor(s.rating)}`}>
                  {s.rating}/5
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {stageLabel(s.stageId)}
                </span>
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                  {LEVEL_LABEL[s.level] || s.level}
                </span>
              </div>
              {s.summary && <p className="mt-1 text-sm text-slate-600">{s.summary}</p>}
              {s.gaps?.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
                  {s.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {topPriorities.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">Top priorities</h3>
          <ul className="mt-3 space-y-2">
            {topPriorities.map((n, i) => (
              <li key={i} className={`rounded-lg border p-3 ${SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.low}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[n.severity] || SEVERITY_DOT.low}`} />
                  <span className="text-sm font-medium text-slate-800">{n.title}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-400">{n.severity}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{n.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {referenceSolution && (
        <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Model answer — what a strong solution covers
          </summary>
          {referenceSolution.crux && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-semibold">The crux: </span>
              {referenceSolution.crux}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {(referenceSolution.perStage || []).map((s) => (
              <div key={s.stageId}>
                <div className="text-sm font-medium text-slate-800">{stageLabel(s.stageId)}</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {(s.points || []).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            A reference for this problem, written on its own merits — compare it against your run.
          </p>
        </details>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        New interview
      </button>
    </div>
  )
}
