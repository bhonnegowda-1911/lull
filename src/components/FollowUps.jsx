import { useState } from 'react'
import { useApiKeys } from '../context/ApiKeyContext.jsx'
import { transcribe } from '../lib/transcribe.js'
import { generateFollowups, assessFollowupAnswer } from '../lib/followups.js'
import Recorder from './Recorder.jsx'

// Simulates an interviewer probing your answer. Opt-in (extra API calls): generate
// tailored follow-ups, then record/transcribe/assess a response to each.

function Assessment({ data }) {
  const good = data.score >= 4
  const ok = data.score === 3
  const color = good ? 'text-green-700 bg-green-100' : ok ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{data.score}/5</span>
        <span className="text-xs text-slate-500">
          {data.answeredDirectly ? 'Answered it directly' : 'Didn’t answer head-on'}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{data.note}</p>
    </div>
  )
}

function FollowupRow({ index, followup, question, openaiKey, anthropicKey }) {
  const [mode, setMode] = useState('audio')
  const [active, setActive] = useState(false)
  const [state, setState] = useState({ status: 'idle' }) // idle | transcribing | assessing | done | error

  async function handleUseTake(blob, { durationSec }) {
    setActive(false)
    setState({ status: 'transcribing' })
    try {
      const t = await transcribe(blob, { apiKey: openaiKey, fallbackDurationSec: durationSec })
      if (!t.text) throw new Error('No speech detected in that take.')
      setState({ status: 'assessing', transcript: t })
      const assessment = await assessFollowupAnswer({
        mainQuestion: question,
        followupQuestion: followup.question,
        transcript: t,
        anthropicKey,
      })
      setState({ status: 'done', transcript: t, assessment })
    } catch (e) {
      setState({ status: 'error', error: e?.message || 'Something went wrong.' })
    }
  }

  const busy = state.status === 'transcribing' || state.status === 'assessing'

  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800">{followup.question}</p>
          {followup.rationale && <p className="mt-0.5 text-xs text-slate-400">{followup.rationale}</p>}
        </div>
      </div>

      <div className="mt-3">
        {state.status === 'idle' && !active && (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Record answer
          </button>
        )}

        {active && (
          <Recorder mode={mode} onModeChange={setMode} onUseTake={handleUseTake} />
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
            {state.status === 'transcribing' ? 'Transcribing…' : 'Assessing your answer…'}
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
            <Assessment data={state.assessment} />
            {state.transcript?.text && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-slate-500">Your answer</summary>
                <p className="mt-1 text-slate-600">{state.transcript.text}</p>
              </details>
            )}
            <button
              type="button"
              onClick={() => setState({ status: 'idle' })}
              className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Re-record
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export default function FollowUps({ question, transcript }) {
  const { openaiKey, anthropicKey, hasAllKeys } = useApiKeys()
  const [phase, setPhase] = useState('idle') // idle | generating | list | error
  const [followups, setFollowups] = useState([])
  const [error, setError] = useState(null)

  async function generate() {
    if (!hasAllKeys) return
    setPhase('generating')
    setError(null)
    try {
      const fs = await generateFollowups({ question, transcript, anthropicKey })
      if (!fs.length) throw new Error('No follow-ups were generated. Try again.')
      setFollowups(fs)
      setPhase('list')
    } catch (e) {
      setError(e?.message || 'Could not generate follow-ups.')
      setPhase('error')
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Follow-up questions</h3>
        <span className="text-xs text-slate-400">Like a real interviewer probing your answer</span>
      </div>

      {phase === 'idle' && (
        <div className="mt-3">
          <p className="text-sm text-slate-500">
            Generate 2–3 follow-ups tailored to what you just said, then record answers to
            practice thinking on your feet. (Makes additional API calls.)
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={!hasAllKeys}
            className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Generate follow-up questions
          </button>
        </div>
      )}

      {phase === 'generating' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
          Thinking up follow-ups…
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-3 text-sm text-red-600">
          {error}{' '}
          <button type="button" onClick={generate} className="underline">
            retry
          </button>
        </div>
      )}

      {phase === 'list' && (
        <ul className="mt-3 space-y-3">
          {followups.map((f, i) => (
            <FollowupRow
              key={i}
              index={i}
              followup={f}
              question={question}
              openaiKey={openaiKey}
              anthropicKey={anthropicKey}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
