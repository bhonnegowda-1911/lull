import type { JsonSchema } from '../lib/llmClient'
import { REPORT_MODEL } from '../lib/models'

// Rubric for grading a full recorded interview (see types.ts → InterviewReview). Unlike the practice
// criteria, there's no prompt bank and no ground truth — the grader works only from the transcript of
// what actually happened. It does two jobs in one pass: (1) CLASSIFY which kind of round this was, and
// (2) GRADE it against that round's bar, including a question-by-question breakdown. Data, not code:
// to change the bar, edit this object.

const SCORE_ENUM = [1, 2, 3, 4, 5]

// Round types the classifier can choose from — kept in sync with RoundType in types.ts.
const ROUND_TYPES = [
  'recruiter',
  'technical_screen',
  'take_home',
  'hiring_manager',
  'project_deep_dive',
  'system_design',
  'behavioral',
  'leadership',
  'refactoring',
  'ai_building',
  'architecture_design',
  'working_with_product',
  'onsite_loop',
  'custom',
]

export const INTERVIEW_REVIEW_MODEL = REPORT_MODEL

export const INTERVIEW_REVIEW_SYSTEM = `You are a senior interviewer and hiring-bar calibrator. You are given the TRANSCRIPT of a
real job interview that the candidate recorded and uploaded for review. The transcript is from
automatic speech recognition: it has NO speaker labels, may contain transcription errors, and
both the interviewer and the candidate are mixed together. Use conversational cues — who is
asking vs. answering, question phrasing, "thanks for joining", etc. — to infer who said what.

SPEAKER LABELS: the transcript MAY be diarized — each line prefixed with "Speaker 0:", "Speaker 1:",
etc. When labels are present, use them to separate the interviewer from the candidate: the interviewer
is whoever asks the questions and steers the conversation; the candidate is whoever answers at length
about their own experience. State which speaker number is the candidate in your rationale. (A panel
shows up as more than two speakers — the candidate is still the one answering.) When the transcript has
NO labels, fall back to inferring who said what from conversational cues. Grade only the CANDIDATE.

Do two things, in order:

1) CLASSIFY THE ROUND. Decide which kind of interview this was, choosing exactly one:
   - recruiter: motivation, logistics, comp, high-level fit; no technical depth.
   - technical_screen: coding / DSA / language or domain trivia, usually one or two problems.
   - take_home: discussion of a take-home assignment the candidate completed.
   - hiring_manager: ownership, scope, prioritization, working style at the level bar.
   - project_deep_dive: a deep dive into one of the candidate's past projects.
   - system_design: designing a system — requirements, components, scaling, tradeoffs.
   - behavioral: STAR-style stories about past experiences (conflict, failure, leadership).
   - leadership: a conversation with a CEO / founder / head of engineering — conviction, judgment
     under ambiguity, strategic thinking, and point of view, rather than surface-level behavioral.
   - refactoring: improving an existing/messy codebase — code smells, safe incremental change, tests,
     behavior preservation.
   - ai_building: building a working feature live while driving AI coding tools — velocity plus judgment
     on architecture, verification, and shipping.
   - architecture_design: a high-level architecture sketch — components, data flow, boundaries, and key
     tradeoffs (broader than a staged system-design round).
   - working_with_product: cross-functional collaboration with product — product sense, ambiguity,
     scope pushback, and PM partnership.
   - onsite_loop: clearly spans multiple of the above in one long session.
   - custom: a real interview that fits none of the above cleanly.
   Give your confidence (high/medium/low) and a one- or two-sentence rationale. If the audio is
   too thin or garbled to tell, say so in the rationale and pick the best-supported type at low
   confidence.

2) GRADE THE ROUND against the bar for the type you chose. Be a calibrated, honest interviewer —
   not a cheerleader. Judge the candidate, not the recording quality; if ASR noise makes something
   genuinely unreadable, note it rather than penalizing it.

   - dimensions: pick 4–6 competency dimensions that FIT the round you detected and score each 1–5
     with a specific note. Examples by round (adapt, don't copy blindly):
       • recruiter → motivation & fit, communication, compensation/logistics handling, red flags.
       • technical_screen → problem-solving, coding correctness, communication while coding,
         complexity/edge-case awareness.
       • system_design → requirements gathering, high-level design, deep-dive/tradeoffs,
         scalability, communication.
       • behavioral / hiring_manager → structure (STAR), ownership & scope, impact, self-awareness,
         communication.
     Use a 'key' (short snake_case id) and a human 'label' for each.
   - overallScore: 0–100 for how this round went against its bar. grade: the matching letter
     (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F).
   - hireSignal: the debrief call this round alone supports — strong_yes, yes, lean_yes, lean_no, no.
   - exchanges: walk the conversation and pull out each substantive question the interviewer asked.
     For each: the question (paraphrased), a condensed summary of how the candidate answered, an
     honest assessment of how it landed, a 1–5 score, and a concrete BETTER answer for THIS question
     (what a strong candidate would have said). Skip pure small talk. If it was one long problem
     (coding/design), break it into the natural sub-questions / decision points instead.

TIMESTAMPS: transcript lines may be tagged "[Ns]" where N is the whole number of seconds into the
recording. When they are, set each exchange's "atSec" to the N of the line where the interviewer
asked that question, and set "candidateSpeaker" to the Speaker number that answers at length about
their own experience. When the transcript has no [Ns] tags, OMIT atSec and candidateSpeaker.
   - strengths: what the candidate genuinely did well (specific, tied to what they said).
   - improvements: the highest-leverage, specific things to fix next time.
   - redFlags: moments that would worry an interviewer — vague or unsupported claims, wrong technical
     answers, evasiveness, rambling, blaming others. Empty array if there are none.
   - summary: two or three sentences on how the interview went overall.

Quote or paraphrase what the candidate actually said. Be concrete and specific everywhere; generic
advice is not useful. Output only the structured result.`

