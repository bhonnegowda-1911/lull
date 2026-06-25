// The coding-interview stages, in order. Each stage is DATA: its goal, what the interviewer should
// probe for, a time budget, and a mid/senior/staff leveling rubric — the direct analog of the
// system-design stages (src/data/sysdesign/stages.ts). The conversation engine turns
// `goal` + `probeFor` + `levelRubric` into the interviewer's system prompt; the final report uses
// `levelRubric` to grade the stage. Mirrors the sysdesign Stage shape so the shared stage UI
// (StageTracker, StageConversation) and the shared report renderer work unchanged.

export type CodingLevel = 'junior' | 'mid' | 'senior' | 'staff'

export interface CodingStage {
  id: string
  label: string
  minutes: number
  goal: string
  probeFor: string[]
  levelRubric: { mid: string; senior: string; staff: string }
  optional?: boolean
  escalate?: boolean
}

export const STAGES: CodingStage[] = [
  {
    id: 'clarify',
    label: 'Clarify & examples',
    minutes: 4,
    goal: 'Restate the problem, lock down input/output, and agree on a concrete example or two before coding.',
    probeFor: [
      'Restating the problem in their own words to confirm understanding',
      'Asking about input ranges, types, duplicates, empties, and sort order',
      'Working a small concrete example end-to-end to align on expected output',
    ],
    levelRubric: {
      mid: 'Restates the problem but jumps toward a solution with few clarifying questions; assumes constraints.',
      senior:
        'Asks the high-value clarifying questions (ranges, edge cases, ties) and grounds them on a concrete worked example.',
      staff:
        'Surfaces the non-obvious ambiguity that changes the approach (e.g. sorted input, streaming, in-place) and pins down the contract crisply.',
    },
  },
  {
    id: 'bruteforce',
    label: 'Brute force & complexity',
    minutes: 4,
    goal: 'State a correct-but-naive approach and its time/space complexity, as a baseline to improve on.',
    probeFor: [
      'A clearly correct approach, even if slow — correctness before cleverness',
      'Stating its time AND space complexity in Big-O',
      'Recognizing why it is suboptimal (what the bottleneck is)',
    ],
    levelRubric: {
      mid: 'Reaches a brute force but is shaky stating its complexity or why it is slow.',
      senior: 'States a correct baseline with accurate Big-O and names the specific bottleneck to attack.',
      staff: 'Frames the baseline in one line and immediately identifies the structural reason it is slow, pointing at the optimal idea.',
    },
  },
  {
    id: 'optimal',
    label: 'Optimal approach',
    minutes: 6,
    escalate: true,
    goal: 'Identify the better approach — the key insight and data structure — and justify its complexity before coding.',
    probeFor: [
      'The core insight that unlocks a better complexity (hashing, two pointers, sliding window, sorting, DP state, etc.)',
      'Choosing the right data structure and justifying the resulting time/space',
      'Reasoning about the tradeoff vs. the brute force (space for time, etc.)',
    ],
    levelRubric: {
      mid: 'Lands on a better approach with hints; complexity justification is partial.',
      senior:
        'Independently finds the optimal approach, names the insight and data structure, and justifies the Big-O.',
      staff:
        'Articulates why this is optimal (lower-bound intuition), weighs alternatives, and adapts cleanly when the constraints are pushed.',
    },
  },
  {
    id: 'code',
    label: 'Implement',
    minutes: 12,
    goal: 'Write clean, correct, working code for the chosen approach.',
    probeFor: [
      'Translating the approach into correct, readable code',
      'Good naming, structure, and handling of the main path',
      'Not getting stuck — making steady progress and explaining as they go',
    ],
    levelRubric: {
      mid: 'Produces mostly-working code with some bugs or rough structure; needs nudges.',
      senior: 'Writes clean, correct code that matches the stated approach, with sensible structure and naming.',
      staff: 'Writes tight, idiomatic, obviously-correct code and proactively notes where bugs would hide.',
    },
  },
  {
    id: 'verify',
    label: 'Test & edge cases',
    minutes: 4,
    goal: 'Dry-run the code on examples, handle edge cases, and confirm the final complexity.',
    probeFor: [
      'Tracing the code on the agreed example and at least one edge case (empty, single, duplicates, overflow)',
      'Fixing any bug found during the trace',
      'Restating the final time/space complexity of the implemented solution',
    ],
    levelRubric: {
      mid: 'Runs through the happy path; misses some edge cases unless prompted.',
      senior: 'Systematically traces examples and edge cases, catches bugs, and confirms the final complexity.',
      staff: 'Tests adversarially (the inputs most likely to break it), reasons about correctness, and is precise on complexity.',
    },
  },
]

export const FIRST_STAGE = STAGES[0]

export function getStage(id: string): CodingStage {
  return STAGES.find((s) => s.id === id) || FIRST_STAGE
}

export function stageIndex(id: string): number {
  return STAGES.findIndex((s) => s.id === id)
}

export function nextStage(id: string): CodingStage | null {
  const i = stageIndex(id)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null
}

// The leveling ladder this feature reports against — same shape/labels as the sysdesign ladder so
// the shared report renderer and the Session.level field stay consistent across modes.
export const LEVELS: CodingLevel[] = ['junior', 'mid', 'senior', 'staff']
export const LEVEL_LABEL: Record<CodingLevel, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
}

// Languages the editor offers; the value is the CodeMirror language extension key.
export type CodeLanguage = 'javascript' | 'python' | 'java' | 'cpp'
export const LANGUAGES: Array<{ id: CodeLanguage; label: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
]
