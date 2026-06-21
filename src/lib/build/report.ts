import { chatStructured } from '../llmClient'
import { REPORT_MODEL } from '../models'
import { REPORT_SCHEMA, type SysDesignReport } from '../sysdesign/report'
import { RUBRIC } from '../../data/build/rubric'
import type { BuildProblem } from '../../data/build/problems'
import type { Coverage, Turn } from './conversation'

// The final leveling report for a Build-mode session. The candidate implements offline; this
// grades how well they PLANNED and PRIORITIZED. It reuses the system-design report's SHAPE,
// schema, and renderer, but grades the five rubric DIMENSIONS (rubric.ts) instead of the
// conversation stages: each `perStage` entry is a dimension (stageId = dimension id), so the
// shared renderer's per-row view shows one row per rubric dimension.

// Re-exported so the component layer has one import site for the report data type.
export type { SysDesignReport as BuildReport } from '../sysdesign/report'

export interface BuildStageSessionInput {
  stageId: string
  label: string
  transcript: Turn[]
  coverage: Coverage | null
}

function systemPrompt(problem: BuildProblem): string {
  const rubric = RUBRIC.map(
    (d) =>
      `### ${d.label} (id: ${d.id}) — ${d.weight.toUpperCase()}\n${d.description}\n- Mid: ${d.levels.mid}\n- Senior: ${d.levels.senior}\n- Staff: ${d.levels.staff}`,
  ).join('\n\n')

  return `You are a calibrated evaluator for a timed, AI-assisted "design AND implement"
challenge. The candidate implements OFFLINE; you are grading the PLANNING conversation, where
the whole point is PRIORITIZATION. Infer the LEVEL the planning signals: junior, mid, senior, or
staff. This is the level the PERFORMANCE demonstrates, not a verdict on the person.

THE CHALLENGE (implemented offline by the candidate):
${problem.statement}
Language: ${problem.language}

GRADE THESE FIVE DIMENSIONS (output one perStage entry per dimension, using the id shown):
${rubric}

WEIGHTING — this mode is about prioritization. Weight the two PRIMARY dimensions (scoping and a
running core) most heavily in the overall level; the SECONDARY dimensions (security, code
quality, AI usage) refine it. A candidate who scopes ruthlessly and gets a running core early is
prioritizing well even if a secondary dimension is thin.

CALIBRATION — apply consistently; do not inflate:
- JUNIOR: takes the prompt at face value; over-ambitious or vague plan; no cut line; ignores the untrusted-code risk.
- MID: a workable plan when prompted; some scoping but fuzzy on the running core; names risks only when asked.
- SENIOR: commits to a finishable slice, a clear running core and build order, flags the sandboxing risk, and has a real plan for code quality and AI use.
- STAFF: scopes around the riskiest/most valuable part, walking-skeleton mindset, reasons about the threat model and where it sits in the priority order, and re-prioritizes cleanly under curveballs.

Be honest and specific, citing what the candidate actually said. For each dimension produce a
perStage entry with its id as stageId, a 1-5 rating, a level, a short summary, strengths, and
gaps. Give concrete, challenge-specific guidance for the next 1-2 levels up (empty if already
staff). Finally produce referenceSolution: an INDEPENDENT model PLAN for this challenge — how a
strong candidate would prioritize — written as a learning aid, where each perStage points entry
uses a rubric dimension id.`
}

function buildUserMessage(stageSessions: BuildStageSessionInput[]): string {
  const lines: string[] = []
  for (const s of stageSessions) {
    lines.push(`=== PLANNING STAGE: ${s.label} (id: ${s.stageId}) ===`)
    for (const turn of s.transcript) {
      lines.push(`${turn.role === 'candidate' ? 'CANDIDATE' : 'COACH'}: ${turn.text}`)
    }
    if (s.coverage) {
      if (s.coverage.covered?.length) lines.push(`[covered: ${s.coverage.covered.join('; ')}]`)
      if (s.coverage.missing?.length) lines.push(`[still missing: ${s.coverage.missing.join('; ')}]`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export interface GenerateBuildReportArgs {
  problem: BuildProblem
  stageSessions: BuildStageSessionInput[]
  model?: string
  signal?: AbortSignal
}

/** Generate the final prioritization report for a completed Build session. */
export async function generateBuildReport({
  problem,
  stageSessions,
  model = REPORT_MODEL,
  signal,
}: GenerateBuildReportArgs): Promise<SysDesignReport> {
  // No `temperature` (Opus 4.8 rejects it); adaptive thinking is the quality lever. Give the
  // JSON report ample headroom while staying under the non-streaming HTTP-timeout threshold.
  const { parsed } = await chatStructured<SysDesignReport>({
    provider: 'anthropic',
    model,
    system: systemPrompt(problem),
    user: buildUserMessage(stageSessions),
    schema: REPORT_SCHEMA,
    maxTokens: 12000,
    thinking: 'adaptive',
    signal,
  })
  return parsed
}
