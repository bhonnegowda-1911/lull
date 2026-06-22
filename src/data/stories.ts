import { PROMPT_CATEGORIES } from './prompts'
import type { BehavioralLevel } from '../types'

// The Profile (resume + target level) and Story bank domain types. A "story" is a curated,
// ground-truth work narrative the coaching grader reads to critique CONTENT — never shown to the
// interviewer in interview mode. Story themes reuse the behavioral PROMPT_CATEGORIES vocabulary
// so a story maps cleanly to the prompts it can answer (see matchStories in lib/stories/match).

/** The shared theme/category vocabulary — same labels prompts are grouped by. */
export const STORY_THEMES = PROMPT_CATEGORIES

export type Ownership = 'i' | 'we' | 'mixed'
export type BlastRadius = 'self' | 'team' | 'org'

export interface RoleEntry {
  company: string
  title: string
  start?: string
  end?: string
}

export interface Profile {
  resumeText: string
  roles: RoleEntry[]
  targetLevel: BehavioralLevel
}

export const DEFAULT_PROFILE: Profile = { resumeText: '', roles: [], targetLevel: 'senior' }

/** The S/T/A/R ground truth — what actually happened, in the candidate's own record. */
export interface StoryStar {
  situation: string
  task: string
  actions: string[]
  result: string
}

/** Quantified scope/impact metadata — the part interviews most often undersell. */
export interface StoryImpact {
  metrics: string[]
  ownership: Ownership
  blastRadius: BlastRadius
}

export type StoryStatus = 'draft' | 'confirmed'

export interface Story {
  id: string
  title: string
  roleRef: string | null
  star: StoryStar
  impact: StoryImpact
  themes: string[]
  trueCeilingLevel: BehavioralLevel | null
  sourceSessionIds: string[]
  status: StoryStatus
  /** The project this story is mined from, if linked. */
  projectId: string | null
}

/** A freshly extracted story before it is persisted (no id/status/link yet). */
export type StoryDraft = Omit<Story, 'id' | 'status' | 'sourceSessionIds' | 'projectId'>

export const EMPTY_STAR: StoryStar = { situation: '', task: '', actions: [], result: '' }
export const EMPTY_IMPACT: StoryImpact = { metrics: [], ownership: 'i', blastRadius: 'team' }

/** A blank story for the manual editor. */
export function emptyStory(id: string): Story {
  return {
    id,
    title: '',
    roleRef: null,
    star: { ...EMPTY_STAR, actions: [] },
    impact: { ...EMPTY_IMPACT, metrics: [] },
    themes: [],
    trueCeilingLevel: null,
    sourceSessionIds: [],
    status: 'draft',
    projectId: null,
  }
}
