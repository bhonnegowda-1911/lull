import { chatStructured } from '../llmClient'
import { GEN_MODEL } from '../models'
import type { StoryDraft } from '../../data/stories'
import type { Transcript } from '../../types'
import { SCHEMA as STORY_ITEM_SCHEMA } from './extract'

// Mine a whole recorded interview into the story bank. A behavioral / hiring-manager / project
// round is the candidate narrating several real experiences — each is a genuine STAR story. Unlike
// extract.ts (one practice answer → one draft), this distills the FULL transcript into MANY drafts,
// one per distinct experience the candidate told. Saved as 'draft' for the user to confirm; we never
// treat extracted content as ground truth until they do. Reuses the single-story item schema so a
// review-captured draft is identical to a practice-captured one.

const SYSTEM = `You read the transcript of a real job interview and extract the candidate's own STORIES
into their personal story bank. A story is a distinct real experience the candidate narrated about
their past work (a project, a conflict, a failure, a launch, a decision they owned).

The transcript MAY be diarized — lines prefixed "Speaker 0:", "Speaker 1:", etc. The interviewer is
whoever asks the questions; the CANDIDATE is whoever answers at length about their own experience.
Extract ONLY the candidate's stories — never the interviewer's words, and never the questions.

Rules:
- Extract ONLY what the candidate actually said. Do not invent facts, numbers, titles, or outcomes.
  If a field wasn't covered, leave it empty/short rather than fabricating.
- One entry per DISTINCT experience. If they told three different stories, return three. If they
  only referenced the same project repeatedly, return it once (merge the details).
- Skip generic chit-chat, logistics, and opinions that aren't a concrete experience.
- Return an empty array when the interview contains no real STAR-style stories (e.g. a pure coding
  screen or recruiter logistics call).

For each story produce:
- title: a short, memorable label (e.g. "Cut billing latency 40%").
- roleRef: the company/role/team if mentioned, else an empty string.
- star: situation, task, the key actions THEY took, the result, and a one-line takeaway/lesson if
  evident (else empty string; never invent one).
- impact: concrete metrics they cited (verbatim figures), whether the work was theirs ("i"),
  shared ("we"), or mixed, and the blast radius (self/team/org) the story implies.
- themes: which of the allowed categories this story can answer.
- trueCeilingLevel: the seniority the WORK itself demonstrates by scope/ownership/impact; choose the
  lowest level the evidence supports rather than inflating.`

export const INTERVIEW_STORIES_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      description: "One entry per distinct real experience the CANDIDATE narrated. Empty array if none.",
      items: STORY_ITEM_SCHEMA,
    },
  },
  required: ['stories'],
  additionalProperties: false,
}

export async function extractStoriesFromInterview({
  transcript,
  label,
  signal,
}: {
  transcript: Transcript
  label?: string | null
  signal?: AbortSignal
}): Promise<StoryDraft[]> {
  const user = [
    label?.trim() ? `INTERVIEW: ${label.trim()}` : '',
    'TRANSCRIPT (extract only the candidate’s own stories):',
    transcript?.text?.trim() || '(empty)',
  ]
    .filter(Boolean)
    .join('\n')

  const { parsed } = await chatStructured<{ stories: StoryDraft[] }>({
    provider: 'anthropic',
    model: GEN_MODEL,
    system: SYSTEM,
    user,
    schema: INTERVIEW_STORIES_SCHEMA,
    maxTokens: 4000,
    signal,
  })
  return Array.isArray(parsed.stories) ? parsed.stories : []
}
