import { useEffect, useReducer, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useApiKeys } from '../../context/ApiKeyContext'
import { celebrateBig } from '../../lib/ui/celebrate'
import { track } from '../../lib/metrics/events'
import { getBuildProblem, BUILD_PROBLEMS } from '../../data/build/problems'
import { BUILD_STAGES } from '../../data/build/stages'
import { dimensionLabel } from '../../data/build/rubric'
import {
  runBuildTurn,
  candidateDecisions,
  type Coverage,
  type PriorStage,
} from '../../lib/build/conversation'
import { generateBuildReport, type BuildReport, type BuildStageSessionInput } from '../../lib/build/report'
import {
  loadSession,
  persistSession,
  sanitize,
  type BuildSessionState as State,
  type BuildStageSession,
} from '../../lib/build/persistence'
import { saveSession, type SessionRecord } from '../../lib/sessionStore'
import ProblemPicker from '../sysdesign/ProblemPicker'
import StageTracker, { type StageStatus } from '../sysdesign/StageTracker'
import StageConversation from '../sysdesign/StageConversation'
import SysDesignReport from '../sysdesign/SysDesignReport'

// Orchestrates a Build-mode session: problem pick → a short PRIORITIZATION conversation, stage
// by stage → a leveling report scored against the five rubric dimensions. The candidate
// implements the challenge OFFLINE; there is no code pane here — the coach only pressure-tests
// how they plan and prioritize. Same persistence model as the system-design session
// (localStorage cache for instant resume + durable backend store for history), and it reuses
// that mode's conversation surface, stage tracker, and report renderer.

type Action =
  | { type: 'START'; problemId: string }
  | { type: 'CANDIDATE_TURN'; stageId: string; text: string }
  | { type: 'INTERVIEWER_TURN'; stageId: string; text: string; coverage: Coverage; aligned: boolean }
  | { type: 'TURN_ERROR'; error: string }
  | { type: 'ADVANCE' }
  | { type: 'REPORTING' }
  | { type: 'REPORT_DONE'; report: BuildReport }
  | { type: 'REPORT_ERROR'; error: string }
  | { type: 'HYDRATE'; state: State }
  | { type: 'RESET' }

const emptySession = (): BuildStageSession => ({ transcript: [], coverage: null, aligned: false })

const initialState: State = {
  id: '',
  createdAt: 0,
  phase: 'pick',
  problemId: null,
  currentIndex: 0,
  sessions: {},
  completed: {},
  thinking: false,
  report: null,
  error: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      return {
        ...initialState,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        phase: 'session',
        problemId: action.problemId,
        sessions: { [BUILD_STAGES[0].id]: emptySession() },
      }
    case 'CANDIDATE_TURN': {
      const s = state.sessions[action.stageId] || emptySession()
      return {
        ...state,
        thinking: true,
        error: null,
        sessions: {
          ...state.sessions,
          [action.stageId]: { ...s, transcript: [...s.transcript, { role: 'candidate', text: action.text }] },
        },
      }
    }
    case 'INTERVIEWER_TURN': {
      const s = state.sessions[action.stageId] || emptySession()
      return {
        ...state,
        thinking: false,
        sessions: {
          ...state.sessions,
          [action.stageId]: {
            ...s,
            transcript: [...s.transcript, { role: 'interviewer', text: action.text }],
            coverage: action.coverage,
            aligned: action.aligned,
          },
        },
      }
    }
    case 'TURN_ERROR':
      return { ...state, thinking: false, error: action.error }
    case 'ADVANCE': {
      const stage = BUILD_STAGES[state.currentIndex]
      const nextIndex = state.currentIndex + 1
      const next = BUILD_STAGES[nextIndex]
      return {
        ...state,
        currentIndex: nextIndex,
        completed: { ...state.completed, [stage.id]: true },
        sessions: { ...state.sessions, [next.id]: state.sessions[next.id] || emptySession() },
      }
    }
    case 'REPORTING':
      return { ...state, phase: 'reporting', error: null }
    case 'REPORT_DONE':
      return { ...state, phase: 'report', report: action.report }
    case 'REPORT_ERROR':
      return { ...state, phase: 'session', error: action.error }
    case 'HYDRATE':
      return action.state
    case 'RESET':
      return initialState
    default:
      return state
  }
}

function interviewerText(reply: string, followUps: string[]): string {
  if (!followUps?.length) return reply
  return `${reply}\n\n${followUps.map((q) => `• ${q}`).join('\n')}`
}

