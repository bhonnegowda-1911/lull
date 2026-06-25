import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApiKeys } from '../../context/ApiKeyContext'
import { celebrateBig } from '../../lib/ui/celebrate'
import { track } from '../../lib/metrics/events'
import { getProblem, PROBLEMS } from '../../data/sysdesign/problems'
import {
  loadCustomSysDesignProblems,
  hydrateCustomSysDesignProblems,
  addCustomSysDesignProblem,
  deleteCustomSysDesignProblem,
} from '../../lib/sysdesign/customProblems'
import { generateSysDesignProblem, type SysDesignProblemSpec } from '../../lib/sysdesign/generateProblem'
import ProblemGenerator, { type GenSpec } from '../ProblemGenerator'
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
  type WhiteboardScene,
  type VoiceClip,
} from '../../lib/sysdesign/persistence'
import { speechMetrics } from '../../lib/sysdesign/speech'
import { sceneToPngBase64 } from '../../lib/sysdesign/whiteboardImage'
import { saveSession, type SessionRecord } from '../../lib/sessionStore'
import { uploadAsset, assetUrl } from '../../lib/assetStore'
import InterviewSetup from '../interview/InterviewSetup'
import { DEFAULT_INTERVIEW_CONFIG, type InterviewConfig } from '../../lib/interview/persona'
import ProblemPicker from './ProblemPicker'
import StageTracker, { type StageStatus } from './StageTracker'
import StageConversation from './StageConversation'
import SysDesignReport from './SysDesignReport'
import MicButton from '../MicButton'

// Excalidraw is heavy; load it (and its CSS) only when the candidate opens the whiteboard.
const Whiteboard = lazy(() => import('./Whiteboard'))

// Orchestrates a full system-design interview: problem pick → stage-by-stage multi-turn
// conversation → final leveling report. State is mirrored to localStorage (instant resume)
// and to the backend session store (durable history + cross-device). Candidates can attach
// images/video (e.g. whiteboard diagrams), stored as assets and referenced by the payload.

