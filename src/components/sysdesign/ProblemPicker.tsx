import { PROBLEMS } from '../../data/sysdesign/problems'

// Landing view for an interview mode: choose a problem to start. Used by system-design and,
// with a different problem list/copy, by the Build mode — so the problem list and intro are
// props (defaulting to the system-design library for the original call site).

const DIFFICULTY_STYLE: Record<string, string> = {
  'Warm-up': 'bg-green-100 text-green-700',
  Core: 'bg-amber-100 text-amber-700',
  Hard: 'bg-red-100 text-red-700',
}

// Minimal shape the picker renders — both Problem and BuildProblem satisfy it.
export interface PickableProblem {
  id: string
  title: string
  difficulty: string
  statement: string
}

interface ProblemPickerProps {
  onStart: (id: string) => void
  problems?: PickableProblem[]
  heading?: string
  intro?: string
}

export default function ProblemPicker({
  onStart,
  problems = PROBLEMS,
  heading = 'Pick a problem',
  intro = 'You’ll work through the interview stage by stage. The interviewer probes with follow-ups; at the end you get a leveling read (mid / senior / staff).',
}: ProblemPickerProps) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <h2 className="text-base font-semibold text-stone-900">{heading}</h2>
      <p className="mt-0.5 text-sm text-stone-500">{intro}</p>
      <ul className="mt-4 space-y-2">
        {problems.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onStart(p.id)}
              className="group flex w-full items-start justify-between gap-3 rounded-lg border border-stone-200 p-4 text-left hover:border-terracotta-300 hover:bg-terracotta-50/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-800">{p.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      DIFFICULTY_STYLE[p.difficulty] || 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {p.difficulty}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-500">{p.statement}</p>
              </div>
              <span className="mt-1 shrink-0 text-terracotta-500 group-hover:transtone-x-0.5">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
