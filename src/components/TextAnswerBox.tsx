import { useState, type KeyboardEvent } from 'react'

// A plain text composer for a behavioral answer — the typed alternative to recording audio. Unlike the
// system-design AnswerComposer (which merges push-to-talk voice into the same box), this is text-only:
// behavioral keeps a dedicated audio Recorder for takes that need replay + delivery/filler scoring, and
// this path is for when the user would rather just type. The text feeds the identical follow-up +
// grading pipeline; there's simply no audio, so delivery (pace/fillers) isn't scored for a typed answer.

interface TextAnswerBoxProps {
  onSubmit: (text: string) => void
  disabled?: boolean
  placeholder?: string
  submitLabel?: string
  rows?: number
}

export default function TextAnswerBox({
  onSubmit,
  disabled,
  placeholder,
  submitLabel = 'Submit',
  rows = 5,
}: TextAnswerBoxProps) {
  const [text, setText] = useState('')

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setText('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter submits, like most chat composers.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-3 shadow-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder || 'Type your answer…'}
        className="w-full resize-y rounded-md border border-stone-200 p-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-terracotta-400 focus:outline-none focus:ring-1 focus:ring-terracotta-400 disabled:bg-stone-50"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-stone-400">⌘/Ctrl + Enter to {submitLabel.toLowerCase()}</p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