type Action =
  | { type: 'START'; problemId: string; config: InterviewConfig }
  | { type: 'CANDIDATE_TURN'; stageId: string; text: string }
  | { type: 'INTERVIEWER_TURN'; stageId: string; text: string; coverage: Coverage; aligned: boolean }
  | { type: 'TURN_ERROR'; error: string }
  | { type: 'ADVANCE'; how: Completion }
  | { type: 'REPORTING' }
  | { type: 'REPORT_DONE'; report: SysDesignReportData }
  | { type: 'REPORT_ERROR'; error: string }
  | { type: 'ADD_ATTACHMENT'; assetId: string }
  | { type: 'ADD_VOICE_CLIP'; clip: VoiceClip }
  | { type: 'SET_WHITEBOARD'; scene: WhiteboardScene }
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
  whiteboard: null,
  voiceClips: [],
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
    case 'REPORTING':
      return { ...state, phase: 'reporting', error: null }
    case 'REPORT_DONE':
      return { ...state, phase: 'report', report: action.report, completedAt: Date.now() }
    case 'REPORT_ERROR':
      return { ...state, phase: 'interview', error: action.error }
    case 'ADD_ATTACHMENT':
      return { ...state, attachments: [...(state.attachments || []), action.assetId] }
    case 'ADD_VOICE_CLIP':
      return { ...state, voiceClips: [...(state.voiceClips || []), action.clip] }
    case 'SET_WHITEBOARD':
      return { ...state, whiteboard: action.scene }
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
  // User-generated problems (on-demand), loaded from the on-device store and kept in sync with it.
  const [customProblems, setCustomProblems] = useState(loadCustomSysDesignProblems)
  // Pre-interview dials (target level + interviewer style), chosen on the pick screen and frozen
  // into session state at START.
  const [setupConfig, setSetupConfig] = useState<InterviewConfig>(DEFAULT_INTERVIEW_CONFIG)
  // The current answer draft, lifted so the maximized whiteboard's floating mic can narrate
  // into the same answer the composer is editing (talk while you draw, like a real round).
  const [draft, setDraft] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  // Signature of the whiteboard the last time we attached it to a turn, so we only re-export and
  // re-send the (token-heavy) image when the diagram actually changed. Reset per session below.
  const lastSentBoardRef = useRef<string>('')
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
    dispatch({ type: 'START', problemId: startProblemId, config: setupConfig })
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startProblemId])

  // Refresh the on-demand problem cache from Postgres once on mount (durable copy / cross-device).
  useEffect(() => {
    void hydrateCustomSysDesignProblems().then(setCustomProblems)
  }, [])

  // New session (start/resume/reset) → forget what board we last sent, so the first turn ships it.
  useEffect(() => {
    lastSentBoardRef.current = ''
  }, [state.id])

  // Mirror to localStorage (instant cache) on every change; RESET (→ 'pick') clears it.
  useEffect(() => persistSession(state), [state])

  // Celebrate when a fresh report lands (reporting → report). Guarded by the prior phase so
  // re-opening a completed session from History doesn't re-fire the confetti on mount.
  const prevPhaseRef = useRef(state.phase)
  useEffect(() => {
    if (state.phase === 'report' && prevPhaseRef.current === 'reporting') {
      celebrateBig()
      track('session_completed', { kind: 'sysdesign', level: state.report?.overall.level ?? null })
    }
    prevPhaseRef.current = state.phase
  }, [state.phase])

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

    // Attach the board only when it changed since we last showed it — the diagram carries new info
    // only when edited, and the image is token-heavy. Unchanged turns reason from the transcript;
    // the final report always re-sends the latest board for grading.
    let whiteboardImage: string | null = null
    const boardSig = boardSignature(state.whiteboard ?? null)
    if (boardSig && boardSig !== lastSentBoardRef.current) {
      whiteboardImage = await sceneToPngBase64(state.whiteboard ?? null)
      if (whiteboardImage) lastSentBoardRef.current = boardSig
    }

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await runStageTurn({
        problem,
        stage,
        transcript: prior,
        priorStages,
        message: text,
        config: state.config,
        whiteboardImage,
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
    // Grade the final diagram as part of the design, not just the transcript.
    const whiteboardImage = await sceneToPngBase64(state.whiteboard ?? null)
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
      const report = await generateReport({ problem, stageSessions, targetLevel: state.config.targetLevel, whiteboardImage, signal: controller.signal })
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

  // Keep each recorded voice take (stamped with the current stage) for replay + delivery scoring.
  function handleClip(clip: { assetId: string; durationSec: number | null; text: string }) {
    dispatch({ type: 'ADD_VOICE_CLIP', clip: { ...clip, stageId: stage?.id ?? '' } })
  }

  function handleReset() {
    if (abortRef.current) abortRef.current.abort()
    dispatch({ type: 'RESET' })
  }

  // Author a new problem on demand, persist it, and drop straight into the interview.
  async function handleGenerate(spec: GenSpec) {
    const req: SysDesignProblemSpec = {
      prompt: spec.prompt,
      difficulty: (spec.difficulty as SysDesignProblemSpec['difficulty']) || '',
    }
    const problem = await generateSysDesignProblem(req)
    addCustomSysDesignProblem(problem)
    setCustomProblems((prev) => [problem, ...prev.filter((p) => p.id !== problem.id)])
    dispatch({ type: 'START', problemId: problem.id, config: setupConfig })
  }

  function handleDeleteProblem(id: string) {
    deleteCustomSysDesignProblem(id)
    setCustomProblems((prev) => prev.filter((p) => p.id !== id))
  }

  if (state.phase === 'pick') {
    const pickerProblems = [
      ...customProblems.map((p) => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        statement: p.statement,
        custom: true,
      })),
      ...PROBLEMS.map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty, statement: p.statement })),
    ]
    return (
      <ProblemPicker
        onStart={(id) => dispatch({ type: 'START', problemId: id, config: setupConfig })}
        setup={<InterviewSetup value={setupConfig} onChange={setSetupConfig} />}
        problems={pickerProblems}
        onDelete={handleDeleteProblem}
        generator={
          <ProblemGenerator
            noun="system-design problem"
            hasKeys={hasAnthropic}
            onNeedKeys={onNeedKeys}
            onGenerate={handleGenerate}
            difficulties={['Warm-up', 'Core', 'Hard']}
            promptPlaceholder="e.g. Design a real-time collaborative document editor with offline support"
          />
        }
      />
    )
  }

  if (state.phase === 'report' && problem) {
    const metrics = speechMetrics(state.voiceClips || [])
    const elapsedMs = state.completedAt && state.createdAt ? state.completedAt - state.createdAt : null
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400">Interview report</div>
              <div className="text-base font-semibold text-stone-900">{problem.title}</div>
            </div>
            {elapsedMs != null && (
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-stone-400">Time to complete</div>
                <div className="font-mono text-base font-semibold text-stone-900">{fmtDuration(elapsedMs)}</div>
              </div>
            )}
          </div>
        </div>
        <WhiteboardReview scene={state.whiteboard ?? null} />
        <DeliveryCard metrics={metrics} />
        <Recordings clips={state.voiceClips || []} />
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

        <WhiteboardPanel
          scene={state.whiteboard ?? null}
          onChange={(scene) => dispatch({ type: 'SET_WHITEBOARD', scene })}
          onVoiceTranscript={(t) => setDraft((d) => (d ? `${d} ${t}` : t))}
          sessionId={state.id}
          onVoiceClip={handleClip}
        />

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
            draftValue={draft}
            onDraftChange={setDraft}
            sessionId={state.id}
            onClip={handleClip}
          />
        )}
      </div>

      <aside>
        <StageTracker currentStageId={stage.id} statusById={statusById} />
      </aside>
    </div>
  )
}

