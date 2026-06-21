// The grading spine of the Build mode. The candidate does the implementation offline; in here
// we coach and grade PRIORITIZATION. The final report scores these five dimensions, with the
// two "primary" ones (scoping + a running core) weighted most — being good at prioritization is
// the whole point of this mode. Each dimension carries mid/senior/staff anchors so levels mean
// the same thing every run. The level ladder itself (junior/mid/senior/staff) is shared with
// the system-design report, which owns it.

export interface RubricDimension {
  id: string
  label: string
  /** Primary dimensions (the prioritization core) are weighted most in the overall level. */
  weight: 'primary' | 'secondary'
  description: string
  levels: { mid: string; senior: string; staff: string }
}

export const RUBRIC: RubricDimension[] = [
  {
    id: 'scoping',
    label: 'Scoped to something achievable',
    weight: 'primary',
    description: 'Cut the problem down to a slice that could actually be finished in the time box.',
    levels: {
      mid: 'Takes the prompt at face value or bites off more than is finishable; no explicit cut line.',
      senior: 'Commits to a concrete, finishable slice and states what is deferred.',
      staff: 'Scopes around the riskiest/most valuable part and sequences so the slice is always shrinkable if time runs short.',
    },
  },
  {
    id: 'running-core',
    label: 'Identified a running core',
    weight: 'primary',
    description: 'A thin end-to-end path that runs early, built in an order that keeps something working.',
    levels: {
      mid: 'Plans by component (build everything, wire at the end) so nothing runs until late; or no clear core.',
      senior: 'Names a vertical slice that runs end-to-end and a build order that keeps it runnable.',
      staff: 'Walking-skeleton mindset — something runs almost immediately, then hardens, with rabbit holes consciously avoided.',
    },
  },
  {
    id: 'security',
    label: 'Flagged the security / sandboxing risk',
    weight: 'secondary',
    description: 'Recognized the danger of running untrusted code and treated it as a first-class concern.',
    levels: {
      mid: 'Misses or hand-waves the untrusted-code risk; treats the toy slice as safe.',
      senior: 'Calls out the sandboxing/isolation risk and a pragmatic stance (defer with eyes open vs. handle now).',
      staff: 'Reasons about the real attack surface (isolation, resource limits, blast radius) and where it sits in the priority order.',
    },
  },
  {
    id: 'code-quality',
    label: 'Plan for code quality under time',
    weight: 'secondary',
    description: 'A realistic plan to keep the code clean and correct without over-polishing.',
    levels: {
      mid: 'Either ignores quality or plans to gold-plate; no sense of the quality/speed tradeoff.',
      senior: 'Plans sensible structure, naming, and a test or two on the core, balanced against the clock.',
      staff: 'Targets quality where it pays off (the core path, the dangerous bits) and accepts rough edges elsewhere on purpose.',
    },
  },
  {
    id: 'ai-usage',
    label: 'How you used the AI',
    weight: 'secondary',
    description: 'A deliberate plan for leaning on the AI assistant — delegating, verifying, and knowing its limits.',
    levels: {
      mid: 'Vague ("I’ll just ask the AI") or no plan; would trust output without checking.',
      senior: 'Delegates boilerplate and unfamiliar APIs to the AI but verifies the risky parts and keeps ownership of the design.',
      staff: 'Uses the AI as a force multiplier with judgment — what to delegate, what to never trust, where it would actually slow them down.',
    },
  },
]

export function getDimension(id: string): RubricDimension | undefined {
  return RUBRIC.find((d) => d.id === id)
}

/** Resolve a dimension id to its display label (passed to the shared report renderer). */
export function dimensionLabel(id: string): string {
  return getDimension(id)?.label ?? id
}
