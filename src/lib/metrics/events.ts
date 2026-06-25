// Product-metrics event log. The app uniquely sits on BOTH sides of the validation join — it
// records our PREDICTIONS (fit score, practice level/rank) and the real OUTCOMES (round
// passed/failed, offers) in the same place. This module is the append-only event stream that lets
// us later prove our scores actually predict outcomes (calibration) and that the product helps
// (funnel + pass-rate). Capture is deliberately dumb: log raw, typed facts; all joins/derivations
// live in compute.ts so they stay pure and unit-tested.
//
// Storage is local-first (localStorage), matching the rest of the app. A backend/telemetry sink —
// needed before any *cross-user* validity claim, since one user's N is tiny — slots in at `sink()`
// behind an opt-in flag; it must stay anonymous (send the {prediction, outcome} pair, never resume
// text). Capture must NEVER throw or block the app: analytics failing is not a user-facing error.

import type { ApplicationStatus, FitVerdict, RoundType } from '../../types'
import type { PracticeMode } from '../../data/rounds'
import type { SessionKind } from '../sessionStore'

const STORAGE_KEY = 'metrics_events_v1'
/** Opt-in anonymous telemetry. Off by default — local-first. Flip via VITE_METRICS_SINK=1 + a URL. */
const SINK_URL = import.meta.env.VITE_METRICS_SINK_URL ?? ''

export type MetricEventType = 'round_resolved' | 'session_completed' | 'app_status'

interface BaseEvent {
  /** Stable unique id, so a backend sink can dedupe idempotently. */
  id: string
  /** ISO timestamp the event was captured. */
  ts: string
  type: MetricEventType
}

/** A round reached a terminal outcome — the ground-truth label for everything predictive. */
export interface RoundResolvedEvent extends BaseEvent {
  type: 'round_resolved'
  jobId: string
  roundId: string
  roundType: RoundType
  /** The practice mode this round maps to (the key for "did practicing X predict passing X?"). */
  practiceMode: PracticeMode
  outcome: 'passed' | 'failed'
  /** Round date if known — lets compute join the latest practice rep *before* the round. */
  roundDate: string | null
  /** Predicted fit at resolution time — the calibration input. Null if fit was never run. */
  fitScore: number | null
  fitVerdict: FitVerdict | null
}

/** A practice session reached its report/graded state — the "rep" side of the validity join. */
export interface SessionCompletedEvent extends BaseEvent {
  type: 'session_completed'
  kind: SessionKind
  /** Assessed level (junior…principal) if the report produced one. */
  level: string | null
}

/** An application changed status — powers the funnel (applied → interviewing → offer). */
export interface AppStatusEvent extends BaseEvent {
  type: 'app_status'
  jobId: string
  status: ApplicationStatus
}

export type MetricEvent = RoundResolvedEvent | SessionCompletedEvent | AppStatusEvent

function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `e_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

function read(): MetricEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MetricEvent[]) : []
  } catch {
    return []
  }
}

/** Optional anonymous backend mirror. No-ops unless a sink URL is configured; never throws. */
function sink(event: MetricEvent): void {
  if (!SINK_URL) return
  try {
    void fetch(SINK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

/** Append a typed event. Fire-and-forget; swallows all errors so analytics can't break a flow. */
export function track<E extends MetricEvent['type']>(
  type: E,
  fields: Omit<Extract<MetricEvent, { type: E }>, keyof BaseEvent>,
): void {
  try {
    // The generic guarantees `fields` matches `type` at the call site; TS can't verify the spread
    // across the union, so route the assembled record through `unknown`.
    const event = { id: uid(), ts: new Date().toISOString(), type, ...fields } as unknown as MetricEvent
    const all = read()
    all.push(event)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    sink(event)
  } catch {
    /* analytics must never throw */
  }
}

/** All captured events, oldest first. For the metrics/compute layer and any dashboard. */
export function loadEvents(): MetricEvent[] {
  return read()
}

/** Wipe the local event log (e.g. a "reset analytics" affordance). */
export function clearEvents(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