// A cheap, change-sensitive fingerprint of the board: each Excalidraw element bumps its `version`
// on any edit (and deletions flip `isDeleted` + bump version), so id:version pairs change iff the
// diagram changed. Empty board → '' (nothing to send).
function boardSignature(scene: WhiteboardScene | null): string {
  const els = scene?.elements as Array<{ id?: string; version?: number }> | undefined
  if (!els?.length) return ''
  return els.map((e) => `${e.id ?? ''}:${e.version ?? ''}`).join(',')
}

// ---- Report extras: time, delivery, recordings, whiteboard review ----------------------

function fmtDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Conversational pace lands ~110–170 wpm; flag the extremes so the candidate can self-correct.
function paceHint(wpm: number | null): string {
  if (wpm == null) return ''
  if (wpm < 110) return 'a touch slow'
  if (wpm > 170) return 'a bit fast'
  return 'good pace'
}

function stageLabelFor(id: string): string {
  return STAGES.find((s) => s.id === id)?.label ?? 'Other'
}

function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-semibold text-stone-800">{value}</span>
        {unit && <span className="text-xs text-stone-500">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-stone-400">{hint}</div>}
    </div>
  )
}

// Speaking pace + filler-word read, computed over the candidate's recorded voice answers.
function DeliveryCard({ metrics }: { metrics: ReturnType<typeof speechMetrics> }) {
  if (!metrics) return null
  const { wpm, durationSec, filler, clipCount } = metrics
  const topFillers = Object.entries(filler.byWord)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-stone-700">Delivery</h3>
      <p className="mt-0.5 text-xs text-stone-400">
        From your {clipCount} voice answer{clipCount === 1 ? '' : 's'} — typed answers aren’t counted.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Speaking pace" value={wpm != null ? String(wpm) : '—'} unit="wpm" hint={paceHint(wpm)} />
        <Stat
          label="Filler words"
          value={String(filler.total)}
          unit={filler.perMinute != null ? `(${filler.perMinute.toFixed(1)}/min)` : undefined}
        />
        <Stat label="Time spoken" value={fmtClock(durationSec)} />
      </div>
      {topFillers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topFillers.map(([w, n]) => (
            <span key={w} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
              “{w}” ×{n}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Replay the recorded voice answers, grouped by stage.
function Recordings({ clips }: { clips: VoiceClip[] }) {
  if (!clips.length) return null
  const order = STAGES.map((s) => s.id)
  const groups: Record<string, VoiceClip[]> = {}
  for (const c of clips) (groups[c.stageId] ||= []).push(c)
  const stageIds = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-stone-700">Your recordings</h3>
      <p className="mt-0.5 text-xs text-stone-400">Replay what you said, stage by stage.</p>
      <div className="mt-3 space-y-4">
        {stageIds.map((sid) => (
          <div key={sid}>
            <div className="text-xs font-medium text-stone-500">{stageLabelFor(sid)}</div>
            <div className="mt-1.5 space-y-2">
              {groups[sid].map((c) => (
                <div key={c.assetId} className="rounded-lg border border-stone-200 bg-white p-2">
                  <audio controls preload="none" src={assetUrl(c.assetId)} className="w-full" />
                  {c.text && <p className="mt-1 line-clamp-2 text-xs text-stone-500">{c.text}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Read-only replay of the design the candidate drew. Collapsible to keep the report tidy.
function WhiteboardReview({ scene }: { scene: WhiteboardScene | null }) {
  if (!scene?.elements?.length) return null
  return (
    <details open className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-2 shadow-sm">
      <summary className="cursor-pointer px-2 py-1.5 text-sm font-semibold text-stone-700">
        🎨 Your whiteboard
      </summary>
      <div className="mt-2 h-[460px] w-full overflow-hidden rounded-lg border border-stone-200">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
            </div>
          }
        >
          <Whiteboard initial={scene} readOnly />
        </Suspense>
      </div>
    </details>
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

// Collapsible Excalidraw whiteboard for sketching the design. Open by default (the canvas is
// central to a system-design round) but foldable to give the conversation more room. It can also
// be maximized into a full-viewport overlay so there's real room to draw; a floating mic in that
// overlay lets the candidate narrate (transcribed into the answer draft) while they sketch, the
// way a real whiteboard round goes. The heavy Excalidraw bundle is only fetched once the panel is
// first mounted open, and the single instance is kept mounted across maximize toggles (it's
// uncontrolled, so remounting would lose the in-progress drawing).
function WhiteboardPanel({
  scene,
  onChange,
  onVoiceTranscript,
  sessionId,
  onVoiceClip,
}: {
  scene: WhiteboardScene | null
  onChange: (scene: WhiteboardScene) => void
  onVoiceTranscript?: (text: string) => void
  sessionId?: string
  onVoiceClip?: (clip: { assetId: string; durationSec: number | null; text: string }) => void
}) {
  const [open, setOpen] = useState(true)
  const [maximized, setMaximized] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  // Seed the canvas from whatever is persisted at the moment it first mounts; Excalidraw is
  // uncontrolled thereafter, so we don't want this to track live state changes.
  const seedRef = useRef(scene)
  const elementCount = scene?.elements?.length ?? 0

  // Esc exits the overlay; lock body scroll while it's covering the page.
  useEffect(() => {
    if (!maximized) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximized(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [maximized])

  const fallback = (
    <div className="flex h-full min-h-[520px] w-full items-center justify-center rounded-xl border border-stone-200/80">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
    </div>
  )

  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] shadow-sm">
      <div className="flex w-full items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left text-sm font-semibold text-stone-900"
        >
          🎨 Whiteboard
          {elementCount > 0 && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
              {elementCount} {elementCount === 1 ? 'element' : 'elements'}
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          {open && (
            <button
              type="button"
              onClick={() => setMaximized(true)}
              className="text-xs font-medium text-stone-500 hover:text-stone-700"
            >
              ⤢ Maximize
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {(open || maximized) && (
        <div className={maximized ? 'fixed inset-0 z-[60] flex flex-col bg-white' : 'px-2 pb-2'}>
          {maximized && (
            <div
              key="bar"
              className="flex items-center justify-between border-b border-stone-200 bg-[#fcfaf6] px-4 py-2"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                🎨 Whiteboard
                {micError && <span className="text-xs font-normal text-red-600">{micError}</span>}
              </span>
              <div className="flex items-center gap-2">
                {onVoiceTranscript && (
                  <MicButton
                    onTranscript={(t) => {
                      setMicError(null)
                      onVoiceTranscript(t)
                    }}
                    onError={setMicError}
                    sessionId={sessionId}
                    onClip={onVoiceClip}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setMaximized(false)}
                  className="rounded-md border border-stone-300 px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  ⤡ Minimize
                </button>
              </div>
            </div>
          )}
          <div
            key="board"
            className={
              maximized
                ? 'min-h-0 flex-1'
                : 'h-[520px] w-full overflow-hidden rounded-xl border border-stone-200/80 shadow-sm'
            }
          >
            <Suspense fallback={fallback}>
              <Whiteboard initial={seedRef.current} onChange={onChange} />
            </Suspense>
          </div>
        </div>
      )}
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
