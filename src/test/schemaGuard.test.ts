import { describe, expect, it } from 'vitest'
import { findUnsupportedKeywords } from '../lib/schemaGuard'
import { STAR_CRITERIA } from '../data/criteria'
import { JD_PARSE_CRITERIA, RESUME_FIT_CRITERIA, RESUME_GEN_CRITERIA } from '../data/resumeCriteria'
import { REPORT_SCHEMA } from '../lib/sysdesign/report'
import { SCHEMA as FACET_CHAT_SCHEMA } from '../lib/projects/facetChat'
import { SCHEMA as BOOTSTRAP_SCHEMA } from '../lib/projects/bootstrap'
import { SCHEMA as EXTRACT_SCHEMA } from '../lib/stories/extract'
import { SCHEMA as COACH_SCHEMA } from '../lib/stories/coach'
import { GENERATE_SCHEMA as FOLLOWUPS_SCHEMA } from '../lib/followups'
import { TURN_SCHEMA as BUILD_TURN_SCHEMA } from '../lib/build/conversation'
import { TURN_SCHEMA as SYSDESIGN_TURN_SCHEMA } from '../lib/sysdesign/conversation'
import { INTERVIEW_REVIEW_SCHEMA } from '../data/interviewReviewCriteria'
import { INTERVIEW_STORIES_SCHEMA } from '../lib/stories/extractFromInterview'

// Anthropic's structured-output json_schema rejects numeric range keywords (minimum/maximum/…) at
// request time with a 400. This walks every LLM schema in the app and fails the build if one slips
// in — catching the class of bug that broke resume-fit, instead of finding it in front of the user.

const ALL_SCHEMAS: Record<string, unknown> = {
  STAR_CRITERIA: STAR_CRITERIA.schema,
  JD_PARSE_CRITERIA: JD_PARSE_CRITERIA.schema,
  RESUME_FIT_CRITERIA: RESUME_FIT_CRITERIA.schema,
  RESUME_GEN_CRITERIA: RESUME_GEN_CRITERIA.schema,
  REPORT_SCHEMA,
  FACET_CHAT_SCHEMA,
  BOOTSTRAP_SCHEMA,
  EXTRACT_SCHEMA,
  COACH_SCHEMA,
  FOLLOWUPS_SCHEMA,
  BUILD_TURN_SCHEMA,
  SYSDESIGN_TURN_SCHEMA,
  INTERVIEW_REVIEW_SCHEMA,
  INTERVIEW_STORIES_SCHEMA,
}

describe('LLM schemas use only keywords Anthropic structured output supports', () => {
  for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
    it(`${name} has no unsupported keywords`, () => {
      expect(findUnsupportedKeywords(schema)).toEqual([])
    })
  }
})

describe('findUnsupportedKeywords', () => {
  it('flags minimum/maximum used as integer constraints', () => {
    const bad = { type: 'object', properties: { n: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['n'] }
    expect(findUnsupportedKeywords(bad).sort()).toEqual(['$.properties.n.maximum', '$.properties.n.minimum'])
  })

  it('does not flag a field literally NAMED "minimum"', () => {
    const ok = { type: 'object', properties: { minimum: { type: 'string' } }, required: ['minimum'] }
    expect(findUnsupportedKeywords(ok)).toEqual([])
  })

  it('returns [] for a clean schema', () => {
    expect(findUnsupportedKeywords({ type: 'string' })).toEqual([])
  })
})
