import { chatStructured } from '../llmClient'
import { JD_PARSE_CRITERIA } from '../../data/resumeCriteria'
import type { ParsedJob } from '../../types'

// Parse a pasted job description into structure via the LLM gateway. Prompt + schema are data
// (resumeCriteria.ts); this just assembles the user message and calls the provider-agnostic client.
// One LLM call. The result is stored on the job (job_descriptions.parsed) so a JD is parsed once.

export async function parseJobDescription(rawText: string, signal?: AbortSignal): Promise<ParsedJob> {
  const { parsed } = await chatStructured<ParsedJob>({
    provider: 'anthropic',
    model: JD_PARSE_CRITERIA.model,
    system: JD_PARSE_CRITERIA.systemPrompt,
    user: `JOB DESCRIPTION:\n${rawText.trim()}`,
    schema: JD_PARSE_CRITERIA.schema,
    maxTokens: 1200,
    signal,
  })
  return parsed
}
