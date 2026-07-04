// Shared interviewer configuration for the technical interview modes (coding + system design).
// A single omniscient interviewer is unrealistic: a real staff interviewer is fallible and the bar
// varies by role. Two orthogonal dials fix that, and both modes thread the same config so the
// behavior stays consistent:
//   - targetLevel: the BAR the candidate is held to — and the depth the interviewer probes for.
//   - style: how sharp / rigorous the INTERVIEWER is. Lets the interviewer be deliberately less
//     than maximally incisive, matching the spread of real interviewers rather than always the
//     sharpest one imaginable.
// Both feed the per-turn system prompt (personaDirective). Grading (report.ts) stays calibrated and
// honest regardless of style — only the target level lightly calibrates the report's guidance.

export type TargetLevel = 'mid' | 'senior' | 'staff'
export type InterviewerStyle = 'rigorous' | 'balanced' | 'relaxed'
// A third, orthogonal dial: whether the session TESTS the candidate (a realistic interview) or
// TEACHES them (coaching). Interview mode hides the reference points and probes adversarially;
// coaching mode reveals what a strong answer covers, gives hints, and explains the tradeoffs.
export type InterviewMode = 'interview' | 'coaching'

export interface InterviewConfig {
  targetLevel: TargetLevel
  style: InterviewerStyle
  mode: InterviewMode
}

// Mid/senior/staff mirror the per-stage `levelRubric` the report grades against; 'senior' is the
// realistic default and 'balanced' matches how most real interviews actually feel.
export const TARGET_LEVELS: TargetLevel[] = ['mid', 'senior', 'staff']
export const INTERVIEWER_STYLES: InterviewerStyle[] = ['rigorous', 'balanced', 'relaxed']
export const INTERVIEW_MODES: InterviewMode[] = ['interview', 'coaching']

export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = { targetLevel: 'senior', style: 'balanced', mode: 'interview' }

// The bar the candidate is held to — shapes how hard the interviewer probes and what counts as
// "good enough" to move on.
export const LEVEL_BAR: Record<TargetLevel, string> = {
  mid: 'a MID bar: they should reach a workable answer when guided. Accept a solid, mostly correct answer; do not demand the sharpest tradeoffs or org-level framing.',
  senior:
    'a SENIOR bar: expect them to drive independently, justify choices with explicit tradeoffs, and reach the strong solution without much hand-holding.',
  staff:
    'a STAFF bar: expect them to frame the crux early, reason about cost / failure / evolution, and adapt to curveballs. Hold out for depth — a merely correct answer is not enough.',
}

// How the interviewer BEHAVES, deliberately ranging from superhuman to fallible. This is the dial
// that keeps the simulation honest: not every interviewer is Opus-sharp.
export const STYLE_GUIDANCE: Record<InterviewerStyle, string> = {
  rigorous:
    'You are an exceptionally sharp interviewer. Each turn, find the single most incisive gap and press on it; never let a hand-wave or a fuzzy complexity claim slide; test adversarially. This is the hardest a real interview gets.',
  balanced:
    'You are a solid, typical interviewer — competent but not superhuman, the way most real interviews actually feel. Probe the main gaps, but do not relentlessly hunt the sharpest possible follow-up: if an answer is reasonable and mostly complete, accept it and move on rather than drilling to the very bottom. Occasionally you let a subtle issue pass, as a real interviewer would.',
  relaxed:
    'You are a friendlier, less rigorous interviewer who is fairly easy to satisfy. Ask mostly surface-level follow-ups, give the candidate room, and move on once they have a roughly working answer. You may linger on one area you personally find interesting and under-probe others. Do not manufacture rigor you would not actually apply.',
}

// Relaxed interviewers don't pile on curveballs; the escalation block is suppressed for them.
// Coaching sessions never escalate — they teach rather than test.
export function escalationEnabled(style: InterviewerStyle, mode: InterviewMode = 'interview'): boolean {
  return mode !== 'coaching' && style !== 'relaxed'
}

export function isCoaching(config: InterviewConfig): boolean {
  return config.mode === 'coaching'
}

/** The interviewer-config block injected into a turn system prompt. Shared by coding + sysdesign. */
export function personaDirective({ targetLevel, style, mode }: InterviewConfig): string {
  // Coaching drops the adversarial STYLE dial (sharpness would fight the teaching tone); the target
  // level becomes the bar the coach is training the candidate TOWARD, not a hidden gate.
  if (mode === 'coaching') {
    return `TARGET LEVEL: You are coaching them toward ${LEVEL_BAR[targetLevel] ?? LEVEL_BAR.senior}`
  }
  return `INTERVIEWER STYLE: ${STYLE_GUIDANCE[style] ?? STYLE_GUIDANCE.balanced}

TARGET LEVEL: Hold the candidate to ${LEVEL_BAR[targetLevel] ?? LEVEL_BAR.senior}`
}

// --- UI labels / blurbs (kept here so the selector and the prompts stay in sync) ---

export const TARGET_LEVEL_LABEL: Record<TargetLevel, string> = {
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
}

export const STYLE_LABEL: Record<InterviewerStyle, string> = {
  rigorous: 'Rigorous',
  balanced: 'Balanced',
  relaxed: 'Relaxed',
}

export const STYLE_BLURB: Record<InterviewerStyle, string> = {
  rigorous: 'Superhuman & relentless — probes every gap.',
  balanced: 'A typical competent interviewer (most realistic).',
  relaxed: 'Friendly and easy to satisfy — gives you room.',
}

export const MODE_LABEL: Record<InterviewMode, string> = {
  interview: 'Interview',
  coaching: 'Coaching',
}

export const MODE_BLURB: Record<InterviewMode, string> = {
  interview: 'A realistic round — you drive, it probes and grades.',
  coaching: 'A coach that teaches — reveals strong answers, hints, and explains tradeoffs.',
}

// --- sanitize (config arrives from persisted/loaded state) ---

export function isTargetLevel(v: unknown): v is TargetLevel {
  return typeof v === 'string' && (TARGET_LEVELS as string[]).includes(v)
}

export function isInterviewerStyle(v: unknown): v is InterviewerStyle {
  return typeof v === 'string' && (INTERVIEWER_STYLES as string[]).includes(v)
}

export function isInterviewMode(v: unknown): v is InterviewMode {
  return typeof v === 'string' && (INTERVIEW_MODES as string[]).includes(v)
}

/** Coerce arbitrary loaded input into a valid config, falling back to the defaults per field. */
export function sanitizeConfig(input: unknown): InterviewConfig {
  const c = (input ?? {}) as Partial<InterviewConfig>
  return {
    targetLevel: isTargetLevel(c.targetLevel) ? c.targetLevel : DEFAULT_INTERVIEW_CONFIG.targetLevel,
    style: isInterviewerStyle(c.style) ? c.style : DEFAULT_INTERVIEW_CONFIG.style,
    mode: isInterviewMode(c.mode) ? c.mode : DEFAULT_INTERVIEW_CONFIG.mode,
  }
}
