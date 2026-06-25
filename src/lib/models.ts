// Central model selection — the single place to revisit cost/quality tiers. Each constant names a
// tier by intent; flip a tier here (or re-point one call site's import) to move work between models.
//
// Tiers (current assignment):
//   DEFAULT (Opus 4.8)   — high-judgment interactive work: live interviewer/coach turns, behavioral
//                          and recruiter grading. Quality matters most here; keep on Opus.
//   REPORT  (Opus 4.8)   — final leveling reports (one-shot, heavily weighted).
//   GEN     (Sonnet 4.6) — content authoring: problem/round generation, prep plans, resume writing.
//                          Capable but ~40% cheaper than Opus; revisit if authored quality dips.
//   FAST    (Haiku 4.5)  — mechanical extraction/parsing: JD parse, STAR extraction, follow-up Qs.
//                          ~80% cheaper; fine for structured-output extraction.
//
// IMPORTANT: no call site may pass `temperature` — Opus 4.8 REJECTS it (HTTP 400), and the llm
// client only forwards `temperature` when given a number, so leaving it unset is the enforcement.
// Adaptive thinking is the quality lever instead. (Haiku 4.5 also rejects the `effort` param, but
// no FAST-tier call sends effort or thinking — keep it that way when re-pointing calls to FAST.)
export const DEFAULT_MODEL = 'claude-opus-4-8'
export const REPORT_MODEL = 'claude-opus-4-8'
export const GEN_MODEL = 'claude-sonnet-4-6'
export const RESUME_MODEL = 'claude-sonnet-4-6'
export const FAST_MODEL = 'claude-haiku-4-5'
