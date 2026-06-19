import { PROMPTS, PROMPT_CATEGORIES, ANSWER_FRAMEWORK } from '../data/prompts.js'

export default function PromptCard({ prompt, onSelect, disabled, interviewMode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {prompt.category}
        </div>
        <select
          value={prompt.id}
          onChange={(e) => onSelect?.(e.target.value)}
          disabled={disabled}
          aria-label="Choose a question"
          className="max-w-[60%] truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        >
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

      <p className="mt-2 text-lg leading-relaxed text-slate-800">{prompt.text}</p>

      {interviewMode ? (
        <p className="mt-3 text-xs text-slate-400">
          Interview mode: tips are hidden — answer cold, like the real thing.
        </p>
      ) : (
        <details className="mt-3 rounded-lg bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            How to approach this
          </summary>

          {prompt.assesses && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-700">What it really assesses:</span>{' '}
              {prompt.assesses}
            </p>
          )}
          {prompt.tip && (
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Tip:</span> {prompt.tip}
            </p>
          )}

          <div className="mt-3 border-t border-slate-200 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              How to structure any answer
            </div>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
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
