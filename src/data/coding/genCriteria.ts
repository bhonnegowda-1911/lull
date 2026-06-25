import type { Criteria } from '../criteria'
import { GEN_MODEL } from '../../lib/models'

// Prompt + schema (DATA, like sysdesign/genCriteria) for the JD → coding-screen SELECTOR. Companies
// don't invent a bespoke algorithm question per candidate — they reach for canonical DSA patterns
// (hashing, two pointers, sliding window, intervals, BFS/DFS, DP, binary search) sized to the role.
// So this does NOT generate problems or grading keys; it RANKS the curated coding bank by how likely
// each problem (really, each pattern) is for THIS role, given the JD. Every returned problemId must
// be one from the provided catalog — grading stays anchored to that problem's curated hints.

export const CODING_SELECT_CRITERIA: Criteria = {
  id: 'codingSelect',
  label: 'Coding problem selection',
  model: GEN_MODEL,
  systemPrompt: `You predict which coding/DSA problems a specific company is likely to ask in a
technical screen, from their job description and a CATALOG of canonical problems.

Technical screens use well-known DSA PATTERNS (hashing, two pointers, sliding window, stacks,
intervals, binary search, BFS/DFS on graphs/matrices, dynamic programming), each represented by a
canonical problem — NOT bespoke prompts. Your job is to MATCH and RANK, not to invent.

Map the role's signals to patterns: front-end/product roles skew toward strings, hash maps, and
arrays; backend/infra and data roles skew toward graphs, intervals, and DP; a stated seniority and a
"strong CS fundamentals / algorithms" emphasis raises the difficulty mix. Use the JD prose, not just
parsed fields.

Pick the 3-4 MOST LIKELY problems, ranked. For each:
- problemId: MUST be an id from the catalog. Never invent an id or a problem.
- confidence: high / medium / low — drives the ranking.
- rationale: why THIS role would ask THIS pattern, citing concrete JD signals and naming the DSA
  pattern (e.g. "hash-map lookups", "sliding window", "graph traversal", "interval merging").

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
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Likelihood of this problem; drives ranking.' },
            rationale: { type: 'string', description: 'Why this role asks this pattern, citing JD signals + the DSA pattern.' },
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
