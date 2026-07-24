import { useEffect, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApiKeys } from '../context/ApiKeyContext'
import { PROMPTS, DEFAULT_PROMPT, type Prompt } from '../data/prompts'
import { transcribe } from '../lib/transcribe'
import { runPipeline } from '../lib/pipeline'
import { buildFeedback } from '../lib/feedback'
import { generateFollowups, type Followup } from '../lib/followups'
import { saveSession, type SessionRecord } from '../lib/sessionStore'
import { celebrateBig } from '../lib/ui/celebrate'
import { track } from '../lib/metrics/events'
import { getProfile } from '../lib/profileStore'
import { getJob } from '../lib/jobStore'
import { listStories, saveStory } from '../lib/storyStore'
import { listProjects } from '../lib/projectStore'
import { matchStories } from '../lib/stories/match'
import { matchProjects, type Project } from '../data/projects'
import { extractStory } from '../lib/stories/extract'
import { DEFAULT_PROFILE, type Profile, type Story } from '../data/stories'
import { assetUrl } from '../lib/assetStore'
import PromptCard from './PromptCard'
import ProblemGenerator, { type GenSpec } from './ProblemGenerator'
import {
  loadCustomPrompts,
  hydrateCustomPrompts,
  addCustomPrompt,
  deleteCustomPrompt,
} from '../lib/behavioral/customQuestions'
import { generateBehavioralQuestion } from '../lib/behavioral/generateQuestion'
import Recorder, { type RecordMode, type TakeMeta } from './Recorder'
import TextAnswerBox from './TextAnswerBox'
import FeedbackPanel from './FeedbackPanel'
import FollowUpAnswers from './FollowUpAnswers'
import FocusTargets from './FocusTargets'
import RealismChecklist from './RealismChecklist'
import GradingProgress from './GradingProgress'
import type { FillerResult, InterviewerPersona, ParsedJob, Session, StarGrading, Transcript } from '../types'

/** Live grading progress surfaced while the STAR grade streams in (see GradingProgress). */
interface GradeProgress {
  phase?: 'thinking' | 'writing'
  filler?: FillerResult | null
  partial?: Partial<StarGrading> | null
}

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
  | { type: 'START_TEXT'; transcript: Transcript }
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
    case 'START_TEXT':
      // A typed answer skips recording + transcription entirely: no audio, straight to follow-ups.
      if (state.replayUrl?.startsWith('blob:')) URL.revokeObjectURL(state.replayUrl)
      return { ...initialState, phase: 'followups_generating', mainTranscript: action.transcript, audioAssetId: null }
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

/** A prep-plan launch carried in router state: a question and/or interviewer context to practice. */
interface PlanLaunch {
  startPromptId?: string
  jobId?: string
  persona?: InterviewerPersona
  interviewerContext?: string
  startPrompt?: { text: string; label: string; assesses?: string; tip?: string; trap?: string }
}

/** Read a plan launch from router state, or null for open practice / a resumed session. */
function readPlanLaunch(state: unknown): PlanLaunch | null {
  const s = state as (PlanLaunch & { session?: unknown }) | null
  if (!s || s.session) return null // a resumed History session, not a plan launch
  if (!s.startPromptId && !s.jobId && !s.persona && !s.interviewerContext && !s.startPrompt) return null
  return s
}

/** The ad-hoc question a launch should practice: its own authored prompt, a neutral grounded opener
 *  when it carries only context, or null when a bank prompt id (or nothing) drives the question. */
function launchPrompt(launch: PlanLaunch | null): Prompt | null {
  if (!launch) return null
  if (launch.startPrompt) {
    const p = launch.startPrompt
    return { id: 'custom-round', category: p.label, label: p.label, text: p.text, assesses: p.assesses ?? '', tip: p.tip ?? '', trap: p.trap ?? '', avoid: '' }
  }
  if (launch.startPromptId) return null // a bank prompt id drives the question instead
  // Only context (a custom round, or an older saved plan): a neutral opener, never a random bank question.
  return { id: 'round-open', category: 'Open conversation', label: 'Open the conversation', text: 'Tell me about your background and why this role — the interviewer will take it from there.', assesses: '', tip: '', trap: '', avoid: '' }
}

