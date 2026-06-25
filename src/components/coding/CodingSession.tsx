import { useEffect, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApiKeys } from '../../context/ApiKeyContext'
import { celebrateBig } from '../../lib/ui/celebrate'
import { track } from '../../lib/metrics/events'
import { getProblem, PROBLEMS } from '../../data/coding/problems'
import {
  loadCustomCodingProblems,
  hydrateCustomCodingProblems,
  addCustomCodingProblem,
  deleteCustomCodingProblem,
} from '../../lib/coding/customProblems'
import { generateCodingProblem, type CodingProblemSpec } from '../../lib/coding/generateProblem'
import ProblemGenerator, { type GenSpec } from '../ProblemGenerator'
import { STAGES, getStage, type CodeLanguage } from '../../data/coding/stages'
import { runStageTurn, candidateDecisions, type Coverage, type PriorStage } from '../../lib/coding/conversation'
import { generateReport, type CodingReport, type CodingStageSessionInput } from '../../lib/coding/report'
import {
  loadSession,
  persistSession,
  sanitize,
  type Completion,
  type SessionState as State,
  type StageSession,
} from '../../lib/coding/persistence'
import { saveSession, type SessionRecord } from '../../lib/sessionStore'
import ProblemPicker from '../sysdesign/ProblemPicker'
import InterviewSetup from '../interview/InterviewSetup'
import { DEFAULT_INTERVIEW_CONFIG, type InterviewConfig } from '../../lib/interview/persona'
import StageTracker, { type StageStatus } from '../sysdesign/StageTracker'
import StageConversation from '../sysdesign/StageConversation'
import SysDesignReport from '../sysdesign/SysDesignReport'
import CodeComposer from './CodeComposer'

// Orchestrates a full coding (DSA) interview: problem pick → stage-by-stage conversation (with a code
// editor on the IMPLEMENT stage) → final leveling report. Mirrors SystemDesignSession 1:1 and reuses
// its stage UI + report renderer; the only coding-specific surface is the code editor and the code/
// language buffer threaded through state so it restores on reload.

const CODE_STAGE = 'code'

// Curated problems shaped for the picker, exposing each problem's `topics` as filterable tags. The
// static library is computed once; user-generated problems are merged in from component state so the
// list updates the moment one is authored or deleted.
const CURATED_PICKER_PROBLEMS = PROBLEMS.map((p) => ({
  id: p.id,
  title: p.title,
  difficulty: p.difficulty,
  statement: p.statement,
  tags: p.topics,
}))

type Action =
  | { type: 'START'; problemId: string; config: InterviewConfig }
  | { type: 'CANDIDATE_TURN'; stageId: string; text: string }
  | { type: 'INTERVIEWER_TURN'; stageId: string; text: string; coverage: Coverage; aligned: boolean }
  | { type: 'TURN_ERROR'; error: string }
  | { type: 'ADVANCE'; how: Completion }
  | { type: 'SET_CODE'; code: string }
  | { type: 'SET_LANGUAGE'; language: CodeLanguage }
  | { type: 'REPORTING' }
  | { type: 'REPORT_DONE'; report: CodingReport }
  | { type: 'REPORT_ERROR'; error: string }
  | { type: 'HYDRATE'; state: State }
  | { type: 'RESET' }

const emptySession = (): StageSession => ({ transcript: [], coverage: null, aligned: false })

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
  language: 'python',
  code: '',
  config: DEFAULT_INTERVIEW_CONFIG,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      return {
        ...initialState,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        phase: 'interview',
        problemId: action.problemId,
        config: action.config,
        sessions: { [STAGES[0].id]: emptySession() },
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
      const stage = STAGES[state.currentIndex]
      const nextIndex = state.currentIndex + 1
      const next = STAGES[nextIndex]
      return {
        ...state,
        currentIndex: nextIndex,
        completed: { ...state.completed, [stage.id]: action.how },
        sessions: { ...state.sessions, [next.id]: state.sessions[next.id] || emptySession() },
      }
    }
    case 'SET_CODE':
      return { ...state, code: action.code }
    case 'SET_LANGUAGE':
      return { ...state, language: action.language }
    case 'REPORTING':
      return { ...state, phase: 'reporting', error: null }
    case 'REPORT_DONE':
      return { ...state, phase: 'report', report: action.report }
    case 'REPORT_ERROR':
      return { ...state, phase: 'interview', error: action.error }
    case 'HYDRATE':
      return action.state
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// Interviewer turns carry both the brief reply and the follow-up questions in one message.
function interviewerText(reply: string, followUps: string[]): string {
  if (!followUps?.length) return reply
  return `${reply}\n\n${followUps.map((q) => `• ${q}`).join('\n')}`
}

const INTRO =
  'A focused coding screen, stage by stage: clarify → brute force → optimal approach → implement → test. The interviewer probes with follow-ups; at the end you get a leveling read (mid / senior / staff).'

