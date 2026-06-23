import { useEffect, useRef, useState } from 'react'

// Per-stage pacing cue. Counts up from mount and compares against the stage's time budget.
// Mount it with key={stage.id} so it resets when the stage changes. It owns its own 1s tick
// (no parent re-renders) and reports pace changes up via onStatus so the conversation can
// show a nudge: 'ok' (under budget) → 'over' (past budget) → 'way_over' (>1.5× budget).

export type PaceStatus = 'ok' | 'over' | 'way_over'

function fmt(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function paceFor(elapsedSec: number, budgetSec: number): PaceStatus {
  if (elapsedSec > budgetSec * 1.5) return 'way_over'
  if (elapsedSec > budgetSec) return 'over'
  return 'ok'
}

interface StageTimerProps {
  budgetMin: number
  onStatus?: (status: PaceStatus) => void
}

export default function StageTimer({ budgetMin, onStatus }: StageTimerProps) {
  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const lastStatusRef = useRef<PaceStatus>('ok')

  useEffect(() => {
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 1000)
    return () => clearInterval(id)
  }, [])

  const budgetSec = budgetMin * 60
  const status = paceFor(elapsed, budgetSec)

  // Report only on transitions, after render, to avoid setState-during-render warnings.
  useEffect(() => {
    if (status !== lastStatusRef.current) {
      lastStatusRef.current = status
      onStatus?.(status)
    }
  }, [status, onStatus])

  const color =
    status === 'way_over' ? 'text-red-600' : status === 'over' ? 'text-amber-600' : 'text-stone-400'

  return (
    <span className={`font-mono text-xs ${color}`} title="Time on this stage vs. its budget">
      {fmt(elapsed)} / ~{budgetMin}:00
    </span>
  )
}
