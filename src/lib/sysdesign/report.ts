import { chatStructured } from '../llmClient'
import { REPORT_MODEL } from '../models'
import { TARGET_LEVEL_LABEL, type TargetLevel } from '../interview/persona'
import { STAGES, LEVELS, type SysDesignLevel } from '../../data/sysdesign/stages'
import type { Problem } from '../../data/sysdesign/problems'
import type { Coverage, Turn } from './conversation'
import type { Severity } from '../../types'

// The final, cross-stage leveling report. Runs once at the end of a session. It receives
// every stage's transcript + coverage snapshot and grades the WHOLE performance against the
// per-stage mid/senior/staff rubric, then produces an overall level and concrete guidance
// to reach the next one — mirroring the behavioral app's levelSignal/toReachHigher pattern.

export interface ReportOverall {
  level: SysDesignLevel
  rationale: string
  signals: string[]
}

export interface ReportStage {
  stageId: string
  rating: number
  level: SysDesignLevel
  summary: string
  strengths: string[]
  gaps: string[]
}

export interface ReportGuidance {
  level: SysDesignLevel
  guidance: string[]
}

export interface ReportPriority {
  title: string
  detail: string
  severity: Severity
}

export interface ReferenceSolution {
  crux: string
  perStage: Array<{ stageId: string; points: string[] }>
}

/** Time/space complexity read for the candidate's final solution vs the optimal. Optional on the
 *  shared report — only the coding mode produces it (system design / build leave it undefined). */
export interface ComplexityAnalysis {
  optimalTime: string
  optimalSpace: string
  achievedTime: string
  achievedSpace: string
  /** Whether the candidate's solution reached the optimal time AND space complexity. */
  matchedOptimal: boolean
  /** One or two sentences on the candidate's complexity and whether they justified it correctly. */
  analysis: string
}

export interface SysDesignReport {
  overall: ReportOverall
  perStage: ReportStage[]
  toReachHigher: ReportGuidance[]
  topPriorities: ReportPriority[]
  referenceSolution: ReferenceSolution
  /** Coding-mode only: time/space complexity analysis of the implemented solution. */
  complexity?: ComplexityAnalysis
}

export interface StageSessionInput {
  stageId: string
  label: string
  transcript: Turn[]
  coverage: Coverage | null
  skipped: boolean
}

// Exported so sibling modes (e.g. the Build mode) can produce the same leveling-report shape
// and reuse the report renderer, without redefining this ~90-line schema.
export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    overall: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: LEVELS, description: 'Overall level this session demonstrates.' },
        rationale: { type: 'string', description: 'One or two sentences explaining the overall call.' },
        signals: {
          type: 'array',
          description: 'Concrete signals (or missing signals) across the session that drove the level.',
          items: { type: 'string' },
        },
      },
      required: ['level', 'rationale', 'signals'],
      additionalProperties: false,
    },
    perStage: {
      type: 'array',
      description: 'One entry per stage that was attempted, in order.',
      items: {
        type: 'object',
        properties: {
          stageId: { type: 'string', description: 'The stage id.' },
          rating: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1 (weak) to 5 (strong).' },
          level: { type: 'string', enum: LEVELS, description: 'Level this stage demonstrated.' },
          summary: { type: 'string', description: 'One or two sentences on how this stage went.' },
          strengths: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
        },
        required: ['stageId', 'rating', 'level', 'summary', 'strengths', 'gaps'],
        additionalProperties: false,
      },
    },
    toReachHigher: {
      type: 'array',
      description:
        'For the next 1-2 levels above the demonstrated one, concrete things to do differently in THIS kind of problem. Empty if already staff.',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: LEVELS },
          guidance: { type: 'array', items: { type: 'string' } },
        },
        required: ['level', 'guidance'],
        additionalProperties: false,
      },
    },
    topPriorities: {
      type: 'array',
      description: 'The most important improvements overall, ranked. Most important first.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'detail', 'severity'],
        additionalProperties: false,
      },
    },
    referenceSolution: {
      type: 'object',
      description:
        'An independent model answer for THIS problem — what a strong (senior/staff) candidate would cover. Write it on its own merits, NOT as a critique of the candidate.',
      properties: {
        crux: {
          type: 'string',
          description: 'One or two sentences naming the most interesting/important problem in this design.',
        },
        perStage: {
          type: 'array',
          description: 'The key moves a strong answer makes at each stage.',
          items: {
            type: 'object',
            properties: {
              stageId: { type: 'string' },
              points: { type: 'array', items: { type: 'string' } },
            },
            required: ['stageId', 'points'],
            additionalProperties: false,
          },
        },
      },
      required: ['crux', 'perStage'],
      additionalProperties: false,
    },
  },
  required: ['overall', 'perStage', 'toReachHigher', 'topPriorities', 'referenceSolution'],
  additionalProperties: false,
}

