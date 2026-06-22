// Central model selection. Change these in one place rather than per call site.
//
// DEFAULT_MODEL — Sonnet 4.6: best balance of speed and intelligence. Used for the
//   behavioral grading, follow-up generation, and the system-design interviewer turns.
//   Accepts `temperature` (we pass 0 for run-to-run consistency).
// REPORT_MODEL — Opus 4.8: most capable. Used for the final system-design leveling report,
//   where judgment quality matters most. NOTE: Opus 4.8 rejects `temperature`, so report
//   calls must omit it (the llm client only sends `temperature` when given a number).

export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const REPORT_MODEL = 'claude-opus-4-8'
// FAST_MODEL — Haiku 4.5: cheapest/fastest. Used for mechanical extraction (e.g. parsing a job
// description into structure) where throughput matters more than deep judgment. Accepts temperature.
export const FAST_MODEL = 'claude-haiku-4-5'

// Grading wants deterministic output; pass this as `temperature` to Sonnet/Haiku calls.
// Do NOT pass any temperature to Opus 4.8 (it 400s).
export const GRADING_TEMPERATURE = 0
