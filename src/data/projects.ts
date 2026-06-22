import type { BehavioralLevel } from '../types'

// Projects are the rich GROUND TRUTH a behavioral answer is mined from: one major effort captured
// across competency facets. The facets ARE the axes behavioral prompts are drawn from, so one
// project feeds many prompts. Following the "rubrics as data" pattern (data/criteria.ts, the
// sysdesign levelRubric), the capture prompts live here as DATA and are calibrated to the target
// level — senior/staff push on scope, org influence, and second-order consequences.

export type FacetId =
  | 'technicalDepth'
  | 'otherHardParts'
  | 'crossFunctional'
  | 'ambiguity'
  | 'influence'
  | 'disagreeCommit'
  | 'prioritization'
  | 'ownership'

/**
 * One facet's captured answer, built conversationally to the STAR method. The four beats are the
 * structured ground truth; `text` is the flattened STAR prose every downstream reader consumes
 * (matchProjects, the coaching grader, serialization) — so adding structure didn't widen the blast
 * radius. Legacy projects stored a bare string per facet; `toFacetAnswer` lifts those into `text`.
 */
export interface FacetAnswer {
  situation: string
  task: string
  action: string
  result: string
  text: string
}

export type ProjectFacets = Record<FacetId, FacetAnswer>

export interface Project {
  id: string
  title: string
  roleRef: string | null
  summary: string
  facets: ProjectFacets
  targetLevelAtCapture: BehavioralLevel | null
}

export interface FacetDef {
  id: FacetId
  label: string
  helper: string
  /** Which prompt categories this facet can answer — drives matchProjects. */
  categories: string[]
  /** The capture question, by target level. Falls back to senior (see facetPrompt). */
  prompts: Partial<Record<BehavioralLevel, string>>
}

export const FACETS: FacetDef[] = [
  {
    id: 'technicalDepth',
    label: 'Hardest part technically',
    helper: 'The single most technically demanding part — and why it was hard.',
    categories: ['Ambiguity & judgment', 'Impact'],
    prompts: {
      mid: 'What was the hardest technical part, and how did you solve it?',
      senior:
        'What was the hardest technical problem here, what tradeoffs did you weigh, and why was your approach the right call?',
      staff:
        'What was the crux technical problem, how did you frame it for others, and what second-order consequences (cost, failure, evolution) did you reason about?',
      principal:
        'What was the defining technical bet, and how did it shape direction beyond this project?',
    },
  },
  {
    id: 'otherHardParts',
    label: 'Other hard parts',
    helper: 'Non-technical difficulties: people, process, timeline, unknowns.',
    categories: ['Execution', 'Failure & mistakes'],
    prompts: {
      mid: 'What else was hard about this — beyond the code?',
      senior: 'What non-technical obstacles (people, process, timeline) did you have to get past, and how?',
      staff: 'What systemic or organizational obstacles did you remove so the work could land?',
    },
  },
  {
    id: 'crossFunctional',
    label: 'Cross-functional touchpoints',
    helper: 'Who outside engineering you worked with and what each needed.',
    categories: ['Non-technical stakeholders', 'Teamwork'],
    prompts: {
      mid: 'Who outside your team did you work with on this?',
      senior:
        'Which cross-functional partners (PM, design, sales, support) did you work with, what did each need, and how did you keep them aligned?',
      staff:
        'How did you align competing cross-functional interests and drive a decision across them?',
    },
  },
  {
    id: 'ambiguity',
    label: 'Where was the ambiguity',
    helper: 'What was unclear/undecided, and how you created clarity.',
    categories: ['Ambiguity & judgment', 'Managerial round'],
    prompts: {
      mid: 'What was unclear at the start, and how did you figure out what to do?',
      senior:
        'Where was the real ambiguity (scope, requirements, approach), and how did you create clarity and decide when to commit?',
      staff:
        'What was the deepest ambiguity, and how did you set a direction others could follow despite it?',
    },
  },
  {
    id: 'influence',
    label: 'How I influenced',
    helper: 'How you moved people/decisions, especially without authority.',
    categories: ['Leadership & influence', 'Non-technical stakeholders'],
    prompts: {
      mid: 'Whose mind did you change or whose buy-in did you need, and how?',
      senior:
        'How did you influence a decision without formal authority — whose incentives did you understand, and what was the result?',
      staff:
        'How did you build coalition and shift the direction of people you did not control, at team/org scope?',
    },
  },
  {
    id: 'disagreeCommit',
    label: 'Disagree & commit',
    helper: 'A disagreement you raised — and how it resolved.',
    categories: ['Conflict'],
    prompts: {
      mid: 'Was there a decision you disagreed with? What did you do?',
      senior:
        'Where did you disagree (with a peer or your manager), how did you make the case with data, and how did you commit once decided?',
      staff:
        'On the highest-stakes disagreement, how did you push back, and how did you commit and bring others along after the call?',
    },
  },
  {
    id: 'prioritization',
    label: 'How I prioritized',
    helper: 'What you cut/sequenced and the criteria you used.',
    categories: ['Execution'],
    prompts: {
      mid: 'How did you decide what to do first?',
      senior:
        'With competing demands and a clock, what did you cut or sequence, and what criteria (impact, risk, urgency) drove it?',
      staff:
        'How did you decide this was the highest-leverage thing to do at all, versus the alternatives?',
    },
  },
  {
    id: 'ownership',
    label: 'What I owned',
    helper: 'Your specific scope — what was yours vs. the team’s.',
    categories: ['Leadership & influence', 'Impact'],
    prompts: {
      mid: 'What part of this was yours specifically?',
      senior:
        'What did you own end-to-end, which calls were yours vs. your manager’s, and what was the quantified impact?',
      staff:
        'What did you own at the org level — what direction did you set that others executed, and what was the business impact?',
      principal:
        'What company-level outcome did you own, and how did your direction outlast the project?',
    },
  },
]

