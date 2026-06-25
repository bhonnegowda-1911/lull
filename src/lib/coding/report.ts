import { chatStructured } from '../llmClient'
import { REPORT_MODEL } from '../models'
import { REPORT_SCHEMA, type SysDesignReport } from '../sysdesign/report'
import { TARGET_LEVEL_LABEL, type TargetLevel } from '../interview/persona'
import { STAGES } from '../../data/coding/stages'
import type { CodingProblem } from '../../data/coding/problems'
import type { Coverage, Turn } from './conversation'

// Coding adds a structured time/space complexity analysis on top of the shared leveling report:
// what the candidate's FINAL solution achieves vs the problem's optimal, and whether they matched
// it. We extend the shared REPORT_SCHEMA (rather than mutate it) so system design / build are
// untouched; the renderer shows this section only when `complexity` is present.
const COMPLEXITY_SCHEMA = {
  type: 'object',
  description:
    "Time/space complexity of the candidate's FINAL implemented solution vs the optimal for this problem.",
  properties: {
    optimalTime: { type: 'string', description: 'Optimal time complexity for this problem, e.g. "O(n)".' },
    optimalSpace: { type: 'string', description: 'Optimal space complexity, e.g. "O(1)".' },
    achievedTime: { type: 'string', description: "The candidate's final solution's time complexity, e.g. \"O(n log n)\"." },
    achievedSpace: { type: 'string', description: "The candidate's final solution's space complexity." },
    matchedOptimal: { type: 'boolean', description: 'True iff the solution reached BOTH the optimal time and space.' },
    analysis: {
      type: 'string',
      description:
        "One or two sentences on the candidate's solution complexity and whether they stated/justified it correctly during the interview.",
    },
  },
  required: ['optimalTime', 'optimalSpace', 'achievedTime', 'achievedSpace', 'matchedOptimal', 'analysis'],
  additionalProperties: false,
}

const CODING_REPORT_SCHEMA = {
  ...REPORT_SCHEMA,
  properties: { ...REPORT_SCHEMA.properties, complexity: COMPLEXITY_SCHEMA },
  required: [...REPORT_SCHEMA.required, 'complexity'],
}

// The final, cross-stage leveling report for a coding interview. Runs once at the end. It reuses the
// system-design report's SHAPE, schema, and renderer (REPORT_SCHEMA / SysDesignReport), but grades
// the coding stages (clarify → brute force → optimal → code → verify) against their per-stage
// mid/senior/staff rubric — the same reuse pattern the Build mode uses (src/lib/build/report.ts).

// Re-exported so the component layer has one import site for the report data type.
export type { SysDesignReport as CodingReport } from '../sysdesign/report'

export interface CodingStageSessionInput {
  stageId: string
  label: string
  transcript: Turn[]
  coverage: Coverage | null
  skipped: boolean
}

// Targeting level calibrates the improvement guidance; the demonstrated level stays graded honestly.
function targetLine(targetLevel?: TargetLevel): string {
  if (!targetLevel) return ''
  return `\nThe candidate is interviewing for a ${TARGET_LEVEL_LABEL[targetLevel]}-level role. Grade the level the performance ACTUALLY demonstrates — do not grade toward the target — but focus your improvement guidance on what would get them to the ${TARGET_LEVEL_LABEL[targetLevel]} bar.\n`
}

