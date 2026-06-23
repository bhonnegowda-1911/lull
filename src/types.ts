// Shared domain types for the behavioral ("Delivery Coach") flow and the primitives reused
// across analyzers. System-design types live next to their modules in src/{data,lib}/sysdesign.

export type Score = 1 | 2 | 3 | 4 | 5

// ---- Transcription -------------------------------------------------------

export interface TranscriptWord {
  word: string
  start: number
  end: number
}

export interface Transcript {
  text: string
  words?: TranscriptWord[]
  durationSec: number | null
}

// ---- Filler analysis -----------------------------------------------------

export interface FillerSpan {
  text: string
  index: number
}

export interface FillerResult {
  total: number
  perMinute: number | null
  byWord: Record<string, number>
  spans: FillerSpan[]
}

// ---- Behavioral (STAR) grading, parsed from the LLM ----------------------

export type BehavioralLevel = 'junior' | 'mid' | 'senior' | 'staff' | 'principal'
export type Severity = 'high' | 'medium' | 'low'
export type DetailTendency = 'too_much' | 'balanced' | 'too_little'

export interface StarBeat {
  present: boolean
  score: Score
  note: string
}

export interface StarScores {
  clarity: Score
  structure: Score
  impact: Score
}

export interface DeliveryHabits {
  leadsWithOutcome: { present: boolean; score: Score; note: string }
  detailAltitude: { tendency: DetailTendency; score: Score; note: string }
}

export interface LevelGuidance {
  level: string
  guidance: string[]
}

export interface LevelSignal {
  level: BehavioralLevel
  rationale: string
  signals: string[]
  toReachHigher: LevelGuidance[]
}

export interface CoachingNote {
  title: string
  detail: string
  severity: Severity
}

export interface StarGrading {
  conforms: boolean
  perBeat: { situation: StarBeat; task: StarBeat; action: StarBeat; result: StarBeat }
  scores: StarScores
  summary: string
  deliveryHabits: DeliveryHabits
  levelSignal: LevelSignal
  coachingNotes: CoachingNote[]
  /** Present only when the grader was given the candidate's true stories (coaching mode). */
  storyFidelity?: StoryFidelity
}

// ---- Analyzer results & merged feedback ----------------------------------

export interface LlmAnalyzerResult {
  id: string
  label: string
  status: 'ok'
  scores: Partial<StarScores>
  findings: CoachingNote[]
  summary: string
  raw: StarGrading
  rawResponse: unknown
}

export interface FillerAnalyzerResult {
  id: string
  label: string
  status: 'ok'
  scores: { perMinute: number | null }
  findings: FillerSpan[]
  summary: string
  raw: FillerResult
}

export type FeedbackBeat = StarBeat & { key: string; label: string }
export type FeedbackNote = CoachingNote & { source: 'star' | 'filler' }

// ---- Coaching-mode content feedback (story bank only) --------------------
// Produced only when the grader is given the candidate's true stories. It compares how the story
// was TOLD against what actually happened: where the telling undersold the real impact, claimed
// team credit for solo work, or where a different story in the bank would have been stronger.

export interface StoryFidelity {
  /** Title of the bank story the grader judged the answer to be telling, or null if none matched. */
  matchedStoryTitle: string | null
  /** Points where the telling sold the work short of its real scope/impact. */
  underSold: string[]
  /** Concrete impact in the true story that was left out of the telling. */
  omittedImpact: string[]
  /** Spots where solo work was framed as "we"/team. */
  misattributedToTeam: string[]
  /** Title of a stronger story in the bank for this prompt, if one fits better. */
  betterExampleTitle: string | null
  /** One- or two-sentence overall content note. */
  note: string
}

export interface Feedback {
  conforms: boolean
  summary: string
  scores: Partial<StarScores>
  level: LevelSignal | null
  habits: DeliveryHabits | null
  beats: FeedbackBeat[]
  filler: { total: number; perMinute: number | null; byWord: Record<string, number> }
  notes: FeedbackNote[]
  /** Coaching-mode only: content critique against the candidate's true stories. */
  storyFidelity: StoryFidelity | null
}

/** Context passed to each analyzer's `run`. */
export interface AnalyzerContext {
  question: string
  transcript: Transcript
  durationSec: number | null
  fillers?: string[]
  filler?: FillerResult
  /** Coaching mode: the candidate's matched true stories, for content critique. */
  stories?: import('./data/stories').Story[]
  /** Coaching mode: matched projects whose facets are the deeper ground truth. */
  projects?: import('./data/projects').Project[]
  signal?: AbortSignal
}