export default function BuildSession({ onNeedKeys }: { onNeedKeys?: () => void }) {
  const { hasAnthropic } = useApiKeys()
  const [state, dispatch] = useReducer(reducer, initialState, () => loadSession() ?? initialState)
  const abortRef = useRef<AbortController | null>(null)
  const location = useLocation()

  const problem = state.problemId ? getBuildProblem(state.problemId) : null

  // Reopen a past session passed from History via router state.
  const resume = (location.state as { session?: SessionRecord<State> } | null)?.session
  useEffect(() => {
    if (!resume) return
    const restored = sanitize(resume.payload)
    if (restored) dispatch({ type: 'HYDRATE', state: restored })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume?.id])

  // Mirror to localStorage on every change; RESET (→ 'pick') clears it.
  useEffect(() => persistSession(state), [state])

  // Celebrate when a fresh report lands (reporting → report). Guarded by the prior phase so
  // re-opening a completed session from History doesn't re-fire the confetti on mount.
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (state.phase === 'report' && prevPhaseRef.current === 'reporting') {
      celebrateBig()
      track('session_completed', { kind: 'build', level: state.report?.overall.level ?? null })
    }
    prevPhaseRef.current = state.phase
  }, [state.phase])

  // Mirror to the durable backend store. Debounce mid-session chatter; save a finished report
  // immediately. Nothing to persist on the picker.
  useEffect(() => {
    if (state.phase === 'pick' || !state.id) return
    const record = {
      id: state.id,
      kind: 'build' as const,
      status: (state.phase === 'report' ? 'completed' : 'in_progress') as 'completed' | 'in_progress',
      title: problem?.title ?? 'Build',
      level: state.report?.overall.level ?? null,
      payload: state,
    }
    if (state.phase === 'report') {
      void saveSession(record)
      return
    }
    const t = setTimeout(() => void saveSession(record), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const stage = BUILD_STAGES[state.currentIndex]
  const isLastStage = state.currentIndex >= BUILD_STAGES.length - 1
  const session = stage ? state.sessions[stage.id] || emptySession() : emptySession()

  const statusById = BUILD_STAGES.reduce<Record<string, StageStatus>>((acc, s) => {
    acc[s.id] = (state.completed[s.id] ? 'done' : s.id === stage?.id ? 'current' : 'upcoming') as StageStatus
    return acc
  }, {})

  async function handleSubmit(text: string) {
    if (!hasAnthropic || !problem) {
      onNeedKeys?.()
      return
    }
    const stageId = stage.id
    const prior = state.sessions[stageId]?.transcript || []
    const priorStages: PriorStage[] = BUILD_STAGES.slice(0, state.currentIndex)
      .map((s): PriorStage | null => {
        const sess = state.sessions[s.id]
        if (!sess) return null
        return { label: s.label, decisions: candidateDecisions(sess.transcript) }
      })
      .filter((p): p is PriorStage => p !== null)
    dispatch({ type: 'CANDIDATE_TURN', stageId, text })

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runBuildTurn({
        problem,
        stage,
        transcript: prior,
        priorStages,
        message: text,
        signal: controller.signal,
      })
      dispatch({
        type: 'INTERVIEWER_TURN',
        stageId,
        text: interviewerText(result.reply, result.followUps),
        coverage: result.coverage,
        aligned: result.aligned,
      })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'TURN_ERROR', error: (e as Error)?.message || 'The interviewer could not respond. Try again.' })
    } finally {
      abortRef.current = null
    }
  }

  async function finishAndReport() {
    if (!problem) return
    dispatch({ type: 'REPORTING' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const stageSessions: BuildStageSessionInput[] = BUILD_STAGES.filter((s) => state.sessions[s.id]).map((s) => ({
        stageId: s.id,
        label: s.label,
        transcript: state.sessions[s.id]?.transcript || [],
        coverage: state.sessions[s.id]?.coverage || null,
      }))
      const report = await generateBuildReport({
        problem,
        stageSessions,
        signal: controller.signal,
      })
      dispatch({ type: 'REPORT_DONE', report })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'REPORT_ERROR', error: (e as Error)?.message || 'Could not generate the report. Try again.' })
    } finally {
      abortRef.current = null
    }
  }

  function handleAdvance() {
    if (isLastStage) finishAndReport()
    else dispatch({ type: 'ADVANCE' })
  }

  function handleReset() {
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }

  if (state.phase === 'pick') {
    return (
      <ProblemPicker
        problems={BUILD_PROBLEMS}
        heading="Pick a build challenge"
        intro="A prioritization coach for timed, AI-assisted build challenges. You implement the challenge offline; here you talk through how you'd scope and prioritize it, and the coach pressure-tests your plan. At the end you get a leveling read (mid / senior / staff) scored on scoping, a running core, the security risk, code quality, and how you'd use the AI."
        onStart={(id) => dispatch({ type: 'START', problemId: id })}
      />
    )
  }

  if (state.phase === 'report' && problem) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-400">Prioritization report</div>
          <div className="text-base font-semibold text-stone-900">{problem.title}</div>
          <p className="mt-1 text-xs text-stone-500">
            Scored on the five rubric dimensions — weighted toward scoping and a running core.
          </p>
        </div>
        <SysDesignReport report={state.report} onRestart={handleReset} stageLabel={dimensionLabel} />
      </div>
    )
  }

  if (!problem) return null

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400">Build challenge</div>
              <div className="text-sm font-semibold text-stone-900">{problem.title}</div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="shrink-0 rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              End session
            </button>
          </div>
          <p className="mt-2 text-sm text-stone-600">{problem.statement}</p>
          <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            You implement this offline, timed. Here, talk through how you’d prioritize — the coach
            grades the plan, not code.
          </p>
        </div>

        {state.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
        )}

        {state.phase === 'reporting' ? (
          <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-8 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
            <p className="mt-3 text-sm text-stone-600">Grading the full session…</p>
          </div>
        ) : (
          <StageConversation
            stage={stage}
            transcript={session.transcript}
            aligned={session.aligned}
            thinking={state.thinking}
            onSubmit={handleSubmit}
            onAdvance={handleAdvance}
            onSkip={handleAdvance}
            isLastStage={isLastStage}
          />
        )}
      </div>

      <aside>
        <StageTracker
          currentStageId={stage.id}
          statusById={statusById}
          stages={BUILD_STAGES}
          heading="Planning stages"
        />
      </aside>
    </div>
  )
}
