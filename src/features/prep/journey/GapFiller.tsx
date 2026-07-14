import type { GapReview } from '../../../lib/resume/gapReview'
import type { FitGap } from '../../../types'

// When the fit run surfaces gaps, ask the candidate for a quick story per gap BEFORE generating the
// tailored resume. The analyzer only ever saw story titles/themes (see lib/resume/fit.ts), so a gap
// often just means "this real experience isn't captured yet" — a sentence or two here becomes a
// grounded Story source the generator can cite. Notes are held by the parent, aligned to `gaps` order.
// "Check answers" runs an LLM review (parent-owned, `reviews`) that nudges for quantified impact /
// specifics without blocking generation.

// How each fixable class reads to the candidate — sets expectation for what a useful note looks like.
const HINT: Record<FitGap['fixable'], string> = {
  reword: 'Your resume probably shows this already — describe what you actually did so it can be surfaced.',
  add_story: 'You may already have a story for this — jot the gist and it will be pulled in.',
  genuine_gap: 'The analyzer found no supporting experience — add a note only if you genuinely have it.',
}

const TAG: Record<FitGap['fixable'], { label: string; cls: string }> = {
  reword: { label: 'reword', cls: 'bg-amber-100 text-amber-700' },
  add_story: { label: 'add story', cls: 'bg-sky-100 text-sky-700' },
  genuine_gap: { label: 'real gap', cls: 'bg-stone-200 text-stone-600' },
}

interface Props {
  gaps: FitGap[]
  /** One note per gap, aligned to `gaps` order. */
  notes: string[]
  onChange: (notes: string[]) => void
  /** LLM review per gap (aligned to `gaps` order); null where an answer wasn't reviewed. */
  reviews: (GapReview | null)[]
  onCheck: () => void
  checking: boolean
  disabled?: boolean
}

export default function GapFiller({ gaps, notes, onChange, reviews, onCheck, checking, disabled }: Props) {
  if (!gaps.length) return null

  function setNote(i: number, value: string) {
    const next = gaps.map((_, idx) => notes[idx] ?? '')
    next[i] = value
    onChange(next)
  }

  const filled = notes.filter((n) => n?.trim()).length

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-stone-900">Fill the gaps this job surfaced</h4>
        <span className="text-xs text-stone-500">{filled}/{gaps.length} answered · optional</span>
      </div>
      <p className="mb-3 text-xs text-stone-500">
        A sentence or two per gap becomes a grounded story the tailored resume can draw on. Leave any blank to skip.
      </p>
      <div className="space-y-3">
        {gaps.map((g, i) => {
          const tag = TAG[g.fixable]
          const review = reviews[i]
          const flagged = review && !review.sufficient
          return (
            <div key={`${g.title}-${i}`} className="rounded-md border border-stone-200 bg-white p-2.5">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tag.cls}`}>{tag.label}</span>
                <span className="text-sm font-medium text-stone-800">{g.title}</span>
              </div>
              <p className="mt-1 text-xs text-stone-500">{g.detail}</p>
              <p className="mt-0.5 text-[11px] italic text-stone-400">{HINT[g.fixable]}</p>
              <textarea
                value={notes[i] ?? ''}
                onChange={(e) => setNote(i, e.target.value)}
                disabled={disabled}
                rows={2}
                placeholder="What you actually did — scope, tech, and a real number if you have one…"
                className={`mt-2 w-full resize-y rounded-md border px-2 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none disabled:opacity-50 ${
                  flagged ? 'border-amber-400 focus:border-amber-500' : 'border-stone-300 focus:border-terracotta-400'
                }`}
              />

              {review && review.sufficient && (
                <p className="mt-1.5 text-[11px] text-green-600">✓ Specific enough to write a strong bullet.</p>
              )}
              {flagged && (
                <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                  <p className="text-[11px] font-medium text-amber-800">
                    {review.needsQuantification ? 'Add a number to make this land' : review.tooVague ? 'A bit vague — add specifics' : 'Could be sharper'}
                  </p>
                  {review.followups.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-700">
                      {review.followups.map((q, k) => (
                        <li key={k}>{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCheck}
          disabled={disabled || checking || filled === 0}
          className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check my answers'}
        </button>
        <span className="text-[11px] text-stone-400">Optional — flags answers that need a number or more detail. You can generate anyway.</span>
      </div>
    </div>
  )
}
