// The "Build" mode is a PRIORITIZATION coach for timed build challenges (e.g. "build a
// LeetCode-style remote code executor in 60 min"). You do the actual implementation OFFLINE,
// timed and on your own; in here you talk through your PLAN and the coach pressure-tests your
// prioritization. So these stages structure a short planning conversation — they carry no
// leveling rubric of their own. Grading lives in the rubric DIMENSIONS (see rubric.ts), which
// the final report scores. The interviewer prompt is built from each stage's goal + probeFor.

export interface BuildStage {
  id: string
  label: string
  minutes: number
  goal: string
  probeFor: string[]
  /** The coach may inject a realistic curveball (a new constraint, a tempting rabbit hole). */
  escalate?: boolean
}

export const BUILD_STAGES: BuildStage[] = [
  {
    id: 'scope',
    label: 'Scope to something achievable',
    minutes: 5,
    goal: 'Clarify the ask, then cut it to a slice you could actually finish in the time box — and say what you are deliberately leaving out.',
    probeFor: [
      'Clarifying questions that pin down the real ask (language? sync or async? trusted or untrusted code?)',
      'Committing to a concrete, finishable slice rather than the whole problem',
      'An explicit cut line: what is in for the first pass vs. deferred',
    ],
  },
  {
    id: 'core',
    label: 'Define the running core',
    minutes: 5,
    escalate: true,
    goal: 'Name the thinnest end-to-end thing that actually RUNS, and the order you would build so something works early.',
    probeFor: [
      'A specific vertical slice that runs end-to-end (submit → execute → return), not a pile of components',
      'A build order that keeps something runnable at every step (walking skeleton first)',
      'Resisting gold-plating — what they will NOT polish until the core works',
    ],
  },
  {
    id: 'approach',
    label: 'Risks & approach',
    minutes: 5,
    escalate: true,
    goal: 'Flag the risks worth caring about and how you will work: the security/sandboxing trap, keeping the code clean under time, and how you will use the AI assistant.',
    probeFor: [
      'Naming the security / sandboxing risk of running untrusted code, even if mitigation is deferred',
      'How they will keep code quality reasonable under time pressure (structure, naming, a test or two)',
      'A deliberate plan for using the AI assistant well — what to delegate, what to verify, where it slows you down',
    ],
  },
]

export const FIRST_BUILD_STAGE = BUILD_STAGES[0]

export function getBuildStage(id: string): BuildStage {
  return BUILD_STAGES.find((s) => s.id === id) || FIRST_BUILD_STAGE
}
