import { useMemo, useState, type ReactNode } from 'react'
import { Tag, Trash2, X } from 'lucide-react'
import { PROBLEMS } from '../../data/sysdesign/problems'

// Landing view for an interview mode: choose a problem to start. Used by system-design and,
// with a different problem list/copy, by the Build mode — so the problem list and intro are
// props (defaulting to the system-design library for the original call site). When problems carry
// `tags`, a toggleable filter bar appears (OR semantics: a problem shows if it has any selected
// tag); modes whose problems have no tags render exactly as before.

const DIFFICULTY_STYLE: Record<string, string> = {
  'Warm-up': 'bg-green-100 text-green-700',
  Easy: 'bg-green-100 text-green-700',
  Core: 'bg-amber-100 text-amber-700',
  Medium: 'bg-amber-100 text-amber-700',
  Hard: 'bg-red-100 text-red-700',
}

// Minimal shape the picker renders — both Problem and BuildProblem satisfy it. `tags` is optional:
// the coding library passes its `topics` here to drive category filtering.
export interface PickableProblem {
  id: string
  title: string
  difficulty: string
  statement: string
  tags?: string[]
  /** User-generated (on-demand) problem — shown with a badge and, when onDelete is set, removable. */
  custom?: boolean
}

interface ProblemPickerProps {
  onStart: (id: string) => void
  problems?: PickableProblem[]
  heading?: string
  intro?: string
  /** Optional on-demand generator panel rendered above the list (see ProblemGenerator). */
  generator?: ReactNode
  /** Optional pre-interview setup controls (target level / interviewer style) rendered up top. */
  setup?: ReactNode
  /** When set, custom problems show a delete control wired to this. */
  onDelete?: (id: string) => void
}

export default function ProblemPicker({
  onStart,
  problems = PROBLEMS,
  heading = 'Pick a problem',
  intro = 'You’ll work through the interview stage by stage. The interviewer probes with follow-ups; at the end you get a leveling read (mid / senior / staff).',
  generator,
  setup,
  onDelete,
}: ProblemPickerProps) {
  // Every tag across the list, sorted, for the filter bar. Empty when no problem is tagged.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const p of problems) for (const t of p.tags ?? []) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [problems])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (tag: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })

  const visible = useMemo(() => {
    if (selected.size === 0) return problems
    return problems.filter((p) => (p.tags ?? []).some((t) => selected.has(t)))
  }, [problems, selected])

  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <h2 className="text-base font-semibold text-stone-900">{heading}</h2>
      <p className="mt-0.5 text-sm text-stone-500">{intro}</p>

      {setup}

      {generator}

      {allTags.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <Tag size={13} aria-hidden />
            Filter by tag
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500 hover:bg-stone-200 hover:text-stone-700"
              >
                <X size={11} aria-hidden /> Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const on = selected.has(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tag)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-terracotta-600 bg-terracotta-600 text-white'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-terracotta-300 hover:text-stone-900'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-stone-400">
        {visible.length} of {problems.length} problem{problems.length === 1 ? '' : 's'}
        {selected.size > 0 && ` · ${selected.size} tag${selected.size === 1 ? '' : 's'} selected`}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white/50 p-4 text-sm text-stone-500">
          No problems match the selected tags. <button type="button" onClick={() => setSelected(new Set())} className="font-medium text-terracotta-600 hover:text-terracotta-500">Clear filters</button>.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((p) => {
            const deletable = Boolean(p.custom && onDelete)
            return (
              <li key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => onStart(p.id)}
                  className={`group flex w-full items-start justify-between gap-3 rounded-lg border border-stone-200 p-4 text-left transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/40 ${
                    deletable ? 'pr-11' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-stone-800">{p.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          DIFFICULTY_STYLE[p.difficulty] || 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {p.difficulty}
                      </span>
                      {p.custom && (
                        <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-[10px] font-medium text-terracotta-700">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-stone-500">{p.statement}</p>
                    {p.tags && p.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <span
                            key={t}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              selected.has(t) ? 'bg-terracotta-100 text-terracotta-700' : 'bg-stone-100 text-stone-500'
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!deletable && (
                    <span className="mt-1 shrink-0 text-terracotta-500 transition-transform group-hover:translate-x-0.5">→</span>
                  )}
                </button>
                {deletable && (
                  <button
                    type="button"
                    onClick={() => onDelete!(p.id)}
                    aria-label={`Delete ${p.title}`}
                    title="Delete this generated problem"
                    className="absolute right-2 top-2 rounded-md p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