function systemPrompt(problem: CodingProblem, targetLevel?: TargetLevel): string {
  const rubric = STAGES.map(
    (s) => `### ${s.label} (id: ${s.id})\n- Mid: ${s.levelRubric.mid}\n- Senior: ${s.levelRubric.senior}\n- Staff: ${s.levelRubric.staff}`,
  ).join('\n\n')

  return `You are a calibrated coding-interview evaluator. Grade how the candidate performed across a
whole DSA interview and infer the LEVEL the performance signals: junior, mid, senior, or staff. Judge
by correctness, the quality of the approach (did they reach optimal and justify complexity), clean
code, and how systematically they tested — NOT by whether they recognized the problem. This is the
level the PERFORMANCE demonstrates, not a verdict on the person.
${targetLine(targetLevel)}
THE PROBLEM:
${problem.statement}

REFERENCE (the strong solution, for your judgment — the candidate did not see this):
- Optimal approach: ${problem.hints.optimal}
- Optimal complexity: ${problem.hints.optimalComplexity}
- Edge cases: ${problem.hints.edgeCases.join('; ')}
- Common traps: ${problem.hints.traps.join('; ')}

PER-STAGE LEVELING RUBRIC (grade each attempted stage against this):
${rubric}

CALIBRATION — apply these anchors consistently so levels mean the same thing every run:
- JUNIOR: needs heavy hinting; struggles to reach a correct approach; shaky on Big-O; buggy code; tests only the happy path.
- MID: reaches a working solution when guided; states complexity but not always tightly; some edge cases missed.
- SENIOR: independently reaches the optimal approach, justifies complexity, writes clean correct code, and tests edge cases methodically.
- STAFF: sees the key insight fast, reasons about optimality and tradeoffs, writes tight idiomatic code, and tests adversarially; adapts cleanly to curveballs.
Do not inflate. If signals are thin, choose the lowest level the evidence supports.

Be honest and specific, citing what the candidate actually said or wrote. Weight the OPTIMAL approach
and the IMPLEMENT stages most heavily — that is where senior/staff signal separates from mid. Give
concrete, problem-specific guidance for the next 1-2 levels up (empty if already staff). Skipped
stages should be omitted from perStage.

Also produce complexity: the time AND space complexity of the candidate's FINAL implemented solution
(read it from their code and what they stated), the optimal time/space for this problem, whether they
matched optimal, and a one or two sentence read on whether they analyzed it correctly. The optimal for
THIS problem is "${problem.hints.optimalComplexity}". If the candidate never reached working code, base
achieved* on the best approach they committed to and say so in the analysis.

Finally, produce referenceSolution: an INDEPENDENT model answer for this problem — the key insight,
optimal approach, complexity, and the edge cases a strong candidate covers at each stage. Write it on
its own merits as a learning aid, not as a critique of this candidate.`
}

function buildUserMessage(stageSessions: CodingStageSessionInput[]): string {
  const lines: string[] = []
  for (const s of stageSessions) {
    lines.push(`=== STAGE: ${s.label} (id: ${s.stageId})${s.skipped ? ' — SKIPPED' : ''} ===`)
    if (s.skipped) {
      lines.push('(Candidate skipped this stage.)', '')
      continue
    }
    for (const turn of s.transcript) {
      lines.push(`${turn.role === 'candidate' ? 'CANDIDATE' : 'INTERVIEWER'}: ${turn.text}`)
    }
    if (s.coverage) {
      if (s.coverage.covered?.length) lines.push(`[covered: ${s.coverage.covered.join('; ')}]`)
      if (s.coverage.missing?.length) lines.push(`[still missing: ${s.coverage.missing.join('; ')}]`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export interface GenerateCodingReportArgs {
  problem: CodingProblem
  stageSessions: CodingStageSessionInput[]
  /** Role level the candidate is targeting — calibrates the report's improvement guidance. */
  targetLevel?: TargetLevel
  model?: string
  signal?: AbortSignal
}

/** Generate the final leveling report for a completed coding session. */
export async function generateReport({
  problem,
  stageSessions,
  targetLevel,
  model = REPORT_MODEL,
  signal,
}: GenerateCodingReportArgs): Promise<SysDesignReport> {
  const { parsed } = await chatStructured<SysDesignReport>({
    provider: 'anthropic',
    model,
    system: systemPrompt(problem, targetLevel),
    user: buildUserMessage(stageSessions),
    schema: CODING_REPORT_SCHEMA,
    maxTokens: 12000,
    thinking: 'adaptive',
    signal,
  })
  return parsed
}
