import { chatStructured } from '../llmClient'
import { SPOKEN_SCRIPT_PROMPT, SPOKEN_SCRIPT_SCHEMA } from '../../data/criteria'
import { DEFAULT_MODEL } from '../models'
import type { Story } from '../../data/stories'
import type { Project } from '../../data/projects'
import type { SpokenScript, Transcript } from '../../types'
import { projectsBlock, storiesBlock } from './llmAnalyzer'

// Coaching-mode "say it like this" script — the exact words the candidate should deliver. It runs on
// EVERY coaching-mode grade, built from the candidate's own answer (true stories/projects only enrich
// it when present), so it never depends on the story bank having a matching entry. It's a separate,
// tiny LLM call because the STAR grade schema is already at the constrained-decoding grammar-size
// limit. Runs in parallel with the grade (no added wall-clock time) and is best-effort — a failure
// never fails the graded result.

export interface ScriptInput {
  question: string
  transcript: Transcript
  stories?: Story[]
  projects?: Project[]
  signal?: AbortSignal
}

export async function generateSpokenScript({
  question,
  transcript,
  stories,
  projects,
  signal,
}: ScriptInput): Promise<SpokenScript | null> {
  // Nothing to build a script from if the candidate said nothing.
  if (!transcript?.text?.trim()) return null

  const lines: string[] = []
  lines.push(`INTERVIEW QUESTION:\n${question || '(none provided)'}`)
  lines.push('')
  lines.push('SPOKEN ANSWER:')
  lines.push(transcript.text)
  if (stories?.length) {
    lines.push('')
    lines.push(storiesBlock(stories))
  }
  if (projects?.length) {
    lines.push('')
    lines.push(projectsBlock(projects))
  }

  try {
    const { parsed } = await chatStructured<{ spokenScript?: string[] }>({
      provider: 'anthropic',
      model: DEFAULT_MODEL,
      system: SPOKEN_SCRIPT_PROMPT,
      user: lines.join('\n'),
      schema: SPOKEN_SCRIPT_SCHEMA,
      maxTokens: 1200,
      signal,
    })
    const script = (parsed.spokenScript || []).map((s) => s.trim()).filter(Boolean)
    return script.length ? script : null
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    console.warn('[script] spoken-script generation failed:', (e as Error)?.message)
    return null
  }
}
