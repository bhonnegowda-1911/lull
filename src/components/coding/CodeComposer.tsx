import CodeEditor from './CodeEditor'
import { LANGUAGES, type CodeLanguage } from '../../data/coding/stages'

// The IMPLEMENT-stage input: a language selector + CodeMirror editor + a "Submit code" action that
// sends the code to the interviewer as a fenced code block. The code + language are owned by the
// session (so they persist and restore on reload); this is a controlled component.

interface CodeComposerProps {
  code: string
  language: CodeLanguage
  onCodeChange: (code: string) => void
  onLanguageChange: (lang: CodeLanguage) => void
  onSubmit: () => void
  disabled?: boolean
}

export default function CodeComposer({
  code,
  language,
  onCodeChange,
  onLanguageChange,
  onSubmit,
  disabled,
}: CodeComposerProps) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-stone-500">
          <span>Language</span>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as CodeLanguage)}
            disabled={disabled}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-700 focus:border-terracotta-400 focus:outline-none disabled:opacity-50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[11px] text-stone-400">Write your solution, then submit it for review.</span>
      </div>

      <CodeEditor value={code} language={language} onChange={onCodeChange} readOnly={disabled} />

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !code.trim()}
          className="rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          Submit code
        </button>
      </div>
    </div>
  )
}
