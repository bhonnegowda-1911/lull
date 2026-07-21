import { useEffect, useState } from 'react'
import type { FillerResult, StarGrading } from '../types'

// Progressive skeleton shown while the STAR grade streams in, replacing the old lone spinner. It
// reveals real data the instant each piece arrives — the locally-computed filler count first, then
// the phase + elapsed timer (so a long wait never reads as a hang), then scores, summary, and STAR
// beats as the streamed JSON closes each field. Placeholders pulse until their value lands.

const SCORE_KEYS = ['clarity', 'structure', 'impact'] as const
const BEATS = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
  { key: 'reflection', label: 'Reflection' },
] as const

const PHASE_LABEL: Record<'thinking' | 'writing', string> = {
  thinking: 'Reading your answer…',
  writing: 'Writing your feedback…',
}

function scoreColor(value: number): string {
  return value >= 4 ? 'text-green-700 bg-green-100' : value >= 3 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
}

/** Seconds elapsed since first mount, ticking every 250ms — proof of life during the wait. */
function useElapsed(): number {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.round((now - start) / 1000))
}

function ScoreBadge({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {value != null ? (
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreColor(value)}`}>{value}/5</span>
      ) : (
        <span className="h-7 w-12 animate-pulse rounded-full bg-stone-200" />
      )}
      <span className="text-xs capitalize text-stone-500">{label}</span>
    </div>
  )
}

export default function GradingProgress({
  phase,
  filler,
  partial,
}: {
  phase?: 'thinking' | 'writing'
  filler?: FillerResult | null
  partial?: Partial<StarGrading> | null
}) {
  const elapsed = useElapsed()
  const scores = partial?.scores
  const perBeat = partial?.perBeat
  const summary = partial?.summary

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
        <p className="text-sm font-medium text-stone-700">
          {phase ? PHASE_LABEL[phase] : 'Grading the full conversation…'}
          <span className="ml-2 text-xs font-normal text-stone-400">{elapsed}s</span>
        </p>
      </div>

      {filler && (
        <p className="mt-3 text-xs text-stone-500">
          Filler words: <span className="font-medium text-stone-700">{filler.total}</span>
          {filler.perMinute != null && <> · {filler.perMinute.toFixed(1)}/min</>}
        </p>
      )}

      <div className="mt-5 flex items-center justify-center gap-8">
        {SCORE_KEYS.map((k) => (
          <ScoreBadge key={k} label={k} value={scores?.[k] ?? null} />
        ))}
      </div>

      <div className="mt-5">
        {summary ? (
          <p className="text-sm leading-relaxed text-stone-700">{summary}</p>
        ) : (
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-stone-200" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-stone-200" />
          </div>
        )}
      </div>

      <div className="mt-5 space-y-2">
        {BEATS.map(({ key, label }) => {
          const beat = perBeat?.[key]
          return (
            <div key={key} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  beat ? (beat.present ? 'bg-green-500' : 'bg-stone-300') : 'bg-stone-200'
                }`}
              >
                {label[0]}
              </span>
              {beat?.note ? (
                <p className="text-sm text-stone-600">{beat.note}</p>
              ) : (
                <div className="mt-1 h-3 w-2/3 animate-pulse rounded bg-stone-200" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
