import { fillerAnalyzer } from './analyzers/fillerAnalyzer'
import { makeLlmAnalyzer } from './analyzers/llmAnalyzer'
import { DEFAULT_CRITERIA, type Criteria } from '../data/criteria'
import type { Story } from '../data/stories'
import type { Project } from '../data/projects'
import type { AnalyzerContext, FillerAnalyzerResult, LlmAnalyzerResult, ParsedJob, Transcript } from '../types'

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
  }

  onProgress('fillers')
  const fillerResult = await fillerAnalyzer.run(baseCtx)

  onProgress('analyzing')
  const llmAnalyzer = makeLlmAnalyzer(criteria)
  const llmResult = await llmAnalyzer.run({ ...baseCtx, filler: fillerResult.raw })

  return { filler: fillerResult, llm: llmResult }
}
