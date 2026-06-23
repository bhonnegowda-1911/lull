import { useEffect, useReducer, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useApiKeys } from '../../context/ApiKeyContext'
import { getProblem } from '../../data/sysdesign/problems'
import { STAGES } from '../../data/sysdesign/stages'
import {
  runStageTurn,
  candidateDecisions,
  type Coverage,
  type PriorStage,
} from '../../lib/sysdesign/conversation'
import { generateReport, type SysDesignReport as SysDesignReportData, type StageSessionInput } from '../../lib/sysdesign/report'
import {
  loadSession,
  persistSession,
  sanitize,
  type Completion,
  type SessionState as State,
  type StageSession,
} from '../../lib/sysdesign/persistence'
import { saveSession, type SessionRecord } from '../../lib/sessionStore'
import { uploadAsset, assetUrl } from '../../lib/assetStore'
import ProblemPicker from './ProblemPicker'
import StageTracker, { type StageStatus } from './StageTracker'
import StageConversation from './StageConversation'
import SysDesignReport from './SysDesignReport'

// Orchestrates a full system-design interview: problem pick → stage-by-stage multi-turn
// conversation → final leveling report. State is mirrored to localStorage (instant resume)
// and to the backend session store (durable history + cross-device). Candidates can attach
// images/video (e.g. whiteboard diagrams), stored as assets and referenced by the payload.

type Action =
  | { type: 'START'; problemId: string }
  | { type: 'CANDIDATE_TURN'; stageId: string; text: string }
  | { type: 'INTERVIEWER_TURN'; stageId: string; text: string; coverage: Coverage; aligned: boolean }
  | { type: 'TURN_ERROR'; error: string }
  | { type: 'ADVANCE'; how: Completion }
  | { type: 'REPORTING' }
  | { type: 'REPORT_DONE'; report: SysDesignReportData }
  | { type: 'REPORT_ERROR'; error: string }
  | { type: 'ADD_ATTACHMENT'; assetId: string }
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
  attachments: [],
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
    case 'REPORTING':
      return { ...state, phase: 'reporting', error: null }
    case 'REPORT_DONE':
      return { ...state, phase: 'report', report: action.report }
    case 'REPORT_ERROR':
      return { ...state, phase: 'interview', error: action.error }
    case 'ADD_ATTACHMENT':
      return { ...state, attachments: [...(state.attachments || []), action.assetId] }
    case 'HYDRATE':
      return action.state
    case 'RESET':
      return initialState
    default:
      return state
  }
}

// Interviewer turns carry both the brief reply and the follow-up questions in one message,
// so the transcript is complete both for display and for the next turn's LLM context.
function interviewerText(reply: string, followUps: string[]): string {
  if (!followUps?.length) return reply
  return `${reply}\n\n${followUps.map((q) => `• ${q}`).join('\n')}`
}

export default function SystemDesignSession({ onNeedKeys }: { onNeedKeys?: () => void }) {
  const { hasAnthropic } = useApiKeys()
  // Rehydrate any in-progress interview cached on this device for instant resume.
  const [state, dispatch] = useReducer(reducer, initialState, () => loadSession() ?? initialState)
  const abortRef = useRef<AbortController | null>(null)
  const location = useLocation()

  const problem = state.problemId ? getProblem(state.problemId) : null

  // Reopen a past session passed from History (durable backend copy) via router state.
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
    dispatch({ type: 'START', problemId: startProblemId })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startProblemId])

  // Mirror to localStorage (instant cache) on every change; RESET (→ 'pick') clears it.
  useEffect(() => persistSession(state), [state])

  // Mirror to the durable backend store. Debounce mid-interview chatter; save a finished
  // report immediately. Nothing to persist on the picker.
  useEffect(() => {
    if (state.phase === 'pick' || !state.id) return
    const record = {
      id: state.id,
      kind: 'sysdesign' as const,
      status: (state.phase === 'report' ? 'completed' : 'in_progress') as 'completed' | 'in_progress',
      title: problem?.title ?? 'System design',
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
      const result = await runStageTurn({
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

  async function finishAndReport(completed: Record<string, Completion>) {
    if (!problem) return
    dispatch({ type: 'REPORTING' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const stageSessions: StageSessionInput[] = STAGES.filter(
        (s) => state.sessions[s.id] || completed[s.id],
      ).map((s) => ({
        stageId: s.id,
        label: s.label,
        transcript: state.sessions[s.id]?.transcript || [],
        coverage: state.sessions[s.id]?.coverage || null,
        skipped: completed[s.id] === 'skipped',
      }))
      const report = await generateReport({ problem, stageSessions, signal: controller.signal })
      dispatch({ type: 'REPORT_DONE', report })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      dispatch({ type: 'REPORT_ERROR', error: (e as Error)?.message || 'Could not generate the report. Try again.' })
    } finally {
      abortRef.current = null
    }
  }

  function handleAdvance(how: Completion = 'done') {
    if (isLastStage) {
      finishAndReport({ ...state.completed, [stage.id]: how })
    } else {
      dispatch({ type: 'ADVANCE', how })
    }
  }

  async function handleAttach(file: File) {
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    const uploaded = await uploadAsset(file, { kind, sessionId: state.id, filename: file.name })
    if (uploaded) dispatch({ type: 'ADD_ATTACHMENT', assetId: uploaded.id })
  }

  function handleReset() {
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }

  if (state.phase === 'pick') {
    return <ProblemPicker onStart={(id) => dispatch({ type: 'START', problemId: id })} />
  }

  if (state.phase === 'report' && problem) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-stone-400">Interview report</div>
          <div className="text-base font-semibold text-stone-900">{problem.title}</div>
        </div>
        <Attachments ids={state.attachments || []} />
        <SysDesignReport report={state.report} onRestart={handleReset} />
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
              <span className="text-[11px] text-stone-400" title="Saved on this device and to the backend — resumes after a reload or cache clear.">
                ✓ Progress saved
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-stone-600">{problem.statement}</p>

          <AttachmentBar ids={state.attachments || []} onAttach={handleAttach} />
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
          />
        )}
      </div>

      <aside>
        <StageTracker currentStageId={stage.id} statusById={statusById} />
      </aside>
    </div>
  )
}

// Attachment thumbnails (images render inline; video gets a small player). Read-only.
function Attachments({ ids }: { ids: string[] }) {
  if (!ids.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <a key={id} href={assetUrl(id)} target="_blank" rel="noreferrer" className="block">
          <img src={assetUrl(id)} alt="attachment" className="h-20 w-20 rounded-md border border-stone-200 object-cover" />
        </a>
      ))}
    </div>
  )
}

// Upload control + thumbnails shown during the interview.
function AttachmentBar({ ids, onAttach }: { ids: string[]; onAttach: (file: File) => void }) {
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-stone-500">Diagrams / attachments</span>
        <label className="cursor-pointer rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50">
          + Add image/video
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onAttach(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {ids.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ids.map((id) => (
            <a key={id} href={assetUrl(id)} target="_blank" rel="noreferrer">
              <img src={assetUrl(id)} alt="attachment" className="h-16 w-16 rounded-md border border-stone-200 object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
