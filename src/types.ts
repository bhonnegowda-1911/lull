// Shared domain types for the behavioral ("Lull") flow and the primitives reused
// across analyzers. System-design types live next to their modules in src/{data,lib}/sysdesign.

export type Score = 1 | 2 | 3 | 4 | 5

// ---- Transcription -------------------------------------------------------

export interface TranscriptWord {
  word: string
  start: number
  end: number
  /** Diarization speaker index (0,1,…) when the transcript was diarized; absent otherwise. */
  speaker?: number
}

export interface Transcript {
  text: string
  words?: TranscriptWord[]
  durationSec: number | null
}

/** One contiguous diarized turn: a single speaker talking, with its time range and text. Present
 *  only when transcription ran through a diarizing provider (Deepgram). */
export interface DiarizedUtterance {
  speaker: number
  start: number
  end: number
  text: string
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

/** Who is running the round — shapes how the practice interviewer probes. A recruiter screens for
 *  motivation/fit/logistics and never asks technical deep-dives; a hiring manager pushes on
 *  ownership, scope, and tradeoffs at the level bar; a peer can go into technical decisions. */
export type InterviewerPersona = 'recruiter' | 'hiring_manager' | 'peer'

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
  /** Present only when the grader was given a target job — fit to that company/JD bar. */
  jobFit?: JobFit
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

// ---- Coaching-mode JD/company fit (target job only) ----------------------
// Produced only when the grader is given a target job. It judges how well THIS answer lands for
// THIS company's bar — which of the JD's must-haves it evidenced, which it missed, and which company
// values/behavioral signals it demonstrated — on top of (never replacing) the generic STAR grade.

export interface JobFit {
  /** Target company this answer was graded against (echoed for display). */
  company: string
  /** Overall fit of this answer to the company/JD bar: 1 (off-target) to 5 (strong fit). */
  score: Score
  /** JD must-haves / keywords this answer actually evidenced. */
  mustHavesHit: string[]
  /** Relevant JD must-haves the answer could have surfaced for this role but didn't. */
  mustHavesMissed: string[]
  /** Company values / behavioral signals the answer demonstrated. */
  valuesSignaled: string[]
  /** One- or two-sentence note on fit + what to add to land better for this company. */
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
  /** Set only when a target job was attached: how this answer fits that company/JD bar. */
  jobFit: JobFit | null
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
  /** When set: the target job to grade fit against (company values + JD must-haves). */
  job?: ParsedJob | null
  signal?: AbortSignal
  /**
   * When provided, the LLM analyzer streams its grade and calls this as it progresses: a `phase`
   * change (thinking → writing) and/or a `partial` best-effort grading parsed from the JSON so far.
   * Absent → the analyzer uses the plain blocking call. Only the STAR grading streams today.
   */
  onGradeProgress?: (ev: { phase?: 'thinking' | 'writing'; partial?: Partial<StarGrading> }) => void
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

/** A canonical coding/DSA problem the JD selector recommends for a technical screen, with a rationale.
 *  Same shape/source as ProblemPick — `problemId` references a curated coding problem
 *  (src/data/coding/problems.ts); grading stays on that problem's hints, the selector only ranks. */
export interface CodingPick {
  problemId: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

// ---- Application tracking + interview-date-driven prep planning ----------
// A company's interview loop is per-application and configurable: an ordered list of round
// instances, each a `RoundType` from the catalog (src/data/rounds.ts). The catalog maps a type to
// how its prep items are sourced (recruiter/behavioral/problem picks) and which practice mode it
// deep-links into. `topic`/`focusAreas` are entered by hand and ground the prep plan; the same
// fields a future calendar/Gmail importer would populate.
export type RoundType =
  | 'recruiter'
  | 'technical_screen'
  | 'take_home'
  | 'hiring_manager'
  | 'project_deep_dive'
  | 'system_design'
  | 'behavioral'
  | 'onsite_loop'
  | 'custom'
export type StageOutcome = 'pending' | 'scheduled' | 'passed' | 'failed'

/** One round instance in an application's configurable loop, optionally scheduled, with its own
 *  phased prep plan (built when this round becomes the active phase). */
export interface InterviewRoundInstance {
  id: string
  type: RoundType
  label: string // editable; defaults from the catalog
  /** Manual: what this round is about (e.g. "API design + on-call"). Grounds the prep plan. */
  topic?: string
  /** Manual: specific areas to drill (free text). Grounds the prep plan. */
  focusAreas?: string[]
  scheduledAt: string | null // 'YYYY-MM-DD' (local date) or null — freely editable (reschedule)
  scheduledTime?: string | null // optional 'HH:MM' for ordering; future calendar hook
  /** When true, this round shares an interview session with the round directly above it in the loop
   *  (e.g. an onsite's coding + system-design + managerial). A session is a maximal run of consecutive
   *  rounds where each non-first member sets this. Drives session-level prep unlock. */
  groupedWithPrev?: boolean
  outcome: StageOutcome
  /** Countdown prep plan for this round, or null until built. */
  prepPlan: PrepPlan | null
  notes?: string
  /** Bespoke, LLM-authored prep for rounds with no canonical question bank (custom / take-home),
   *  grounded in this round's topic, focus areas, notes, and the JD. Null until generated. */
  customPrep?: CustomRoundPrep | null
}

/** One predicted item in a custom round's bespoke prep brief — what they might ask and how to nail it. */
export interface CustomPrepItem {
  /** A likely question, prompt, or sub-topic this round will probe. */
  prompt: string
  /** What this item is really evaluating. */
  assesses: string
  /** How to approach it — what a strong answer/response covers. */
  approach: string
  /** A common mistake to avoid on this item. */
  trap: string
}

/** LLM-authored prep for a round with no canonical bank (custom / take-home). Unlike the catalog
 *  selectors, there's nothing to rank — this is generated from the round's own topic/focus/notes + JD. */
export interface CustomRoundPrep {
  generatedAt: string // ISO timestamp
  /** One- to two-sentence framing of what this round is really testing. */
  summary: string
  /** The likely questions / topics to prepare, most important first. */
  items: CustomPrepItem[]
  /** Concrete things to review or do before the round. */
  prepActions: string[]
}

export type ApplicationStatus =
  | 'not_applied'
  | 'applied'
  | 'active'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'

/** The application's progress through the pipeline for a target job. */
export interface Application {
  status: ApplicationStatus
  rounds: InterviewRoundInstance[]
  /**
   * The last resume↔JD fit run, cached so the breakdown re-renders on return without another LLM
   * call. `score`/`verdict`/`at` are the cheap snapshot other steps read; `result` is the full run
   * and `signature` fingerprints the inputs it scored, so a stale check (resume/JD/stories changed)
   * can be flagged. `result`/`signature` are optional for legacy rows that only stored the snapshot.
   */
  fit?: { score: number; verdict: FitVerdict; at: string; result?: ResumeFit; signature?: string } | null
  decisionNote: string
}

/** One actionable item in a day of the prep plan; `round` tags it (or 'review'/'rest'). */
export interface PrepTask {
  round: RoundType | 'review' | 'rest'
  text: string
  done: boolean
}
export interface PrepDay {
  date: string // 'YYYY-MM-DD'
  focus: string // short label for the day, e.g. 'System design' or 'Mock + review'
  tasks: PrepTask[]
}
/**
 * @deprecated The per-round countdown plan. Superseded by the single cross-application
 * `GlobalPrepPlan`. Kept so legacy DB rows (`InterviewRoundInstance.prepPlan`) still parse.
 */
export interface PrepPlan {
  targetDate: string // the interview date this plan was built for
  targetRound: RoundType
  generatedAt: string // ISO timestamp
  days: PrepDay[]
}

// ---- Global prep plan ----------------------------------------------------
// One cross-application plan generated from ALL active interviews at once (instead of a per-round
// plan merged after the fact). Each task is attributed to the interview it serves, so a single
// dated schedule shows parallel loops together. A single server row holds it (see prepPlanStore).

/** One task in the global plan, attributed to the interview (company/round) it serves. The
 *  attribution fields are absent for general `review`/`rest` tasks that don't belong to one company. */
export interface GlobalPrepTask extends PrepTask {
  jobId?: string
  company?: string
  role?: string
  roundLabel?: string
}
export interface GlobalPrepDay {
  date: string // 'YYYY-MM-DD'
  focus: string
  tasks: GlobalPrepTask[]
}
/** The single, cross-application prep plan built from every active interview. */
export interface GlobalPrepPlan {
  generatedAt: string // ISO timestamp
  /** Hash of the active-interview inputs this plan was built from; drives stale detection. */
  signature: string
  days: GlobalPrepDay[]
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
  /** Canonical coding/DSA problems this JD points to (ranked), saved for technical-screen practice. */
  codingPicks: CodingPick[]
  /** Behavioral/managerial questions this JD points to (ranked), saved for practice. */
  behavioralPicks: BehavioralPick[]
  /** Recruiter-screen questions this JD points to (ranked), saved for practice. */
  recruiterPicks: RecruiterPick[]
  /** Application pipeline state (status, configurable loop with per-round prep), or null if untracked. */
  application: Application | null
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
  /** Identity block copied verbatim from the candidate's existing resume (name + contact line) plus a
   *  clean professional title — never an invented marketing tagline. */
  header: { name: string; title: string; contact: string }
  summary: string
  skills: { category: string; items: string[] }[]
  experience: ResumeExperience[]
}

// Style cues inferred from the candidate's uploaded resume file (PDF/Word), used to approximate their
// own look in the generated PDF export instead of the app's fixed template. Best-effort — arbitrary
// fonts can't be embedded, so `fontFamily` maps to the nearest PDF base-14 family. See lib/resume/
// parseFile.ts (inference) and lib/resume/pdf.tsx (rendering).
export type ResumeFontFamily = 'sans' | 'serif' | 'mono'
/** A section the renderer can reorder to match the candidate's original. */
export type ResumeSectionKey = 'summary' | 'skills' | 'experience'

export interface ResumeStyle {
  fontFamily: ResumeFontFamily
  /** Body font size in pt (clamped to a sane 9–12 range). */
  baseFontSize: number
  /** Name/header font size in pt. */
  nameSize: number
  /** Section-heading font size in pt. */
  headingSize: number
  /** Header alignment inferred from the original ('center' if the name sits mid-page). */
  headerAlign: 'left' | 'center'
  /** Order of the supported sections as they appeared in the original; unknown sections are ignored. */
  sectionOrder: ResumeSectionKey[]
  /** Accent/heading color as a hex string. */
  accentColor: string
}

// ---- Recorded interview review + grading ---------------------------------
// A real interview the candidate recorded (e.g. on their phone) and uploaded. The full call is
// transcribed, then graded in one pass: the grader first classifies which kind of round it was
// (recruiter / technical screen / behavioral / system design / …) and applies the matching bar,
// then scores it and breaks the conversation down question by question. Distinct from the practice
// modes — there's no prompt bank or ground truth, just the transcript of what actually happened.

/** Hire signal the recording reads as, on the standard debrief scale. */
export type HireSignal = 'strong_yes' | 'yes' | 'lean_yes' | 'lean_no' | 'no'

/** One graded competency dimension. The set the grader uses is chosen to fit the detected round. */
export interface ReviewDimension {
  key: string
  label: string
  score: Score
  note: string
}

/** One question/answer exchange pulled from the transcript, assessed on its own. */
export interface ReviewExchange {
  /** The interviewer's question, as best identified from the transcript. */
  question: string
  /** What the candidate answered, condensed. */
  answerSummary: string
  /** How well the answer landed and why. */
  assessment: string
  score: Score
  /** A stronger way to have answered this specific question. */
  betterAnswer: string
  /** Seconds into the recording where this question was asked, for click-to-seek playback. Present
   *  only when the graded transcript carried timestamps (diarized via Deepgram); absent otherwise. */
  atSec?: number | null
}

export interface InterviewReview {
  /** Detected round type (from the standard catalog) plus how confident the grader is. */
  roundType: RoundType
  roundConfidence: 'high' | 'medium' | 'low'
  /** Why the grader classified it this way. */
  roundRationale: string
  /** 0–100 overall performance for this round. */
  overallScore: number
  /** Letter grade (A–F) mirroring the overall score, for an at-a-glance read. */
  grade: string
  hireSignal: HireSignal
  /** Two or three sentences: how the interview went overall. */
  summary: string
  /** Diarization speaker index that is the candidate (so the transcript can label "You" vs
   *  "Interviewer"). Present only when the transcript was diarized; absent/null otherwise. */
  candidateSpeaker?: number | null
  dimensions: ReviewDimension[]
  /** Question-by-question breakdown of the conversation. */
  exchanges: ReviewExchange[]
  strengths: string[]
  improvements: string[]
  /** Moments that would worry an interviewer (vague claims, wrong answers, evasiveness). */
  redFlags: string[]
}

/** Session payload stored for a reviewed recording (kind: 'interview_review'). */
export interface InterviewReviewSession {
  review: InterviewReview
  transcript: Transcript
  /** Asset id of the stored original recording, or null if storage was unavailable. */
  assetId: string | null
  /** User-entered label for the recording (company/round), or null. */
  label: string | null
  durationSec: number | null
  /** True when the transcript carries speaker labels (interviewer vs candidate separated). */
  diarized: boolean
  /** Per-turn diarized transcript, when available — for a labeled transcript view. */
  utterances: DiarizedUtterance[]
  createdAt: number
}
