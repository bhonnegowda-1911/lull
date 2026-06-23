// Central model selection. Per directive, the ENTIRE service runs on Claude Opus 4.8 — the most
// capable model — with NO Sonnet and NO Haiku anywhere. The named constants are kept so call sites
// still read intently (DEFAULT for turns/grading, REPORT for final reports, FAST for mechanical
// extraction, RESUME for resume work), but they all resolve to Opus 4.8 now.
//
// IMPORTANT: Opus 4.8 REJECTS the `temperature` parameter (HTTP 400). No call site may pass
// `temperature` — every call omits it (the llm client only forwards `temperature` when given a
// number, so leaving it unset is the enforcement). Adaptive thinking is the quality lever instead.
export const DEFAULT_MODEL = 'claude-opus-4-8'
export const REPORT_MODEL = 'claude-opus-4-8'
export const FAST_MODEL = 'claude-opus-4-8'
export const RESUME_MODEL = 'claude-opus-4-8'
