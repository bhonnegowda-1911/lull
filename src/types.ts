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
