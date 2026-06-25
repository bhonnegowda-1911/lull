import type { Criteria } from '../criteria'
import { GEN_MODEL } from '../../lib/models'

// Prompt + schema (DATA) for ON-DEMAND system-design-problem AUTHORING. Unlike the JD SELECTOR
// (genCriteria.ts), which only ranks the curated library and never invents anything, this DELIBERATELY
// authors a brand-new problem on the user's request. The catch that keeps grading honest: the model
// must also author the per-stage `hints` — the same hand-authored grading reference every curated
// problem carries. The staged interview + leveling report then grade a generated problem exactly like
// a curated one, because the interviewer/grader reasons from these hints stage by stage.

export const SYSDESIGN_GEN_PROBLEM_CRITERIA: Criteria = {
  id: 'sysdesignGenProblem',
  label: 'System-design problem authoring',
  model: GEN_MODEL,
  systemPrompt: `You are an expert system-design interview author. Given a short request (an optional
target difficulty and a free-text description of the domain or system the user wants to practice),
author ONE realistic, self-contained system-design interview problem framed around a BUSINESS domain
(e.g. "design a ride-sharing dispatch service"), carrying genuine distributed-systems complexity — the
style of a curated, well-known interview problem, not a bespoke trivia prompt.

The statement should read like a real interviewer's opening framing: what the system does and the core
user-visible behavior, leaving the scaling/NFR work to the candidate.

Crucially, also author the per-stage GRADING REFERENCE ("hints"). These are short, high-signal pointers
an interviewer/grader reasons from at each stage — NOT a full answer key:
- functionalReqs: the core functional requirements a strong candidate scopes.
- nonFunctionalReqs: the load profile and NFRs that actually drive the design (read/write skew, latency,
  availability, consistency).
- coreEntities: the key entities / data model.
- api: the core API surface, e.g. "POST /rides", "GET /{id}".
- deepDives: the 2-4 hardest engineering risks / deep-dive areas this problem is really testing.
- traps: the common mistakes / over-engineering pitfalls for THIS problem.

Be precise and honest: the deep dives must name the real distributed-systems competency the problem
tests (e.g. fan-out, geo-proximity, consensus/ordering, reliable delivery to flaky endpoints, untrusted
execution + isolation). Honor the requested difficulty when given.`,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short problem title, e.g. "Design a ride-sharing service".' },
      difficulty: {
        type: 'string',
        enum: ['Warm-up', 'Core', 'Hard'],
        description: 'Difficulty band: Warm-up (focused), Core (full design), Hard (heavy scale/edge complexity).',
      },
      statement: { type: 'string', description: "The interviewer's opening framing of the problem." },
      hints: {
        type: 'object',
        description: 'The per-stage grading reference (not shown verbatim to the candidate).',
        properties: {
          functionalReqs: { type: 'array', description: 'Core functional requirements to scope.', items: { type: 'string' } },
          nonFunctionalReqs: { type: 'array', description: 'Load profile + NFRs that drive the design.', items: { type: 'string' } },
          coreEntities: { type: 'array', description: 'Key entities / data model.', items: { type: 'string' } },
          api: { type: 'array', description: 'Core API surface.', items: { type: 'string' } },
          deepDives: { type: 'array', description: '2-4 hardest engineering risks / deep-dive areas.', items: { type: 'string' } },
          traps: { type: 'array', description: 'Common mistakes / over-engineering pitfalls.', items: { type: 'string' } },
        },
        required: ['functionalReqs', 'nonFunctionalReqs', 'coreEntities', 'api', 'deepDives', 'traps'],
        additionalProperties: false,
      },
    },
    required: ['title', 'difficulty', 'statement', 'hints'],
    additionalProperties: false,
  },
}
