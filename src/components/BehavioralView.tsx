import { useEffect, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApiKeys } from '../context/ApiKeyContext'
import { PROMPTS, DEFAULT_PROMPT } from '../data/prompts'
import { transcribe } from '../lib/transcribe'
import { runPipeline } from '../lib/pipeline'
import { buildFeedback } from '../lib/feedback'
import { generateFollowups, type Followup } from '../lib/followups'
import { saveSession, type SessionRecord } from '../lib/sessionStore'
import { getProfile } from '../lib/profileStore'
import { listStories, saveStory } from '../lib/storyStore'
import { listProjects } from '../lib/projectStore'
import { matchStories } from '../lib/stories/match'
import { matchProjects, type Project } from '../data/projects'
import { extractStory } from '../lib/stories/extract'
import { DEFAULT_PROFILE, type Profile, type Story } from '../data/stories'
import { assetUrl } from '../lib/assetStore'
import PromptCard from './PromptCard'
import Recorder, { type RecordMode, type TakeMeta } from './Recorder'
import FeedbackPanel from './FeedbackPanel'
import FollowUpAnswers from './FollowUpAnswers'
import FocusTargets from './FocusTargets'
import RealismChecklist from './RealismChecklist'
import type { Session, Transcript } from '../types'

// Behavioral practice: record the main answer → transcribe → the interviewer asks tailored
// follow-ups, which you also answer → THEN the whole conversation (main answer + every follow-up
// answer) is graded once. Grading is deliberately deferred to the end so it reflects how you held
// up under probing, not just your opening answer.
//
// Two modes:
// - Interview: the interviewer is aware only of your RESUME and holds you to your TARGET LEVEL
//   (senior/staff); follow-ups probe at that bar and escalate. Feedback is the interviewer's read,
//   with NO knowledge of your story bank.
// - Coaching: grading additionally receives your matched true stories, so feedback critiques the
//   CONTENT (undersold impact, "we" vs "I", a stronger example), not just delivery.
// Either way, each rep is distilled into a draft story (best-effort) so the bank fills with use.

export type BehavioralMode = 'interview' | 'coaching'

/** What we store for a behavioral session: the full result + a pointer to the main recording. */
export interface BehavioralPayload {
  session: Session
  audioAssetId: string | null
}

type Phase = 'idle' | 'transcribing' | 'followups_generating' | 'followups' | 'grading' | 'done' | 'error'

interface State {
  phase: Phase
  mainTranscript: Transcript | null
  replayUrl: string | null
  isVideo: boolean
  audioAssetId: string | null
  followups: Followup[]
  answers: (Transcript | null)[]
  session: Session | null
  error: string | null
}

type Action =
  | { type: 'START'; replayUrl: string; isVideo: boolean }
  | { type: 'MAIN_DONE'; transcript: Transcript; audioAssetId: string | null }
  | { type: 'FOLLOWUPS'; followups: Followup[] }
  | { type: 'ANSWER'; index: number; transcript: Transcript }
  | { type: 'GRADING' }
  | { type: 'DONE'; session: Session }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'HYDRATE'; session: Session; replayUrl: string | null; isVideo: boolean }

const initialState: State = {
  phase: 'idle',
  mainTranscript: null,
  replayUrl: null,
  isVideo: false,
  audioAssetId: null,
  followups: [],
  answers: [],
  session: null,
  error: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      if (state.replayUrl?.startsWith('blob:')) URL.revokeObjectURL(state.replayUrl)
      return { ...initialState, phase: 'transcribing', replayUrl: action.replayUrl, isVideo: action.isVideo }
    case 'MAIN_DONE':
      return { ...state, phase: 'followups_generating', mainTranscript: action.transcript, audioAssetId: action.audioAssetId }
    case 'FOLLOWUPS':
      return { ...state, phase: 'followups', followups: action.followups, answers: new Array(action.followups.length).fill(null) }
    case 'ANSWER': {
      const answers = state.answers.slice()
      answers[action.index] = action.transcript
      return { ...state, answers }
    }
    case 'GRADING':
      return { ...state, phase: 'grading' }
    case 'DONE':
      return { ...state, phase: 'done', session: action.session }
    case 'ERROR':
      return { ...state, phase: 'error', error: action.error }
    case 'RESET':
      if (state.replayUrl?.startsWith('blob:')) URL.revokeObjectURL(state.replayUrl)
      return initialState
    case 'HYDRATE':
      if (state.replayUrl?.startsWith('blob:')) URL.revokeObjectURL(state.replayUrl)
      return { ...initialState, phase: 'done', session: action.session, replayUrl: action.replayUrl, isVideo: action.isVideo }
    default:
      return state
  }
}

const STAGE_LABEL: Record<string, string> = {
  transcribing: 'Transcribing your answer…',
  followups_generating: 'The interviewer is thinking of follow-ups…',
  grading: 'Grading the full conversation…',
}

/**
 * Stitch the main answer and every answered follow-up into one transcript for grading. Filler
 * analysis and STAR grading both read `transcript.text`; the interviewer's question lines are
 * filler-free, so they don't skew the rate. Duration sums only what the candidate actually spoke.
 */
