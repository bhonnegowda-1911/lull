import { fillerAnalyzer } from './analyzers/fillerAnalyzer'
import { makeLlmAnalyzer } from './analyzers/llmAnalyzer'
import { DEFAULT_CRITERIA, type Criteria } from '../data/criteria'
import type { Story } from '../data/stories'
import type { Project } from '../data/projects'
import type { AnalyzerContext, FillerAnalyzerResult, FillerResult, LlmAnalyzerResult, ParsedJob, StarGrading, Transcript } from '../types'

// Orchestrates the two analyzers. Filler analysis runs first (local, instant, free) and
// its result is injected into the LLM context so the coaching can reference it — one LLM
// call total. `onProgress` lets the UI show legible progress.
//
// Coaching mode passes the candidate's matched true `stories`; the grader then critiques content
// (undersold impact, "we" vs "I", a stronger example) on top of delivery. Interview mode omits
// them, so the grade is the interviewer's read with no ground-truth leakage.
// When a target `job` is attached (either mode), the grader also rates the answer's fit to that
// company/JD bar — which JD must-haves it hit/missed, which company values it signaled.

export type PipelineStage = 'fillers' | 'analyzing'

export interface PipelineInput {
  question: string
  transcript: Transcript
  criteria?: Criteria
  fillers?: string[]
  stories?: Story[]
  projects?: Project[]
  /** When set: grade the answer's fit to this company/JD bar, on top of the STAR grade. */
  job?: ParsedJob | null
  signal?: AbortSignal
  onProgress?: (stage: PipelineStage) => void
  /**
   * Streams the STAR grade as it's produced: a `phase` change (the model thinking vs. writing) and
   * `partial` snapshots parsed from the JSON so far, so the UI can reveal scores/beats progressively
   * instead of blocking. Omit for the plain blocking grade.
   */
  onGrade?: (ev: { phase?: 'thinking' | 'writing'; partial?: Partial<StarGrading> }) => void
  /** Fires with the local filler result the instant it's computed — before the LLM grade starts — so
   *  the UI can show at least one real number immediately instead of an empty spinner. */
  onFiller?: (filler: FillerResult) => void
}

export async function runPipeline({
  question,
  transcript,
  criteria = DEFAULT_CRITERIA,
  fillers,
  stories,
  projects,
  job,
  signal,
  onProgress = () => {},
  onGrade,
  onFiller,
}: PipelineInput): Promise<{ filler: FillerAnalyzerResult; llm: LlmAnalyzerResult }> {
  const baseCtx: AnalyzerContext = {
    question,
    transcript,
    durationSec: transcript?.durationSec ?? null,
    fillers,
    stories,
    projects,
    job,
    signal,
    onGradeProgress: onGrade,
  }

  onProgress('fillers')
  const fillerResult = await fillerAnalyzer.run(baseCtx)
  onFiller?.(fillerResult.raw)

  onProgress('analyzing')
  const llmAnalyzer = makeLlmAnalyzer(criteria)
  const llmResult = await llmAnalyzer.run({ ...baseCtx, filler: fillerResult.raw })

  return { filler: fillerResult, llm: llmResult }
}
