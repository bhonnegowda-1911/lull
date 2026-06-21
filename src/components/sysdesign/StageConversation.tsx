import { useEffect, useRef, useState } from 'react'
import AnswerComposer from './AnswerComposer'
import StageTimer, { type PaceStatus } from './StageTimer'
import type { Turn, TurnRole } from '../../lib/sysdesign/conversation'

// The minimal stage shape this surface renders — both the system-design Stage and the Build
// mode's BuildStage satisfy it (an absent `optional` simply hides the skip control).
export interface ConversableStage {
  id: string
  label: string
  minutes: number
  goal: string
  optional?: boolean
}

const PACE_NUDGE: Record<Exclude<PaceStatus, 'ok'>, string> = {
  over: 'border-amber-200 bg-amber-50 text-amber-800',
  way_over: 'border-red-200 bg-red-50 text-red-800',
}

// The chat surface for the current stage: the interviewer/candidate transcript, an
// alignment banner when the interviewer thinks the stage is covered, the input composer,
// and the advance / skip controls.

function Bubble({ role, text }: { role: TurnRole; text: string }) {
  const isCandidate = role === 'candidate'
  return (
    <div className={`flex ${isCandidate ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          isCandidate
            ? 'rounded-br-sm bg-indigo-600 text-white'
            : 'rounded-bl-sm bg-slate-100 text-slate-800'
        }`}
      >
        {!isCandidate && <div className="mb-0.5 text-[11px] font-semibold text-slate-400">Interviewer</div>}
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}

interface StageConversationProps {
  stage: ConversableStage
  transcript: Turn[]
  aligned: boolean
  thinking: boolean
  onSubmit: (text: string) => void
  onAdvance: () => void
  onSkip: () => void
  isLastStage: boolean
}

export default function StageConversation({
  stage,
  transcript,
  aligned,
  thinking,
  onSubmit,
  onAdvance,
  onSkip,
  isLastStage,
}: StageConversationProps) {
  const endRef = useRef<HTMLDivElement | null>(null)
  const [pace, setPace] = useState<PaceStatus>('ok')
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [transcript.length, thinking])
  // The timer remounts per stage (keyed) and only emits on transitions, so clear any
  // lingering nudge when the stage changes.
  useEffect(() => setPace('ok'), [stage.id])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">{stage.label}</h2>
        <StageTimer key={stage.id} budgetMin={stage.minutes} onStatus={setPace} />
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{stage.goal}</p>

      {pace !== 'ok' && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${PACE_NUDGE[pace]}`}>
          {pace === 'way_over'
            ? `You’re well past the ~${stage.minutes} min budget for this stage. In a real interview you’d need to move on — wrap up and advance.`
            : `You’re past the ~${stage.minutes} min budget for this stage. Consider tightening up and moving on soon.`}
        </div>
      )}

      <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
        {transcript.length === 0 && !thinking && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            Kick this stage off — answer in your own words. The interviewer will probe with
            follow-ups, then you move on when you’re aligned.
          </p>
        )}
        {transcript.map((turn, i) => (
          <Bubble key={i} role={turn.role} text={turn.text} />
        ))}

        {thinking && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
            Interviewer is thinking…
          </div>
        )}

        {aligned && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            ✓ Looks like you’ve covered this stage. You can keep refining, or move on.
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <AnswerComposer onSubmit={onSubmit} disabled={thinking} />
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onAdvance}
            disabled={thinking || transcript.length === 0}
            className={`rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              aligned ? 'bg-green-600 hover:bg-green-500' : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            {isLastStage ? 'Finish & get report →' : 'Next stage →'}
          </button>
          {stage.optional && (
            <button
              type="button"
              onClick={onSkip}
              disabled={thinking}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              Skip this stage
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {aligned ? 'Aligned — ready to advance' : 'Advance whenever you’re ready'}
          </span>
        </div>
      </div>
    </div>
  )
}