function buildConversationTranscript(
  main: Transcript,
  followups: Followup[],
  answers: (Transcript | null)[],
): Transcript {
  const parts = [main.text]
  let duration = main.durationSec ?? 0
  followups.forEach((f, i) => {
    const ans = answers[i]
    if (ans?.text) {
      parts.push(`\nInterviewer follow-up: ${f.question}\nMy response: ${ans.text}`)
      duration += ans.durationSec ?? 0
    }
  })
  return { text: parts.join('\n'), durationSec: duration > 0 ? duration : null }
}

/**
 * Distill a graded answer into a draft story for the bank (capture-from-reps). Best-effort: any
 * failure is swallowed so it never disrupts the rep. Saved as 'draft' for the user to review.
 */
async function captureStoryDraft(question: string, transcript: Transcript, sessionId: string): Promise<void> {
  try {
    const draft = await extractStory({ question, transcript })
    if (!draft.title) return
    await saveStory({ id: crypto.randomUUID(), status: 'draft', sourceSessionIds: [sessionId], projectId: null, ...draft })
  } catch {
    // capture is opportunistic — ignore extraction/save failures
  }
}

export default function BehavioralView({ onNeedKeys }: { onNeedKeys?: () => void }) {
  const { hasAllKeys } = useApiKeys()
  const [state, dispatch] = useReducer(reducer, initialState)
  const [recordMode, setRecordMode] = useState<RecordMode>('audio')
  const [promptId, setPromptId] = useState(DEFAULT_PROMPT.id)
  const [mode, setMode] = useState<BehavioralMode>('interview')
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const abortRef = useRef<AbortController | null>(null)
  const location = useLocation()

  // Load the resume + target level once; interview mode uses them to calibrate follow-ups.
  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

  // Reopen a past session passed from History via router state.
  const resume = (location.state as { session?: SessionRecord<BehavioralPayload> } | null)?.session
  useEffect(() => {
    if (!resume) return
    const { session, audioAssetId } = resume.payload
    setPromptId(session.promptId)
    dispatch({
      type: 'HYDRATE',
      session,
      replayUrl: audioAssetId ? assetUrl(audioAssetId) : null,
      isVideo: session.isVideo,
    })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume?.id])

  // Pre-select a question chosen from a target job's plan (Prep → Match → Practice), ready to record.
  const startPromptId = (location.state as { startPromptId?: string } | null)?.startPromptId
  useEffect(() => {
    if (!startPromptId) return
    setPromptId(startPromptId)
    dispatch({ type: 'RESET' })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPromptId])

  const prompt = PROMPTS.find((p) => p.id === promptId) || DEFAULT_PROMPT
  const busy = state.phase === 'transcribing' || state.phase === 'followups_generating' || state.phase === 'grading'

  function handleSelectPrompt(id: string) {
    setPromptId(id)
    if (state.phase !== 'idle') dispatch({ type: 'RESET' })
  }

  async function handleUseTake(blob: Blob, { durationSec, isVideo }: TakeMeta) {
    if (!hasAllKeys) {
      onNeedKeys?.()
      return
    }
    const replayUrl = URL.createObjectURL(blob)
    dispatch({ type: 'START', replayUrl, isVideo })

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { transcript, assetId } = await transcribe(blob, {
        signal: controller.signal,
        fallbackDurationSec: durationSec,
      })
      if (!transcript.text) throw new Error('No speech was detected in the recording. Try again.')
      dispatch({ type: 'MAIN_DONE', transcript, audioAssetId: assetId })

      // The interviewer probes before we grade. If generation fails, fall through to the
      // follow-up phase with no questions — you can still grade the main answer alone.
      try {
        const followups = await generateFollowups({
          question: prompt.text,
          transcript,
          resume: profile.resumeText,
          targetLevel: profile.targetLevel,
          signal: controller.signal,
        })
        dispatch({ type: 'FOLLOWUPS', followups })
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        dispatch({ type: 'FOLLOWUPS', followups: [] })
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'ERROR', error: (e as Error)?.message || 'Something went wrong.' })
    } finally {
      abortRef.current = null
    }
  }

  function handleAnswered(index: number, transcript: Transcript) {
    dispatch({ type: 'ANSWER', index, transcript })
  }

  async function handleGetFeedback() {
    if (!state.mainTranscript) return
    dispatch({ type: 'GRADING' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const conversation = buildConversationTranscript(state.mainTranscript, state.followups, state.answers)
      // Coaching mode grades against the candidate's true ground truth for this competency —
      // confirmed stories plus the richer projects behind them. Interview mode grades blind (the
      // interviewer's read). Drafts are excluded — only confirmed stories are trustworthy.
      let stories: Story[] | undefined
      let projects: Project[] | undefined
      if (mode === 'coaching') {
        const [confirmedStories, allProjects] = await Promise.all([
          listStories({ status: 'confirmed' }),
          listProjects(),
        ])
        stories = matchStories(prompt.category, confirmedStories)
        projects = matchProjects(prompt.category, allProjects)
      }
      const { filler, llm } = await runPipeline({
        question: prompt.text,
        transcript: conversation,
        stories,
        projects,
        signal: controller.signal,
      })
      const feedback = buildFeedback({ llm, filler })
      const session: Session = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        promptId: prompt.id,
        transcript: conversation,
        filler: filler.raw,
        llm,
        feedback,
        isVideo: state.isVideo,
      }
      dispatch({ type: 'DONE', session })
      void saveSession<BehavioralPayload>({
        id: session.id,
        kind: 'behavioral',
        status: 'completed',
        title: prompt.label,
        level: feedback.level?.level ?? null,
        payload: { session, audioAssetId: state.audioAssetId },
      })
      // Capture-from-reps: distill this answer into a draft story for the bank. Best-effort and
      // non-blocking — failures never affect the graded result the user is looking at.
      void captureStoryDraft(prompt.text, conversation, session.id)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'ERROR', error: (e as Error)?.message || 'Something went wrong.' })
    } finally {
      abortRef.current = null
    }
  }

  function handleReset() {
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }

  const answeredCount = state.answers.filter(Boolean).length
  const ReplayMedia = state.isVideo ? 'video' : 'audio'

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <PromptCard prompt={prompt} onSelect={handleSelectPrompt} disabled={busy} interviewMode={mode === 'interview'} />
        </div>

        {state.phase === 'idle' && (
          <div className="space-y-1">
            <div className="inline-flex rounded-md border border-stone-200 p-0.5 text-sm">
              {(['interview', 'coaching'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-1 capitalize ${
                    mode === m ? 'bg-terracotta-600 text-white' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500">
              {mode === 'interview'
                ? `The interviewer knows only your resume and holds you to a ${profile.targetLevel} bar — no story-bank feedback.`
                : 'Feedback critiques your telling against your confirmed stories (undersold impact, “we” vs “I”, a stronger example).'}
            </p>
          </div>
        )}

        {state.phase === 'idle' && mode === 'interview' && <RealismChecklist />}

        {state.phase === 'idle' && (
          <Recorder mode={recordMode} onModeChange={setRecordMode} onUseTake={handleUseTake} disabled={busy} />
        )}

        {busy && (
          <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-8 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
            <p className="mt-3 text-sm text-stone-600">{STAGE_LABEL[state.phase]}</p>
            <p className="mt-1 text-xs text-stone-400">
              This sends your audio to OpenAI and Anthropic (via the backend) and usually takes 10–20s.
            </p>
          </div>
        )}

        {/* Follow-up phase: probe before grading. */}
        {state.phase === 'followups' && state.mainTranscript && (
          <>
            <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700">Your answer</h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Start over
                </button>
              </div>
              {state.replayUrl && (
                <ReplayMedia src={state.replayUrl} controls className={state.isVideo ? 'mt-3 w-full rounded-md' : 'mt-3 w-full'} />
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-stone-500">Transcript</summary>
                <p className="mt-2 leading-relaxed text-stone-600">{state.mainTranscript.text}</p>
              </details>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700">Follow-up questions</h3>
                <span className="text-xs text-stone-400">The interviewer probes before grading</span>
              </div>
              {state.followups.length > 0 ? (
                <p className="mt-2 text-sm text-stone-500">
                  Answer these the way you would in the room, then get your feedback. You can skip any
                  you want — the final grade covers everything you said.
                </p>
              ) : (
                <p className="mt-2 text-sm text-stone-500">
                  No follow-ups this time. Get your feedback whenever you’re ready.
                </p>
              )}
              {state.followups.length > 0 && (
                <div className="mt-3">
                  <FollowUpAnswers followups={state.followups} onAnswered={handleAnswered} />
                </div>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleGetFeedback}
                  className="rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500"
                >
                  Get feedback
                </button>
                {state.followups.length > 0 && (
                  <span className="text-xs text-stone-400">
                    {answeredCount} of {state.followups.length} answered
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {state.phase === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-red-800">{state.error}</p>
            {state.replayUrl && (
              <div className="mt-3">
                <p className="text-xs text-red-600">Your recording is safe — replay below.</p>
                <ReplayMedia src={state.replayUrl} controls className={state.isVideo ? 'mt-2 w-full rounded-md' : 'mt-2 w-full'} />
              </div>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50"
            >
              Try another take
            </button>
          </div>
        )}

        {state.phase === 'done' && state.session && (
          <>
            <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700">Your recording</h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500"
                >
                  New take
                </button>
              </div>
              {state.replayUrl && (
                <ReplayMedia src={state.replayUrl} controls className={state.isVideo ? 'mt-3 w-full rounded-md' : 'mt-3 w-full'} />
              )}
              {state.session.transcript?.text && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-stone-500">Full conversation transcript</summary>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-stone-600">{state.session.transcript.text}</p>
                </details>
              )}
            </div>
            <FeedbackPanel feedback={state.session.feedback} />
          </>
        )}
      </div>

      <aside className="space-y-5">
        <FocusTargets session={state.phase === 'done' ? state.session : null} />
      </aside>
    </div>
  )
}
