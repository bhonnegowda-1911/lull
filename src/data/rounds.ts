import type { RoundType } from '../types'

// The interview-round catalog (DATA). A single source of truth describing each round type a
// company's loop can contain — its label, how its prep items are sourced, and which practice mode
// it deep-links into. Mirrors the "criteria as data" style elsewhere (src/data/criteria.ts). Adding
// a round type here is enough for the loop builder, the per-round prep prediction, and the
// Practice → deep-link to pick it up — no component changes.

/** Which curated catalog a round's predicted prep items come from (drives RoundPrep's selector). */
export type PickSource = 'recruiter' | 'behavioral' | 'problem' | 'coding' | 'project' | 'mixed' | null
/** Which practice mode a round's "Practice →" deep-links into, or null when there's no single mode. */
export type PracticeMode = 'behavioral' | 'sysdesign' | 'coding' | 'build' | null

export interface RoundCatalogEntry {
  type: RoundType
  label: string
  blurb: string
  defaultDurationMin: number
  practiceMode: PracticeMode
  picks: PickSource
}

export const ROUND_CATALOG: RoundCatalogEntry[] = [
  {
    type: 'recruiter',
    label: 'Recruiter screen',
    blurb: 'The first call — motivation, logistics, and high-level fit.',
    defaultDurationMin: 30,
    practiceMode: 'behavioral',
    picks: 'recruiter',
  },
  {
    type: 'technical_screen',
    label: 'Technical screen',
    blurb: 'A live coding/DSA screen — a focused algorithmic problem.',
    defaultDurationMin: 60,
    practiceMode: 'coding',
    picks: 'coding',
  },
  {
    type: 'take_home',
    label: 'Take-home assignment',
    blurb: 'An async build/design assignment — scope and prioritize it.',
    defaultDurationMin: 0,
    practiceMode: 'build',
    picks: null,
  },
  {
    type: 'hiring_manager',
    label: 'Hiring manager',
    blurb: 'Ownership, collaboration, and why-this-role — managerial behavioral.',
    defaultDurationMin: 45,
    practiceMode: 'behavioral',
    picks: 'behavioral',
  },
  {
    type: 'project_deep_dive',
    label: 'Project deep-dive',
    blurb: 'Walk through a project end-to-end — grounded in your captured projects.',
    defaultDurationMin: 45,
    practiceMode: 'behavioral',
    picks: 'project',
  },
  {
    type: 'system_design',
    label: 'System design',
    blurb: 'A staged design interview against a canonical problem.',
    defaultDurationMin: 60,
    practiceMode: 'sysdesign',
    picks: 'problem',
  },
  {
    type: 'behavioral',
    label: 'Behavioral',
    blurb: 'STAR storytelling against the values this company states.',
    defaultDurationMin: 45,
    practiceMode: 'behavioral',
    picks: 'behavioral',
  },
  {
    type: 'onsite_loop',
    label: 'Onsite loop',
    blurb: 'The final loop — a mix of system design, behavioral, and project deep-dives.',
    defaultDurationMin: 240,
    practiceMode: null,
    picks: 'mixed',
  },
  {
    type: 'custom',
    label: 'Custom round',
    blurb: 'Anything else — describe it with a topic and focus areas.',
    defaultDurationMin: 60,
    practiceMode: null,
    picks: null,
  },
]

const BY_TYPE: Record<RoundType, RoundCatalogEntry> = Object.fromEntries(
  ROUND_CATALOG.map((r) => [r.type, r]),
) as Record<RoundType, RoundCatalogEntry>

/** The catalog entry for a round type. */
export function roundCatalog(type: RoundType): RoundCatalogEntry {
  return BY_TYPE[type] ?? BY_TYPE.custom
}

/** Default human label for a round type. */
export function roundLabel(type: RoundType): string {
  return roundCatalog(type).label
}