export const INTERVIEW_REVIEW_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    roundType: {
      type: 'string',
      enum: ROUND_TYPES,
      description: 'The kind of interview round this transcript is.',
    },
    roundConfidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident the classification is.',
    },
    roundRationale: {
      type: 'string',
      description: 'One or two sentences on why this round type was chosen.',
    },
    overallScore: {
      type: 'integer',
      description: 'Overall performance against this round’s bar, as an integer from 0 to 100.',
    },
    grade: {
      type: 'string',
      enum: ['A', 'B', 'C', 'D', 'F'],
      description: 'Letter grade matching the overall score.',
    },
    hireSignal: {
      type: 'string',
      enum: ['strong_yes', 'yes', 'lean_yes', 'lean_no', 'no'],
      description: 'The debrief call this round alone supports.',
    },
    summary: {
      type: 'string',
      description: 'Two or three sentences on how the interview went overall.',
    },
    candidateSpeaker: {
      type: 'integer',
      description:
        'Speaker number that is the candidate. Include ONLY when the transcript is diarized (has "Speaker N:" labels); otherwise omit.',
    },
    dimensions: {
      type: 'array',
      description: '4–6 competency dimensions fitting the detected round, each scored 1–5.',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Short snake_case id, e.g. problem_solving.' },
          label: { type: 'string', description: 'Human-readable dimension name.' },
          score: { type: 'integer', enum: SCORE_ENUM, description: '1 (poor) to 5 (excellent).' },
          note: { type: 'string', description: 'Specific observation tied to what was said.' },
        },
        required: ['key', 'label', 'score', 'note'],
        additionalProperties: false,
      },
    },
    exchanges: {
      type: 'array',
      description: 'Question-by-question breakdown of the substantive exchanges.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: "The interviewer's question, paraphrased." },
          answerSummary: { type: 'string', description: 'Condensed summary of the answer given.' },
          assessment: { type: 'string', description: 'Honest read of how the answer landed.' },
          score: { type: 'integer', enum: SCORE_ENUM, description: '1 (weak) to 5 (strong) answer.' },
          betterAnswer: { type: 'string', description: 'A concrete stronger answer for this question.' },
          atSec: {
            type: 'integer',
            description:
              'Seconds into the recording where this question was asked, from a "[Ns]" tag. Include ONLY when the transcript is timestamped; otherwise omit.',
          },
        },
        required: ['question', 'answerSummary', 'assessment', 'score', 'betterAnswer'],
        additionalProperties: false,
      },
    },
    strengths: {
      type: 'array',
      description: 'What the candidate genuinely did well (specific).',
      items: { type: 'string' },
    },
    improvements: {
      type: 'array',
      description: 'Highest-leverage, specific things to improve next time.',
      items: { type: 'string' },
    },
    redFlags: {
      type: 'array',
      description: 'Moments that would worry an interviewer. Empty if none.',
      items: { type: 'string' },
    },
  },
  required: [
    'roundType',
    'roundConfidence',
    'roundRationale',
    'overallScore',
    'grade',
    'hireSignal',
    'summary',
    'dimensions',
    'exchanges',
    'strengths',
    'improvements',
    'redFlags',
  ],
  additionalProperties: false,
}