export default function CodingSession({ onNeedKeys }: { onNeedKeys?: () => void }) {
  const { hasAnthropic } = useApiKeys()
  const [state, dispatch] = useReducer(reducer, initialState, () => loadSession() ?? initialState)
  // User-generated problems (on-demand), loaded from the on-device store and kept in sync with it.
  const [customProblems, setCustomProblems] = useState(loadCustomCodingProblems)
  // Pre-interview dials (target level + interviewer style), chosen on the pick screen and frozen
  // into session state at START.
  const [setupConfig, setSetupConfig] = useState<InterviewConfig>(DEFAULT_INTERVIEW_CONFIG)
  const abortRef = useRef<AbortController | null>(null)
  const location = useLocation()

  const problem = state.problemId ? getProblem(state.problemId) : null

  // Reopen a past session passed from History via router state.
  const resume = (location.state as { session?: SessionRecord<State> } | null)?.session
  useEffect(() => {
    if (!resume) return
    const restored = sanitize(resume.payload)
    if (restored) dispatch({ type: 'HYDRATE', state: restored })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume?.id])

  // Start a fresh interview for a problem chosen from a target job's plan (Prep → Match → Practice).
  const startProblemId = (location.state as { startProblemId?: string } | null)?.startProblemId
  useEffect(() => {
    if (!startProblemId) return
    dispatch({ type: 'START', problemId: startProblemId, config: setupConfig })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startProblemId])

  // Refresh the on-demand problem cache from Postgres once on mount (durable copy / cross-device).
  useEffect(() => {
    void hydrateCustomCodingProblems().then(setCustomProblems)
  }, [])

  // Mirror to localStorage (instant cache) on every change; RESET (→ 'pick') clears it.
  useEffect(() => persistSession(state), [state])

  // Celebrate when a fresh report lands (reporting → report). Guarded by the prior phase so
  // re-opening a completed session from History doesn't re-fire the confetti on mount.
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (state.phase === 'report' && prevPhaseRef.current === 'reporting') {
      celebrateBig()
      track('session_completed', { kind: 'coding', level: state.report?.overall.level ?? null })
    }
    prevPhaseRef.current = state.phase
  }, [state.phase])

  // Mirror to the durable backend store. Debounce mid-interview chatter; save a finished report now.
  useEffect(() => {
    if (state.phase === 'pick' || !state.id) return
    const record = {
      id: state.id,
      kind: 'coding' as const,
      status: (state.phase === 'report' ? 'completed' : 'in_progress') as 'completed' | 'in_progress',
      title: problem?.title ?? 'Coding',
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

  const stage = STAGES[state.currentIndex]
  const isLastStage = state.currentIndex >= STAGES.length - 1
  const session = stage ? state.sessions[stage.id] || emptySession() : emptySession()

  const statusById = STAGES.reduce<Record<string, StageStatus>>((acc, s) => {
    acc[s.id] = state.completed[s.id] || (s.id === stage?.id ? 'current' : 'upcoming')
    return acc
  }, {})

  async function handleSubmit(text: string) {
    if (!hasAnthropic || !problem) {
      onNeedKeys?.()
      return
    }
    const stageId = stage.id
    const prior = state.sessions[stageId]?.transcript || []
    const priorStages: PriorStage[] = STAGES.slice(0, state.currentIndex)
      .map((s): PriorStage | null => {
        const sess = state.sessions[s.id]
        if (!sess && state.completed[s.id] !== 'skipped') return null
        return { label: s.label, decisions: candidateDecisions(sess?.transcript || []) }
      })
      .filter((p): p is PriorStage => p !== null)
    dispatch({ type: 'CANDIDATE_TURN', stageId, text })

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runStageTurn({ problem, stage, transcript: prior, priorStages, message: text, config: state.config, signal: controller.signal })
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

  // The IMPLEMENT stage submits the code buffer as a fenced block — same turn pipeline as text.
  function handleSubmitCode() {
    const code = state.code.trim()
    if (!code) return
    void handleSubmit(`Here's my ${state.language} solution:\n\n\`\`\`${state.language}\n${code}\n\`\`\``)
  }

  async function finishAndReport(completed: Record<string, Completion>) {
    if (!problem) return
    dispatch({ type: 'REPORTING' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const stageSessions: CodingStageSessionInput[] = STAGES.filter((s) => state.sessions[s.id] || completed[s.id]).map((s) => ({
        stageId: s.id,
        label: s.label,
        transcript: state.sessions[s.id]?.transcript || [],
        coverage: state.sessions[s.id]?.coverage || null,
        skipped: completed[s.id] === 'skipped',
      }))
      const report = await generateReport({ problem, stageSessions, targetLevel: state.config.targetLevel, signal: controller.signal })
      dispatch({ type: 'REPORT_DONE', report })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'REPORT_ERROR', error: (e as Error)?.message || 'Could not generate the report. Try again.' })
    } finally {
      abortRef.current = null
    }
  }

  function handleAdvance(how: Completion = 'done') {
    if (isLastStage) finishAndReport({ ...state.completed, [stage.id]: how })
    else dispatch({ type: 'ADVANCE', how })
  }

  function handleReset() {
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }

  // Author a new problem on demand, persist it, and drop straight into the interview.
  async function handleGenerate(spec: GenSpec) {
    const req: CodingProblemSpec = {
      prompt: spec.prompt,
      topic: spec.focus || undefined,
      difficulty: (spec.difficulty as CodingProblemSpec['difficulty']) || '',
    }
    const problem = await generateCodingProblem(req)
    addCustomCodingProblem(problem)
    setCustomProblems((prev) => [problem, ...prev.filter((p) => p.id !== problem.id)])
    dispatch({ type: 'START', problemId: problem.id, config: setupConfig })
  }

  function handleDeleteProblem(id: string) {
    deleteCustomCodingProblem(id)
    setCustomProblems((prev) => prev.filter((p) => p.id !== id))
  }

  if (state.phase === 'pick') {
    const pickerProblems = [
      ...customProblems.map((p) => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        statement: p.statement,
        tags: p.topics,
        custom: true,
      })),
      ...CURATED_PICKER_PROBLEMS,
    ]
    return (
      <ProblemPicker
        onStart={(id) => dispatch({ type: 'START', problemId: id, config: setupConfig })}
        problems={pickerProblems}
        heading="Pick a coding problem"
        intro={INTRO}
        setup={<InterviewSetup value={setupConfig} onChange={setSetupConfig} />}
        onDelete={handleDeleteProblem}
        generator={
          <ProblemGenerator
            noun="coding problem"
            hasKeys={hasAnthropic}
            onNeedKeys={onNeedKeys}
            onGenerate={handleGenerate}
            difficulties={['Easy', 'Medium', 'Hard']}
            focusLabel="DSA pattern"
            focusPlaceholder="Pattern (optional), e.g. sliding window"
            promptPlaceholder="e.g. A medium graph problem about detecting cycles in a build dependency graph"
          />
        }
      />
    )
  }

  if (state.phase === 'report' && problem) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-400">Interview report</div>
          <div className="text-base font-semibold text-stone-900">{problem.title}</div>
        </div>
        <SysDesignReport report={state.report} onRestart={handleReset} stageLabel={(id) => getStage(id).label} />
      </div>
    )
  }

  if (!problem) return null

  const codeComposer =
    stage.id === CODE_STAGE ? (
      <CodeComposer
        code={state.code}
        language={state.language}
        onCodeChange={(code) => dispatch({ type: 'SET_CODE', code })}
        onLanguageChange={(language) => dispatch({ type: 'SET_LANGUAGE', language })}
        onSubmit={handleSubmitCode}
        disabled={state.thinking}
      />
    ) : undefined

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400">Problem</div>
              <div className="text-sm font-semibold text-stone-900">{problem.title}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                End interview
              </button>
              <span className="text-[11px] text-stone-400" title="Saved on this device and to the backend — resumes after a reload.">
                ✓ Progress saved
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-stone-600">{problem.statement}</p>
          {problem.examples.length > 0 && (
            <div className="mt-2 space-y-1">
              {problem.examples.map((ex, i) => (
                <div key={i} className="rounded-md bg-stone-50 px-2.5 py-1.5 text-xs text-stone-600">
                  <span className="font-medium text-stone-700">In:</span> {ex.input}{'  '}
                  <span className="font-medium text-stone-700">Out:</span> {ex.output}
                  {ex.explanation && <div className="text-stone-500">{ex.explanation}</div>}
                </div>
              ))}
            </div>
          )}
          {problem.constraints.length > 0 && (
            <p className="mt-2 text-[11px] text-stone-400">Constraints: {problem.constraints.join(' · ')}</p>
          )}
        </div>

        {state.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
        )}

        {state.phase === 'reporting' ? (
          <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-8 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
            <p className="mt-3 text-sm text-stone-600">Grading the full interview…</p>
          </div>
        ) : (
          <StageConversation
            stage={stage}
            transcript={session.transcript}
            aligned={session.aligned}
            thinking={state.thinking}
            onSubmit={handleSubmit}
            onAdvance={() => handleAdvance('done')}
            onSkip={() => handleAdvance('skipped')}
            isLastStage={isLastStage}
            composer={codeComposer}
          />
        )}
      </div>

      <aside>
        <StageTracker currentStageId={stage.id} statusById={statusById} stages={STAGES} heading="Coding stages" />
      </aside>
    </div>
  )
}
