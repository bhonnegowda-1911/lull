import { DEFAULT_PROFILE, emptyStory, type Profile, type Story } from '../data/stories'
import { emptyProject, type Project } from '../data/projects'
import type { GapFill } from '../lib/resume/generate'
import type { ParsedJob } from '../types'

// The eval dataset: each case is a full candidate ground-truth bundle + a target JD + the assertions
// that make a good tailored resume. Cases are DATA so you can add real (anonymized) applications you
// care about. The scorers (scorers.ts) turn these expectations into pass/fail; the runner
// (resume.eval.ts) also measures tailoring lift by re-scoring the draft.

export interface EvalCase {
  name: string
  profile: Profile
  stories: Story[]
  projects: Project[]
  job: ParsedJob
  /** Optional gap answers to feed the generator, as the UI's GapFiller would. */
  gapFills?: GapFill[]
  /** Distinctive phrases from `gapFills` that MUST reach the resume (proves the answer was used). */
  gapMarkers?: string[]
  /** Terms with NO supporting source — the resume must not assert them (over-claim guard). */
  mustNotClaim?: string[]
  /** Minimum acceptable requirement-coverage fraction (0–1) for the deterministic layer. */
  minRequirementCoverage?: number
  /** The draft must re-score at least this far above the stored-resume baseline (tailoring lift). */
  minLiftOverBaseline?: number
}

function story(id: string, title: string, s: Partial<Story['star']>, metrics: string[] = []): Story {
  const st = emptyStory(id)
  st.title = title
  st.status = 'confirmed'
  st.star = { ...st.star, ...s }
  st.impact.metrics = metrics
  return st
}

// ---- Case 1: real hidden experience the stored resume buries -------------------------------------
// Candidate did heavy Kafka/streaming work (in a story + project) but their resume only says "backend
// services". A good tailored resume should SURFACE the streaming work for a streaming-heavy JD.

const streamingCase: EvalCase = {
  name: 'surfaces buried streaming experience',
  profile: {
    ...DEFAULT_PROFILE,
    roles: [{ company: 'PayForge', title: 'Senior Backend Engineer', start: '2021', end: 'present' }],
    resumeText: [
      'Priya Nair — Senior Backend Engineer',
      'priya.nair@example.com · San Francisco · github.com/pnair',
      '',
      'Summary: Backend engineer who builds reliable payment services and keeps them fast.',
      '',
      'Skills',
      'Languages: Go, Python',
      'Infrastructure: AWS, Postgres',
      '',
      'Experience',
      'PayForge — Senior Backend Engineer (2021–present)',
      '- Built and operated backend services for the billing platform.',
      '- Improved reliability of the payments API.',
    ].join('\n'),
  },
  stories: [
    story(
      'story-kafka',
      'Rebuilt billing on Kafka',
      {
        situation: 'Nightly batch billing was slow and lossy.',
        actions: ['Redesigned billing as a Kafka event pipeline', 'Added exactly-once processing'],
        result: 'Processed 2M events/day with no data loss',
      },
      ['2M events/day', 'p99 800ms → 300ms'],
    ),
  ],
  projects: [
    (() => {
      const p = emptyProject('proj-ledger')
      p.title = 'Event-driven ledger'
      p.summary = 'Sharded, event-sourced ledger behind billing.'
      p.facets.technicalDepth = { situation: '', task: '', action: '', result: '', text: 'Event sourcing with Kafka + gRPC services' }
      return p
    })(),
  ],
  job: {
    title: 'Senior Backend Engineer, Streaming',
    company: 'StreamCo',
    seniority: 'senior',
    mustHaveSkills: [
      { skill: 'Kafka', category: 'framework' },
      { skill: 'event-driven architecture', category: 'system-design' },
      { skill: 'Go', category: 'language' },
    ],
    niceToHaveSkills: ['gRPC', 'exactly-once processing'],
    responsibilities: ['Own real-time streaming pipelines', 'Scale event processing'],
    keywords: ['Kafka', 'event-driven', 'streaming', 'gRPC'],
  },
  minRequirementCoverage: 0.75,
  minLiftOverBaseline: 5,
}

// ---- Case 2: gap-fill answer must reach the resume, genuine gap must not be faked -----------------

const gapFillCase: EvalCase = {
  ...streamingCase,
  name: 'uses gap-fill answers and never fakes a genuine gap',
  gapFills: [
    { requirement: 'Kubernetes at scale', note: 'Ran the billing platform on EKS across 40 nodes with HPA autoscaling' },
  ],
  gapMarkers: ['EKS'],
  // No source mentions machine learning — the resume must not claim it.
  mustNotClaim: ['machine learning', 'PhD'],
}

export const EVAL_CASES: EvalCase[] = [streamingCase, gapFillCase]
