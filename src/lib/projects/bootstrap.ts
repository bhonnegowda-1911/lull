import { chatStructured } from '../llmClient'
import { FAST_MODEL } from '../models'

// Cold-start: turn a pasted resume into skeleton PROJECTS (one per notable effort) so the builder
// isn't empty on day one. Only title/roleRef/summary are filled — the competency facets are left
// blank for the candidate to capture via the level-aware builder (that depth isn't in a resume).
// One LLM call.

export interface ProjectSkeleton {
  title: string
  roleRef: string
  summary: string
}

const SYSTEM = `You read a candidate's resume and propose skeleton PROJECTS for their prep — one per
notable, story-worthy effort (aim for 3-6; skip generic duties). Use ONLY what the resume states;
do not invent. For each: a short title, the roleRef (company/role), and a 1-2 sentence summary of
what was built. Do NOT attempt the deeper competency details — those are captured later.`

export const SCHEMA = {
  type: 'object',
  properties: {
    projects: {
      type: 'array',
      description: '3-6 skeleton projects, most significant first.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          roleRef: { type: 'string', description: 'Company/role, else empty string.' },
          summary: { type: 'string', description: 'What was built, 1-2 sentences.' },
        },
        required: ['title', 'roleRef', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['projects'],
  additionalProperties: false,
}

export async function bootstrapProjects(resumeText: string, signal?: AbortSignal): Promise<ProjectSkeleton[]> {
  const trimmed = resumeText.trim()
  if (!trimmed) return []
  const { parsed } = await chatStructured<{ projects?: ProjectSkeleton[] }>({
    provider: 'anthropic',
    model: FAST_MODEL,
    system: SYSTEM,
    user: `RESUME:\n${trimmed}`,
    schema: SCHEMA,
    maxTokens: 1500,
    signal,
  })
  return parsed.projects || []
}