export default function BehavioralView({ onNeedKeys }: { onNeedKeys?: () => void }) {
  const { hasAllKeys, hasAnthropic } = useApiKeys()
  const location = useLocation()
  // A prep-plan launch (question + persona + interviewer context), read ONCE at mount. Applied via
  // useState initializers below — synchronously on the first render — so the chosen question is in
  // place immediately rather than depending on an effect that can lose the race (or a StrictMode
  // remount) and fall back to a bank question.
  const launch = readPlanLaunch(location.state)

  const [state, dispatch] = useReducer(reducer, initialState)
  const [recordMode, setRecordMode] = useState<RecordMode>('audio')
  // How the candidate gives their answer: record audio/video (scored for delivery too) or type it.
  const [inputMethod, setInputMethod] = useState<'record' | 'write'>('record')
  const [promptId, setPromptId] = useState(launch?.startPromptId ?? DEFAULT_PROMPT.id)
  // An ad-hoc question launched from a prep-plan task for a round with no bank prompt (custom rounds
  // practice their own authored question). Takes precedence over the selected bank prompt until cleared.
  const [customPrompt, setCustomPrompt] = useState<Prompt | null>(() => launchPrompt(launch))
  // User-authored questions (LLM-generated on demand), server-durable with a localStorage cache. Seeded
  // synchronously from the cache; hydrated from the server on mount.
  const [customQuestions, setCustomQuestions] = useState<Prompt[]>(loadCustomPrompts)
  const [mode, setMode] = useState<BehavioralMode>('interview')
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  // The target job this practice was launched for (from a round's plan), or null for open practice.
  // When set, grading also rates the answer's fit to that company/JD bar.
  const [targetJob, setTargetJob] = useState<ParsedJob | null>(null)
  // Live streamed grading progress (phase + partial grade + instant filler count), reset each grade.
  const [gradeProgress, setGradeProgress] = useState<GradeProgress>({})
  // Who's running this round — shapes the follow-ups. A recruiter never asks technical questions.
  // Defaults to a hiring manager (open practice from the nav, unchanged from before).
  const [persona, setPersona] = useState<InterviewerPersona>(launch?.persona ?? 'hiring_manager')
  // First-hand intel about this interviewer (the round's notes) — biases the follow-ups toward
  // what they actually focus on. Empty for open practice.
  const [interviewerContext, setInterviewerContext] = useState(launch?.interviewerContext ?? '')
  const abortRef = useRef<AbortController | null>(null)

  // Load the resume + target level once; interview mode uses them to calibrate follow-ups.
  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

  // Refresh saved custom questions from the server (durable copy may hold items not in this cache).
  useEffect(() => {
    void hydrateCustomPrompts().then(setCustomQuestions)
  }, [])

  // Celebrate a freshly graded answer (grading → done). Guarded by the prior phase so reopening a
  // past session from History (which hydrates straight into 'done') doesn't re-fire the confetti.
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (state.phase === 'done' && prevPhaseRef.current === 'grading') {
      celebrateBig()
      track('session_completed', { kind: 'behavioral', level: state.session?.feedback?.level?.level ?? null })
    }
    prevPhaseRef.current = state.phase
  }, [state.phase])

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

  // The question/persona/context above are applied synchronously via the useState initializers. This
  // effect only handles the side effects of a plan launch: loading the target job (async), resetting
  // any prior session, re-applying if the user re-navigates here while already mounted, and clearing the
  // consumed router state so a plain refresh doesn't re-apply it.
  const launchKey = launch ? `${launch.startPromptId ?? ''}|${launch.jobId ?? ''}|${launch.startPrompt?.text ?? ''}` : ''
  useEffect(() => {
    if (!launch) return
    setCustomPrompt(launchPrompt(launch))
    if (launch.startPromptId) setPromptId(launch.startPromptId)
    if (launch.persona) setPersona(launch.persona)
    if (launch.interviewerContext) setInterviewerContext(launch.interviewerContext)
    dispatch({ type: 'RESET' })
    if (launch.jobId) void getJob(launch.jobId).then((j) => setTargetJob(j?.parsed ?? null))
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchKey])

  const prompt =
    customPrompt ??
    customQuestions.find((p) => p.id === promptId) ??
    PROMPTS.find((p) => p.id === promptId) ??
    DEFAULT_PROMPT
  const busy = state.phase === 'transcribing' || state.phase === 'followups_generating' || state.phase === 'grading'

  function handleSelectPrompt(id: string) {
    // Picking a real bank OR saved custom question clears any ad-hoc launch prompt; re-picking the
    // "This round" option (an id in neither list) is a no-op so the launch question stays put.
    if (!PROMPTS.some((p) => p.id === id) && !customQuestions.some((p) => p.id === id)) return
    setCustomPrompt(null)
    setPromptId(id)
    if (state.phase !== 'idle') dispatch({ type: 'RESET' })
  }

  // Author a new behavioral question on demand, persist it, and select it for practice.
  async function handleGenerate(spec: GenSpec) {
    const question = await generateBehavioralQuestion({ prompt: spec.prompt, focus: spec.focus || undefined })
    addCustomPrompt(question)
    setCustomQuestions((prev) => [question, ...prev.filter((p) => p.id !== question.id)])
    setCustomPrompt(null)
    setPromptId(question.id)
    if (state.phase !== 'idle') dispatch({ type: 'RESET' })
  }

  function handleDeleteCustom(id: string) {
    deleteCustomPrompt(id)
    setCustomQuestions((prev) => prev.filter((p) => p.id !== id))
    // If the deleted question was selected, fall back to the default bank prompt.
    if (promptId === id) setPromptId(DEFAULT_PROMPT.id)
  }

  // The interviewer probes before we grade. If generation fails, fall through to the follow-up phase
  // with no questions — you can still grade the main answer alone. Shared by the audio and text paths.
  async function generateAndSetFollowups(transcript: Transcript, signal: AbortSignal) {
    try {
      const followups = await generateFollowups({
        question: prompt.text,
        transcript,
        resume: profile.resumeText,
        targetLevel: profile.targetLevel,
        persona,
        interviewerContext,
        signal,
      })
      dispatch({ type: 'FOLLOWUPS', followups })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'FOLLOWUPS', followups: [] })
    }
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
      await generateAndSetFollowups(transcript, controller.signal)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'ERROR', error: (e as Error)?.message || 'Something went wrong.' })
    } finally {
      abortRef.current = null
    }
  }

  // A typed answer: no recording/transcription — feed the text straight into the same pipeline. Only
  // needs the Anthropic key (follow-ups + grading), not OpenAI (which is transcription-only).
  async function handleUseText(text: string) {
    if (!hasAnthropic) {
      onNeedKeys?.()
      return
    }
    const transcript: Transcript = { text: text.trim(), durationSec: null }
    if (!transcript.text) return
    dispatch({ type: 'START_TEXT', transcript })

    const controller = new AbortController()
    abortRef.current = controller
    try {
      await generateAndSetFollowups(transcript, controller.signal)
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
    setGradeProgress({})
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
        // When launched from a round's plan, grade fit to that company/JD bar too (either mode).
        job: targetJob,
        // Coaching mode gets the verbatim "say it like this" script, built from the answer itself.
        coaching: mode === 'coaching',
        signal: controller.signal,
        // Stream the grade so the UI fills in progressively (see GradingProgress).
        onFiller: (filler) => setGradeProgress((g) => ({ ...g, filler })),
        onGrade: (ev) =>
          setGradeProgress((g) => ({
            ...g,
            phase: ev.phase ?? g.phase,
            partial: ev.partial ?? g.partial,
          })),
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
        <div>
          <PromptCard
            prompt={prompt}
            onSelect={handleSelectPrompt}
            disabled={busy}
            interviewMode={mode === 'interview'}
            customPrompts={customQuestions}
            onDeleteCustom={handleDeleteCustom}
          />
          {state.phase === 'idle' && (
            <ProblemGenerator
              noun="behavioral question"
              hasKeys={hasAnthropic}
              onNeedKeys={onNeedKeys}
              onGenerate={handleGenerate}
              difficulties={[]}
              focusLabel="Competency"
              focusPlaceholder="Competency (optional), e.g. Leadership"
              promptPlaceholder="e.g. Tell me about a time you turned around an underperforming team member — or paste a question you were actually asked"
              description="Describe what you want to practice, or paste a question you were asked. It’s authored with prep guidance and runs the same follow-up and grading flow as a curated question."
              ctaLabel="Add & select"
              busyHint="Writing the question and its prep guidance…"
            />
          )}
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
                ? persona === 'recruiter'
                  ? 'A recruiter screen: follow-ups stay on motivation, fit, and logistics — no technical questions.'
                  : persona === 'leader'
                  ? 'A leadership round (CEO / head of engineering): follow-ups pressure-test conviction, judgment, and your point of view — not ownership drilling.'
                  : `The interviewer knows only your resume and holds you to a ${profile.targetLevel} bar — no story-bank feedback.`
                : 'Feedback critiques your telling against your confirmed stories (undersold impact, “we” vs “I”, a stronger example).'}
            </p>
          </div>
        )}

        {state.phase === 'idle' && mode === 'interview' && <RealismChecklist />}

        {state.phase === 'idle' && (
          <div className="space-y-3">
            <div className="inline-flex rounded-md border border-stone-200 p-0.5 text-sm">
              {(['record', 'write'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setInputMethod(m)}
                  disabled={busy}
                  className={`rounded px-3 py-1 capitalize disabled:opacity-50 ${
                    inputMethod === m ? 'bg-terracotta-600 text-white' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {m === 'record' ? 'Record' : 'Write'}
                </button>
              ))}
            </div>
            {inputMethod === 'record' ? (
              <Recorder mode={recordMode} onModeChange={setRecordMode} onUseTake={handleUseTake} disabled={busy} />
            ) : (
              <div className="space-y-1">
                <TextAnswerBox
                  onSubmit={handleUseText}
                  disabled={busy}
                  submitLabel="Use this answer"
                  placeholder="Type your answer the way you'd say it out loud…"
                />
                <p className="text-xs text-stone-400">
                  A typed answer is graded on content and structure. Delivery (pace, filler words) is only
                  scored for recorded takes.
                </p>
              </div>
            )}
          </div>
        )}

        {busy && state.phase !== 'grading' && (
          <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-8 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
            <p className="mt-3 text-sm text-stone-600">{STAGE_LABEL[state.phase]}</p>
            <p className="mt-1 text-xs text-stone-400">
              This sends your audio to OpenAI and Anthropic (via the backend) and usually takes 10–20s.
            </p>
          </div>
        )}

        {state.phase === 'grading' && (
          <GradingProgress phase={gradeProgress.phase} filler={gradeProgress.filler} partial={gradeProgress.partial} />
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