const FALLBACK: BehavioralLevel = 'senior'

/** The capture question for a facet at a given target level (falls back to senior, then label). */
export function facetPrompt(facet: FacetDef, level: BehavioralLevel): string {
  return facet.prompts[level] ?? facet.prompts[FALLBACK] ?? facet.label
}

export function emptyFacetAnswer(): FacetAnswer {
  return { situation: '', task: '', action: '', result: '', text: '' }
}

export function emptyFacets(): ProjectFacets {
  return {
    technicalDepth: emptyFacetAnswer(),
    otherHardParts: emptyFacetAnswer(),
    crossFunctional: emptyFacetAnswer(),
    ambiguity: emptyFacetAnswer(),
    influence: emptyFacetAnswer(),
    disagreeCommit: emptyFacetAnswer(),
    prioritization: emptyFacetAnswer(),
    ownership: emptyFacetAnswer(),
  }
}

/** Normalize a stored facet value to a FacetAnswer. Legacy projects stored a bare string. */
export function toFacetAnswer(value: string | FacetAnswer | null | undefined): FacetAnswer {
  if (value == null) return emptyFacetAnswer()
  if (typeof value === 'string') return { ...emptyFacetAnswer(), text: value }
  return { ...emptyFacetAnswer(), ...value }
}

/** The flattened STAR prose for a facet — what every downstream reader consumes. */
export function facetText(value: string | FacetAnswer | null | undefined): string {
  return toFacetAnswer(value).text
}

/** Normalize a whole (possibly legacy/partial) facets blob into full ProjectFacets. */
export function toFacets(raw: Partial<Record<FacetId, string | FacetAnswer>> | null | undefined): ProjectFacets {
  const out = emptyFacets()
  if (raw) for (const f of FACETS) if (raw[f.id] != null) out[f.id] = toFacetAnswer(raw[f.id])
  return out
}

/** How many of a facet's four STAR beats are captured (non-empty). 0–4. */
export function facetBeatsCovered(value: string | FacetAnswer | null | undefined): number {
  const a = toFacetAnswer(value)
  return [a.situation, a.task, a.action, a.result].filter((b) => b.trim().length > 0).length
}

export function emptyProject(id: string): Project {
  return { id, title: '', roleRef: null, summary: '', facets: emptyFacets(), targetLevelAtCapture: null }
}

/**
 * Projects relevant to a behavioral prompt category: those with a NON-EMPTY facet that maps to the
 * category. Pure + tested. Empty facets are skipped so we never surface a project for "conflict"
 * when its disagree-commit facet is blank.
 */
export function matchProjects(promptCategory: string, projects: Project[], limit = 5): Project[] {
  const facetIdsForCategory = FACETS.filter((f) => f.categories.includes(promptCategory)).map((f) => f.id)
  const matched = projects.filter((p) =>
    facetIdsForCategory.some((id) => facetText(p.facets?.[id]).trim().length > 0),
  )
  return matched.slice(0, limit)
}

/** The facet ids relevant to a prompt category — used to serialize only the pertinent facets. */
export function facetsForCategory(promptCategory: string): FacetId[] {
  return FACETS.filter((f) => f.categories.includes(promptCategory)).map((f) => f.id)
}
