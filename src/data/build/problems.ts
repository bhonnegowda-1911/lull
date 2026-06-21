// Build-mode problem library. Each problem is a timed "design AND implement" challenge that the
// candidate IMPLEMENTS OFFLINE — in the app they only plan and prioritize. The `hints` are the
// grading reference for the coach/grader: high-signal pointers about what a well-prioritized
// PLAN looks like for this challenge. They are deliberately short — enough to anchor coaching
// and grading, not a full solution.

export interface BuildProblemHints {
  /** What a finishable, well-scoped slice looks like. */
  scope: string[]
  /** The thin end-to-end path that should run first, and a sane build order. */
  runningCore: string[]
  /** The security / sandboxing risk a strong candidate flags. */
  security: string[]
  /** How a strong candidate would lean on the AI assistant for this challenge. */
  aiUsage: string[]
  /** Prioritization traps specific to this challenge. */
  traps: string[]
}

export interface BuildProblem {
  id: string
  title: string
  difficulty: string
  /** The implementation language(s) the offline build would use; shown for context. */
  language: string
  statement: string
  hints: BuildProblemHints
}

export const BUILD_PROBLEMS: BuildProblem[] = [
  {
    id: 'remote-code-executor',
    title: 'Remote code executor',
    difficulty: 'Core',
    language: 'TypeScript / Node (or your choice)',
    statement:
      'A LeetCode-style remote code executor: an endpoint that accepts a snippet of code (start with one language), runs it with a time limit, and returns stdout/stderr and the exit status. You will implement it offline, timed. Here, plan and prioritize your approach for that timed build.',
    hints: {
      scope: [
        'One language, run-and-return; defer multi-language, test harnesses, and queuing',
        'A synchronous "submit → run → respond" is a fine first slice — async/queue can wait',
        'Pick the slice you can finish, not the most impressive architecture',
      ],
      runningCore: [
        'Spawn the interpreter on a temp file / stdin, capture stdout+stderr, return a structured result',
        'Get the happy path RUNNING first, then add the timeout that kills the process',
        'Walking skeleton: endpoint → execute → response wired end-to-end before any polish',
      ],
      security: [
        'The code is UNTRUSTED — isolation is the real problem (container/sandbox, no network, read-only FS)',
        'Resource limits: CPU, memory, output size, process/fork caps (fork-bomb defense)',
        'Even if deferred for the slice, say it out loud and never run untrusted code in the API process',
      ],
      aiUsage: [
        'Delegate boilerplate: the HTTP handler, child-process plumbing, temp-file handling',
        'Verify the risky bits yourself — the timeout actually killing the process tree, error paths',
        'Use the AI to recall sandboxing options (Docker, gVisor, isolate) but own the security call',
      ],
      traps: [
        'Planning a beautiful distributed design that cannot be built in the time box',
        'Building all the pieces and wiring at the end, so nothing runs until it is too late',
        'Treating the toy slice as safe and never naming the untrusted-code risk',
      ],
    },
  },
]

export const DEFAULT_BUILD_PROBLEM = BUILD_PROBLEMS[0]

export function getBuildProblem(id: string): BuildProblem {
  return BUILD_PROBLEMS.find((p) => p.id === id) || DEFAULT_BUILD_PROBLEM
}
