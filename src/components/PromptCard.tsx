import { Trash2 } from 'lucide-react'
import { PROMPTS, PROMPT_CATEGORIES, ANSWER_FRAMEWORK, type Prompt } from '../data/prompts'

interface PromptCardProps {
  prompt: Prompt
  onSelect?: (id: string) => void
  disabled?: boolean
  interviewMode?: boolean
  /** User-authored questions, shown under their own optgroup in the picker. */
  customPrompts?: Prompt[]
  /** Delete a user-authored question (shown only while one is selected). */
  onDeleteCustom?: (id: string) => void
}

export default function PromptCard({
  prompt,
  onSelect,
  disabled,
  interviewMode,
  customPrompts = [],
  onDeleteCustom,
}: PromptCardProps) {
  const isCustom = customPrompts.some((p) => p.id === prompt.id)
  // "Unknown" = not in the bank and not a saved custom question (e.g. an ad-hoc custom-round prompt
  // launched from the prep plan): surface it as its own selected option so the dropdown stays honest.
  const isKnown = isCustom || PROMPTS.some((p) => p.id === prompt.id)
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
          {prompt.category}
        </div>
        <div className="flex items-center gap-1.5">
          {isCustom && onDeleteCustom && (
            <button
              type="button"
              onClick={() => onDeleteCustom(prompt.id)}
              disabled={disabled}
              aria-label="Delete this question"
              title="Delete this question"
              className="rounded p-1 text-stone-400 hover:bg-stone-200/60 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          )}
          <select
            value={prompt.id}
            onChange={(e) => onSelect?.(e.target.value)}
            disabled={disabled}
            aria-label="Choose a question"
            className="max-w-[220px] truncate rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-700 focus:border-terracotta-500 focus:outline-none focus:ring-1 focus:ring-terracotta-500 disabled:opacity-50"
          >
            {!isKnown && (
              <optgroup label="This round">
                <option value={prompt.id}>{prompt.label}</option>
              </optgroup>
            )}
            {customPrompts.length > 0 && (
              <optgroup label="Your questions">
                {customPrompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
            {PROMPT_CATEGORIES.map((category) => (
              <optgroup key={category} label={category}>
                {PROMPTS.filter((p) => p.category === category).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 text-lg leading-relaxed text-stone-800">{prompt.text}</p>

      {interviewMode ? (
        <p className="mt-3 text-xs text-stone-400">
          Interview mode: tips are hidden — answer cold, like the real thing.
        </p>
      ) : (
        <details className="mt-3 rounded-lg bg-stone-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-600">
            How to approach this
          </summary>

          {prompt.assesses && (
            <p className="mt-2 text-sm text-stone-600">
              <span className="font-medium text-stone-700">What it really assesses:</span>{' '}
              {prompt.assesses}
            </p>
          )}
          {prompt.tip && (
            <p className="mt-1 text-sm text-stone-600">
              <span className="font-medium text-stone-700">Tip:</span> {prompt.tip}
            </p>
          )}
          {prompt.trap && (
            <p className="mt-1 text-sm text-stone-600">
              <span className="font-medium text-red-600">The trap:</span> {prompt.trap}
            </p>
          )}
          {prompt.avoid && (
            <p className="mt-1 text-sm text-stone-600">
              <span className="font-medium text-amber-600">Leave out:</span> {prompt.avoid}
            </p>
          )}

          <div className="mt-3 border-t border-stone-200 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              How to structure any answer
            </div>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-stone-600">
              {ANSWER_FRAMEWORK.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </details>
      )}
    </div>
  )
}
