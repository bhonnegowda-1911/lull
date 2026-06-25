import type { Criteria } from '../criteria'
import { GEN_MODEL } from '../../lib/models'

// Prompt + schema (DATA, like resumeCriteria) for the JD → system-design SELECTOR. Companies don't
// invent a bespoke problem for each candidate — they reach for a CANONICAL system-design problem
// (URL shortener, rate limiter, webhook delivery, code-execution sandbox, …) whose distributed-
// systems complexity matches the business they run. So this does NOT generate problems or grading
// keys; it RANKS the existing curated library by how likely each problem is for THIS company, given
// the JD. Every returned problemId must be one from the provided catalog — the selector maps a
// business domain to a known problem, the grading stays anchored to that problem's curated hints.

export const SYSDESIGN_SELECT_CRITERIA: Criteria = {
  id: 'sysdesignSelect',
  label: 'System-design problem selection',
  model: GEN_MODEL,
  systemPrompt: `You predict which system-design problems a specific company is likely to ask, from
their job description and a CATALOG of canonical problems.

Interviews use well-known problems framed around a BUSINESS domain (e.g. "design a ride-sharing
service"), each carrying distributed-systems complexity — NOT bespoke, hyper-specific prompts. Your
job is to MATCH and RANK, not to invent.

Map the company's domain and the hardest engineering risks named in the JD (prose, blog posts, and
"how we work" included) to the catalog. Crucially, companies often test the underlying COMPETENCY
rather than their literal product: an identity-security platform that runs untrusted third-party
integration logic is well-modeled by a code-execution sandbox and a reliable webhook-delivery system,
even though neither is "their product."

Pick the 3-4 MOST LIKELY problems, ranked. For each:
- problemId: MUST be an id from the catalog. Never invent an id or a problem.
- confidence: high / medium / low — drives the ranking.
- rationale: why THIS company would ask THIS problem, citing concrete JD signals. Name the shared
  distributed-systems competency (e.g. "untrusted execution + isolation", "reliable delivery to
  flaky endpoints", "fan-out", "geo-proximity", "consensus/ordering").

Ground every choice in the JD. Do not pick a problem the JD gives no signal for just to fill the list.`,
  schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        description: '3-4 catalog problems, ranked most-to-least likely (highest confidence first).',
        items: {
          type: 'object',
          properties: {
            problemId: { type: 'string', description: 'An id taken verbatim from the provided catalog.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Likelihood of this round; drives ranking.' },
            rationale: { type: 'string', description: 'Why this company asks this problem, citing JD signals + the shared competency.' },
          },
          required: ['problemId', 'confidence', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  },
}
