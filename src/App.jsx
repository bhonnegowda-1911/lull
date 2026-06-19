import { useReducer, useRef, useState } from 'react'
import { useApiKeys } from './context/ApiKeyContext.jsx'
import { PROMPTS, DEFAULT_PROMPT } from './data/prompts.js'
import { transcribe } from './lib/transcribe.js'
import { runPipeline } from './lib/pipeline.js'
import { buildFeedback } from './lib/feedback.js'
import PromptCard from './components/PromptCard.jsx'
import Recorder from './components/Recorder.jsx'
import FeedbackPanel from './components/FeedbackPanel.jsx'
import FollowUps from './components/FollowUps.jsx'
import FocusTargets from './components/FocusTargets.jsx'
import RealismChecklist from './components/RealismChecklist.jsx'
import SettingsModal from './components/SettingsModal.jsx'

// Session reducer. One in-flight session at a time; the shape is designed to drop into
// IndexedDB + a history list in Phase 2.
const initialState = {
  status: 'idle', // idle | transcribing | analyzing | done | error
  session: null,
  replayUrl: null,
  isVideo: false,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'START':
      if (state.replayUrl) URL.revokeObjectURL(state.replayUrl)
      return {
        ...initialState,
        status: 'transcribing',
        replayUrl: action.replayUrl,
        isVideo: action.isVideo,
      }
    case 'STAGE':
      return { ...state, status: action.status }
    case 'DONE':
      return { ...state, status: 'done', session: action.session }
    case 'ERROR':
      return { ...state, status: 'error', error: action.error }
    case 'RESET':
      if (state.replayUrl) URL.revokeObjectURL(state.replayUrl)
      return initialState
    default:
      return state
  }
}

const STAGE_LABEL = {
  transcribing: 'Transcribing your answer…',
  analyzing: 'Analyzing structure & delivery…',
}

export default function App() {
  const { anthropicKey, openaiKey, hasAllKeys } = useApiKeys()
  const [state, dispatch] = useReducer(reducer, initialState)
  const [mode, setMode] = useState('audio')
  const [promptId, setPromptId] = useState(DEFAULT_PROMPT.id)
  const [interviewMode, setInterviewMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const abortRef = useRef(null)

  const prompt = PROMPTS.find((p) => p.id === promptId) || DEFAULT_PROMPT
  const busy = state.status === 'transcribing' || state.status === 'analyzing'

  function handleSelectPrompt(id) {
    setPromptId(id)
    // Switching questions starts a fresh session so feedback always matches the prompt.
    if (state.status !== 'idle') dispatch({ type: 'RESET' })
  }

  async function handleUseTake(blob, { durationSec, isVideo }) {
    if (!hasAllKeys) {
      setSettingsOpen(true)
      return
    }
    const replayUrl = URL.createObjectURL(blob)
    dispatch({ type: 'START', replayUrl, isVideo })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const transcript = await transcribe(blob, {
        apiKey: openaiKey,
        signal: controller.signal,
        fallbackDurationSec: durationSec,
      })
      if (!transcript.text) {
        throw new Error('No speech was detected in the recording. Try again.')
      }

      const { filler, llm } = await runPipeline({
        question: prompt.text,
        transcript,
        anthropicKey,
        signal: controller.signal,
        onProgress: (stage) => {
          if (stage === 'analyzing') dispatch({ type: 'STAGE', status: 'analyzing' })
        },
      })

      const feedback = buildFeedback({ llm, filler })
      const session = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        promptId: prompt.id,
        transcript,
        filler: filler.raw,
        llm,
        feedback,
        isVideo,
      }
      dispatch({ type: 'DONE', session })
    } catch (e) {
      if (e?.name === 'AbortError') return
      dispatch({ type: 'ERROR', error: e?.message || 'Something went wrong.' })
    } finally {
      abortRef.current = null
    }
  }

  function handleReset() {
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }

  const ReplayMedia = state.isVideo ? 'video' : 'audio'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Delivery Coach</h1>
            <p className="text-xs text-slate-500">
              Record an answer, get graded feedback on structure and delivery.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!hasAllKeys && (
              <span className="hidden text-xs text-amber-600 sm:inline">API keys needed</span>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={interviewMode}
                onChange={(e) => setInterviewMode(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Interview mode
            </label>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <PromptCard
            prompt={prompt}
            onSelect={handleSelectPrompt}
            disabled={busy}
            interviewMode={interviewMode}
          />

          {state.status === 'idle' && interviewMode && <RealismChecklist />}

          {state.status === 'idle' && (
            <Recorder mode={mode} onModeChange={setMode} onUseTake={handleUseTake} disabled={busy} />
          )}

          {busy && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
              <p className="mt-3 text-sm text-slate-600">{STAGE_LABEL[state.status]}</p>
              <p className="mt-1 text-xs text-slate-400">
                This sends your audio to OpenAI and Anthropic and usually takes 10–20s.
              </p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
              <p className="text-sm font-medium text-red-800">{state.error}</p>
              {state.replayUrl && (
                <div className="mt-3">
                  <p className="text-xs text-red-600">Your recording is safe — replay below.</p>
                  <ReplayMedia
                    src={state.replayUrl}
                    controls
                    className={state.isVideo ? 'mt-2 w-full rounded-md' : 'mt-2 w-full'}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Try another take
              </button>
            </div>
          )}

          {state.status === 'done' && state.session && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Your recording</h3>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    New take
                  </button>
                </div>
                <ReplayMedia
                  src={state.replayUrl}
                  controls
                  className={state.isVideo ? 'mt-3 w-full rounded-md' : 'mt-3 w-full'}
                />
                {state.session.transcript?.text && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-slate-500">Transcript</summary>
                    <p className="mt-2 leading-relaxed text-slate-600">
                      {state.session.transcript.text}
                    </p>
                  </details>
                )}
              </div>
              <FeedbackPanel feedback={state.session.feedback} />
              <FollowUps question={prompt.text} transcript={state.session.transcript} />
            </>
          )}
        </div>

        <aside className="space-y-5">
          <FocusTargets session={state.status === 'done' ? state.session : null} />
        </aside>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