// The candidate told us which level they're targeting. We do NOT grade toward it (the demonstrated
// level must stay honest), but it lets the report aim its improvement guidance at the right rung.
function targetLine(targetLevel?: TargetLevel): string {
  if (!targetLevel) return ''
  return `\nThe candidate is interviewing for a ${TARGET_LEVEL_LABEL[targetLevel]}-level role. Grade the level the performance ACTUALLY demonstrates — do not grade toward the target — but focus your improvement guidance on what would get them to the ${TARGET_LEVEL_LABEL[targetLevel]} bar.\n`
}

function systemPrompt(problem: Problem, targetLevel?: TargetLevel): string {
  const rubric = STAGES.map(
    (s) =>
      `### ${s.label} (id: ${s.id})\n- Mid: ${s.levelRubric.mid}\n- Senior: ${s.levelRubric.senior}\n- Staff: ${s.levelRubric.staff}`,
  ).join('\n\n')

  return `You are a calibrated system-design interview evaluator. Grade how the candidate
performed across a whole interview and infer the LEVEL the performance signals: junior, mid,
senior, or staff. Judge by scope of thinking, prioritization, tradeoff reasoning, and how
proactively they drove the design — NOT by buzzwords. This is the level the PERFORMANCE
demonstrates, not a verdict on the person.
${targetLine(targetLevel)}
THE PROBLEM:
${problem.statement}

PER-STAGE LEVELING RUBRIC (grade each attempted stage against this):
${rubric}

CALIBRATION — apply these anchors consistently so levels mean the same thing every run:
- JUNIOR: needs constant prompting; names components without reasons; no prioritization or numbers.
  ("It should be scalable and fast.")
- MID: produces a workable answer when guided; states choices but not the tradeoffs behind them;
  reactive in deep dives. ("Use a cache and a load balancer.")
- SENIOR: prioritizes and quantifies; justifies choices with explicit tradeoffs; proactively leads
  1-2 deep dives. ("Reads dominate ~100:1, so I'll precompute timelines in Redis; cost is write
  amplification, acceptable except for celebrities.")
- STAFF: frames the crux of the problem early; reasons about cost, failure, and evolution; drives
  multiple deep dives and adapts cleanly to curveballs; knows which problem is the interesting one.
Do not inflate. If signals are thin, choose the lowest level the evidence supports.

Be honest and specific, citing what the candidate actually said. For the overall level,
weight the high-level design and deep dives most heavily — that is where senior/staff signal
separates from mid. Give concrete, problem-specific guidance for the next 1-2 levels up
(empty if already staff). Skipped stages should be omitted from the grading perStage.

Finally, produce referenceSolution: an INDEPENDENT model answer for this problem — what a
strong candidate would cover at each stage and the crux of the design. Write it on its own
merits as a learning aid, not as a critique of this candidate.`
}

function buildUserMessage(stageSessions: StageSessionInput[], hasWhiteboard = false): string {
  const lines: string[] = []
  if (hasWhiteboard) {
    lines.push(
      "The attached image is the candidate's whiteboard for this design. Grade it as part of their",
      'answer — what the diagram shows (components, data flow, labels) is design signal alongside the',
      'transcript. Reward a clear, correct diagram; note gaps or contradictions between it and what',
      'they said.',
      '',
    )
  }
  for (const s of stageSessions) {
    lines.push(`=== STAGE: ${s.label} (id: ${s.stageId})${s.skipped ? ' — SKIPPED' : ''} ===`)
    if (s.skipped) {
      lines.push('(Candidate skipped this stage.)', '')
      continue
    }
    for (const turn of s.transcript) {
      const who = turn.role === 'candidate' ? 'CANDIDATE' : 'INTERVIEWER'
      lines.push(`${who}: ${turn.text}`)
    }
    if (s.coverage) {
      if (s.coverage.covered?.length) lines.push(`[covered: ${s.coverage.covered.join('; ')}]`)
      if (s.coverage.missing?.length) lines.push(`[still missing: ${s.coverage.missing.join('; ')}]`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export interface GenerateReportArgs {
  problem: Problem
  stageSessions: StageSessionInput[]
  /** Role level the candidate is targeting — calibrates the report's improvement guidance. */
  targetLevel?: TargetLevel
  /** Base64 PNG of the candidate's final whiteboard, graded as part of the design. */
  whiteboardImage?: string | null
  model?: string
  signal?: AbortSignal
}

/** Generate the final leveling report for a completed session. */
export async function generateReport({
  problem,
  stageSessions,
  targetLevel,
  whiteboardImage = null,
  model = REPORT_MODEL,
  signal,
}: GenerateReportArgs): Promise<SysDesignReport> {
  // No `temperature` here — Opus 4.8 rejects it. Adaptive thinking is the quality lever
  // instead; it shares the max_tokens budget, so give the JSON report ample headroom
  // (12K stays under the non-streaming HTTP-timeout threshold, so no streaming needed).
  const { parsed } = await chatStructured<SysDesignReport>({
    provider: 'anthropic',
    model,
    system: systemPrompt(problem, targetLevel),
    user: buildUserMessage(stageSessions, Boolean(whiteboardImage)),
    images: whiteboardImage ? [whiteboardImage] : undefined,
    schema: REPORT_SCHEMA,
    maxTokens: 12000,
    thinking: 'adaptive',
    signal,
  })
  return parsed
}
