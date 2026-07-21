import { useState } from 'react'
import { transcribe } from '../lib/transcribe'
import Recorder, { type RecordMode, type TakeMeta } from './Recorder'
import TextAnswerBox from './TextAnswerBox'
import type { Followup } from '../lib/followups'
import type { Transcript } from '../types'

// The follow-up step of a behavioral rep: the interviewer's probing questions, each answered by
// recording + transcribing OR by typing. No per-answer grading here — the whole conversation is graded
// once at the end (see BehavioralView). Answers are reported up so the final grade can include them.

type RowState =
  | { status: 'idle' }
  | { status: 'transcribing' }
  | { status: 'done'; transcript: Transcript }
  | { status: 'error'; error: string }

function FollowUpRow({
  index,
  followup,
  onAnswered,
}: {
  index: number
  followup: Followup
  onAnswered: (index: number, transcript: Transcript) => void
}) {
  const [mode, setMode] = useState<RecordMode>('audio')
  // 'record' opens the audio/video recorder; 'write' opens a text box. null = the initial choice buttons.
  const [active, setActive] = useState<'record' | 'write' | null>(null)
  const [state, setState] = useState<RowState>({ status: 'idle' })

  async function handleUseTake(blob: Blob, { durationSec }: TakeMeta) {
    setActive(null)
    setState({ status: 'transcribing' })
    try {
      const { transcript } = await transcribe(blob, { fallbackDurationSec: durationSec })
      if (!transcript.text) throw new Error('No speech detected in that take.')
      setState({ status: 'done', transcript })
      onAnswered(index, transcript)
    } catch (e) {
      setState({ status: 'error', error: (e as Error)?.message || 'Something went wrong.' })
    }
  }

  function handleTyped(text: string) {
    const transcript: Transcript = { text: text.trim(), durationSec: null }
    if (!transcript.text) return
    setActive(null)
    setState({ status: 'done', transcript })
    onAnswered(index, transcript)
  }

  return (
    <li className="rounded-lg border border-stone-200 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-700 text-xs font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-800">{followup.question}</p>
          {followup.rationale && <p className="mt-0.5 text-xs text-stone-400">{followup.rationale}</p>}
        </div>
        {state.status === 'done' && <span className="shrink-0 text-xs font-medium text-emerald-600">Answered ✓</span>}
      </div>

      <div className="mt-3">
        {state.status === 'idle' && !active && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActive('record')}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Record answer
            </button>
            <button
              type="button"
              onClick={() => setActive('write')}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Type answer
            </button>
          </div>
        )}

        {active === 'record' && <Recorder mode={mode} onModeChange={setMode} onUseTake={handleUseTake} />}

        {active === 'write' && (
          <TextAnswerBox onSubmit={handleTyped} submitLabel="Save answer" rows={3} placeholder="Type your response…" />
        )}

        {state.status === 'transcribing' && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
            Transcribing…
          </div>
        )}

        {state.status === 'error' && (
          <div className="text-sm text-red-600">
            {state.error}{' '}
            <button type="button" onClick={() => setState({ status: 'idle' })} className="underline">
              try again
            </button>
          </div>
        )}

        {state.status === 'done' && (
          <div>
            {state.transcript?.text && (
              <details className="text-sm">
                <summary className="cursor-pointer text-stone-500">Your answer</summary>
                <p className="mt-1 text-stone-600">{state.transcript.text}</p>
              </details>
            )}
            <button
              type="button"
              onClick={() => setState({ status: 'idle' })}
              className="mt-2 text-sm font-medium text-terracotta-600 hover:text-terracotta-500"
            >
              Answer again
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export default function FollowUpAnswers({
  followups,
  onAnswered,
}: {
  followups: Followup[]
  onAnswered: (index: number, transcript: Transcript) => void
}) {
  return (
    <ul className="space-y-3">
      {followups.map((f, i) => (
        <FollowUpRow key={i} index={i} followup={f} onAnswered={onAnswered} />
      ))}
    </ul>
  )
}