export interface Session {
  id: string
  createdAt: number
  promptId: string
  transcript: Transcript
  filler: FillerResult
  llm: LlmAnalyzerResult
  feedback: Feedback
  isVideo: boolean
}

// ---- Resume ↔ job-description fit ----------------------------------------
// A target job is parsed once into structure (ParsedJob), then the resume is scored against it
// (ResumeFit). Fit is a score + structured gaps, never a binary pass/fail. The `fixable` tag on a
// gap closes the loop to the rest of the app: 'reword' = you have it but didn't surface it,
// 'add_story' = a story in your bank covers it, 'genuine_gap' = a real hole.

export interface JobSkill {
  skill: string
  category: string
}

export interface ParsedJob {
  title: string
  company: string
  seniority: BehavioralLevel
  mustHaveSkills: JobSkill[]
  niceToHaveSkills: string[]
  responsibilities: string[]
  /** ATS keywords/terms to check the resume covers. */
  keywords: string[]
}

/** A canonical system-design problem the JD selector recommends for a company, with a domain rationale.
 *  `problemId` references a curated library problem (src/data/sysdesign/problems.ts) — grading stays
 *  on that problem's hand-authored hints; the selector only ranks and explains the fit. */
export interface ProblemPick {
  problemId: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

/** A behavioral/managerial question the JD selector recommends, mapped to a stated company value.
 *  `promptId` references a curated bank question (src/data/prompts.ts) — STAR grading is question-
 *  agnostic, so the bank stays the source of truth; the selector only ranks and explains the fit. */
export interface BehavioralPick {
  promptId: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

/** A recruiter-screen question the JD selector recommends. Same shape/source as BehavioralPick, but
 *  drawn from the bank's "Recruiter screen" set (motivation, logistics, high-level fit). */
export interface RecruiterPick {
  promptId: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

/** A stored target job: pasted text plus its parsed structure. */
export interface JobDescription {
  id: string
  title: string
  company: string
  rawText: string
  parsed: ParsedJob | null
  /** Canonical system-design problems this JD points to (ranked), saved for practice. */
  problemPicks: ProblemPick[]
  /** Behavioral/managerial questions this JD points to (ranked), saved for practice. */
  behavioralPicks: BehavioralPick[]
  /** Recruiter-screen questions this JD points to (ranked), saved for practice. */
  recruiterPicks: RecruiterPick[]
}

export type FitVerdict = 'strong' | 'plausible' | 'stretch' | 'mismatch'
export type CoverageStatus = 'covered' | 'partial' | 'missing'
export type FixKind = 'reword' | 'add_story' | 'genuine_gap'

export interface RequirementCoverage {
  requirement: string
  status: CoverageStatus
  evidence: string | null
  severity: Severity
}

export interface FitGap {
  title: string
  detail: string
  severity: Severity
  fixable: FixKind
}

export interface ResumeFit {
  /** 0–100 overall fit. */
  fitScore: number
  verdict: FitVerdict
  seniorityMatch: {
    jdLevel: string
    resumeImpliedLevel: string
    assessment: 'under' | 'match' | 'over'
    note: string
  }
  requirementCoverage: RequirementCoverage[]
  keywordCoverage: { matched: string[]; missing: string[]; coveragePct: number }
  quantifiedImpact: { score: Score; note: string }
  gaps: FitGap[]
  strengths: string[]
  summary: string
}

// ---- JD-targeted resume generation (Phase 2) -----------------------------
// A resume generated strictly from the candidate's own ground truth (stories + project facets),
// optionally tailored to a parsed job. Every bullet carries provenance — the story or project it
// traces to — so the grounding rule ("no invented metrics/titles/companies") stays auditable.

export interface ResumeBullet {
  text: string
  /** Id of the source story this bullet traces to, or null. */
  sourceStoryId: string | null
  /** Id of the source project this bullet traces to, or null. */
  sourceProjectId: string | null
  /** True when the bullet was reused/tightened from the candidate's existing pasted resume. */
  sourceResume: boolean
  /** A real metric from the source, only if present there. */
  metric?: string
}

export interface ResumeExperience {
  company: string
  role: string
  dates: string
  bullets: ResumeBullet[]
}

export interface GeneratedResume {
  header: { headline: string; targetRole: string }
  summary: string
  skills: { category: string; items: string[] }[]
  experience: ResumeExperience[]
}
