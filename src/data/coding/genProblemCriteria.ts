import type { Criteria } from '../criteria'
import { GEN_MODEL } from '../../lib/models'

// Prompt + schema (DATA) for ON-DEMAND coding-problem AUTHORING. Unlike the JD SELECTOR
// (genCriteria.ts), which only ranks the curated library and never invents anything, this DELIBERATELY
// authors a brand-new problem on the user's request. The catch that keeps grading honest: the model
// must also author the problem's `hints` — the same hand-authored grading reference every curated
// problem carries (optimal approach, complexity, edge cases, traps). The interview + report pipeline
// then grades a generated problem exactly like a curated one, because it reasons from these hints.

export const CODING_GEN_PROBLEM_CRITERIA: Criteria = {
  id: 'codingGenProblem',
  label: 'Coding problem authoring',
  model: GEN_MODEL,
  systemPrompt: `You are an expert interview-question author. Given a short request (an optional
DSA topic/pattern, an optional target difficulty, and a free-text description of what the user wants to
practice), author ONE realistic, self-contained coding/DSA interview problem in the style of a curated
LeetCode-grade question.

Make it a genuine, well-posed algorithmic problem — not a toy. It must have a clear optimal solution
with a known time/space complexity, concrete worked examples, and explicit constraints. Honor the
requested topic and difficulty when given; if the request is vague, choose the most natural canonical
pattern and a sensible difficulty.

Crucially, also author the GRADING REFERENCE ("hints"). This is NOT a full answer key shown to the
candidate — it is the short, high-signal pointers an interviewer/grader reasons from:
- clarifications: what a strong candidate asks up front.
- bruteForce: a correct naive baseline AND its complexity.
- optimal: the optimal approach — the key insight + data structure.
- optimalComplexity: the optimal time AND space, e.g. "O(n) time, O(n) space".
- edgeCases: the edge cases a strong candidate tests.
- traps: the common mistakes / traps for THIS problem.

Be precise and honest: the complexity you state must actually be achievable by the optimal approach you
describe, and the examples must be correct. Do not restate the same problem the request already names
verbatim — produce a clean, original phrasing.`,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short problem title, e.g. "Merge Intervals".' },
      difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'], description: 'Overall difficulty.' },
      topics: {
        type: 'array',
        description: 'DSA patterns this problem exercises, e.g. ["Sliding window", "Hash map"].',
        items: { type: 'string' },
      },
      statement: { type: 'string', description: 'The full problem statement. May use inline `code`.' },
      examples: {
        type: 'array',
        description: '1-3 concrete worked examples.',
        items: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'The input, e.g. "nums = [2,7,11], target = 9".' },
            output: { type: 'string', description: 'The expected output.' },
            explanation: { type: 'string', description: 'Optional short explanation; empty string if none.' },
          },
          required: ['input', 'output', 'explanation'],
          additionalProperties: false,
        },
      },
      constraints: {
        type: 'array',
        description: 'Input constraints, e.g. "1 ≤ n ≤ 10^5".',
        items: { type: 'string' },
      },
      hints: {
        type: 'object',
        description: 'The per-problem grading reference (not shown verbatim to the candidate).',
        properties: {
          clarifications: { type: 'array', description: 'What a strong candidate clarifies up front.', items: { type: 'string' } },
          bruteForce: { type: 'string', description: 'A correct naive baseline + its complexity.' },
          optimal: { type: 'string', description: 'The optimal approach: key insight + data structure.' },
          optimalComplexity: { type: 'string', description: 'Optimal time AND space, e.g. "O(n) time, O(1) space".' },
          edgeCases: { type: 'array', description: 'Edge cases a strong candidate tests.', items: { type: 'string' } },
          traps: { type: 'array', description: 'Common mistakes / traps for this problem.', items: { type: 'string' } },
        },
        required: ['clarifications', 'bruteForce', 'optimal', 'optimalComplexity', 'edgeCases', 'traps'],
        additionalProperties: false,
      },
    },
    required: ['title', 'difficulty', 'topics', 'statement', 'examples', 'constraints', 'hints'],
    additionalProperties: false,
  },
}
