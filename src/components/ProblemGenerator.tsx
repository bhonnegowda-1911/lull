import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'

// Collapsible "generate a problem on demand" panel rendered at the top of a ProblemPicker. It owns the
// little spec form (free-text prompt + optional difficulty + optional focus) and the loading/error
// state around the async call; the parent supplies `onGenerate`, which authors the problem via the LLM,
// persists it, and (typically) starts the interview. Mode-agnostic: coding passes a `focus` field for
// the DSA pattern; system design omits it.

export interface GenSpec {
  prompt: string
  difficulty: string
  focus: string
}

interface ProblemGeneratorProps {
  /** Authors + persists the problem and usually starts it. Rejects on failure. */
  onGenerate: (spec: GenSpec) => Promise<void>
  /** True when LLM keys are configured; when false, the action defers to onNeedKeys. */
  hasKeys: boolean
  onNeedKeys?: () => void
  difficulties: string[]
  /** When set, shows an optional focus input (e.g. DSA pattern). Omit to hide it. */
  focusLabel?: string
  focusPlaceholder?: string
  promptPlaceholder: string
  /** Verb-y noun for copy, e.g. "coding problem" / "system-design problem". */
  noun: string
}

export default function ProblemGenerator({
  onGenerate,
  hasKeys,
  onNeedKeys,
  difficulties,
  focusLabel,
  focusPlaceholder,
  promptPlaceholder,
  noun,
}: ProblemGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!hasKeys) {
      onNeedKeys?.()
      return
    }
    if (!prompt.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onGenerate({ prompt, difficulty, focus })
      // On success the parent typically starts the interview (this component unmounts). If it doesn't,
      // reset the form so the panel is ready for another.
      setPrompt('')
      setFocus('')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError((e as Error)?.message || `Could not generate a ${noun}. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-terracotta-300 bg-terracotta-50/40 px-3 py-2 text-sm font-medium text-terracotta-700 transition-colors hover:border-terracotta-400 hover:bg-terracotta-50"
      >
        <Sparkles size={15} aria-hidden /> Generate a {noun}
      </button>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-terracotta-200 bg-terracotta-50/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <Sparkles size={15} className="text-terracotta-600" aria-hidden /> Generate a {noun}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-600"
          aria-label="Close"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <p className="mt-1 text-xs text-stone-500">
        Describe what you want to practice. It’s authored with its own grading reference, so it runs the
        full interview and leveling report just like a curated problem.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={promptPlaceholder}
        rows={3}
        className="mt-3 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-terracotta-400 focus:outline-none focus:ring-1 focus:ring-terracotta-300"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {focusLabel && (
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={focusPlaceholder}
            aria-label={focusLabel}
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-terracotta-400 focus:outline-none focus:ring-1 focus:ring-terracotta-300"
          />
        )}
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          aria-label="Difficulty"
          className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:border-terracotta-400 focus:outline-none focus:ring-1 focus:ring-terracotta-300"
        >
          <option value="">Any difficulty</option>
          {difficulties.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !prompt.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-terracotta-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Authoring…
            </>
          ) : (
            <>
              <Sparkles size={14} aria-hidden /> Generate &amp; start
            </>
          )}
        </button>
        {busy && <span className="text-xs text-stone-500">Writing the problem and its grading key…</span>}
      </div>
    </div>
  )
}
