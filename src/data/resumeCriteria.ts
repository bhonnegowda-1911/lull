import type { Criteria } from './criteria'
import { FAST_MODEL, RESUME_MODEL } from '../lib/models'

// Resume/job-fit prompts + schemas as DATA (same Criteria shape as STAR_CRITERIA). Phase 1 covers
// parsing a job description into structure and scoring a resume against it; the resume GENERATOR
// (Phase 2) slots in here as a third Criteria with no analyzer/UI rework. `schema` constrains the
// chatStructured output (see lib/resume/*) — the TS types it must match live in src/types.ts.

const LEVELS = ['junior', 'mid', 'senior', 'staff', 'principal']
const SEVERITY = ['high', 'medium', 'low']

// ---- Parse a job description into structure ------------------------------

export const JD_PARSE_CRITERIA: Criteria = {
  id: 'jdParse',
  label: 'Job-description parse',
  model: FAST_MODEL,
  systemPrompt: `You extract structure from a pasted job description. Use ONLY what the text states —
do not invent requirements. Normalize seniority to one of junior/mid/senior/staff/principal from the
title and responsibilities. Separate genuine MUST-HAVES (required) from NICE-TO-HAVES. For each
must-have skill give a short category (e.g. language, framework, domain, leadership, system-design).
"keywords" are concrete ATS terms (tools, technologies, methodologies) a resume should echo. If a
field is not stated, use an empty string or empty array.`,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The role title.' },
      company: { type: 'string', description: 'Company, or empty string if not stated.' },
      seniority: { type: 'string', enum: LEVELS, description: 'Normalized seniority.' },
      mustHaveSkills: {
        type: 'array',
        description: 'Required skills/qualifications.',
        items: {
          type: 'object',
          properties: {
            skill: { type: 'string' },
            category: { type: 'string', description: 'e.g. language, framework, domain, leadership.' },
          },
          required: ['skill', 'category'],
          additionalProperties: false,
        },
      },
      niceToHaveSkills: { type: 'array', description: 'Preferred/bonus skills.', items: { type: 'string' } },
      responsibilities: { type: 'array', description: 'Core responsibilities.', items: { type: 'string' } },
      keywords: { type: 'array', description: 'Concrete ATS terms the resume should cover.', items: { type: 'string' } },
    },
    required: ['title', 'company', 'seniority', 'mustHaveSkills', 'niceToHaveSkills', 'responsibilities', 'keywords'],
    additionalProperties: false,
  },
}

// ---- Score a resume against a parsed job --------------------------------

const coverageItem = {
  type: 'object',
  properties: {
    requirement: { type: 'string', description: 'A specific must-have requirement.' },
    status: { type: 'string', enum: ['covered', 'partial', 'missing'], description: 'How well the resume evidences it.' },
    evidence: { type: ['string', 'null'], description: 'The resume phrase that covers it, or null.' },
    severity: { type: 'string', enum: SEVERITY, description: 'How much a gap here matters for this role.' },
  },
  required: ['requirement', 'status', 'evidence', 'severity'],
  additionalProperties: false,
}

const gapItem = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short gap name.' },
    detail: { type: 'string', description: 'What is missing or weak, and why it matters.' },
    severity: { type: 'string', enum: SEVERITY },
    fixable: {
      type: 'string',
      enum: ['reword', 'add_story', 'genuine_gap'],
      description:
        "'reword' = candidate likely has it but the resume doesn't surface it; 'add_story' = a story in the candidate's bank likely covers it; 'genuine_gap' = a real missing qualification.",
    },
  },
  required: ['title', 'detail', 'severity', 'fixable'],
  additionalProperties: false,
}

export const RESUME_FIT_CRITERIA: Criteria = {
  id: 'resumeFit',
  label: 'Resume ↔ job fit',
  model: RESUME_MODEL,
  systemPrompt: `You are a pragmatic technical recruiter scoring how well a candidate's resume fits a
specific parsed job description. Fit is a SCORE plus structured GAPS — never a binary yes/no.

Judge: (1) coverage of each must-have requirement (covered/partial/missing) with the exact resume
evidence when present; (2) seniority match between the JD level and the level the resume implies;
(3) ATS keyword coverage; (4) whether impact is quantified. fitScore is 0–100 holistic.

For every gap, set "fixable": use 'reword' when the candidate plausibly has the experience but the
resume doesn't surface it; use 'add_story' when a title in the provided STORY BANK looks like it
covers the gap; use 'genuine_gap' only for a real missing qualification. Ground everything in the
resume and JD text — do not invent experience the resume doesn't show.`,
  schema: {
    type: 'object',
    properties: {
      fitScore: { type: 'integer', description: 'Holistic fit, 0–100.' },
      verdict: { type: 'string', enum: ['strong', 'plausible', 'stretch', 'mismatch'] },
      seniorityMatch: {
        type: 'object',
        properties: {
          jdLevel: { type: 'string' },
          resumeImpliedLevel: { type: 'string' },
          assessment: { type: 'string', enum: ['under', 'match', 'over'] },
          note: { type: 'string' },
        },
        required: ['jdLevel', 'resumeImpliedLevel', 'assessment', 'note'],
        additionalProperties: false,
      },
      requirementCoverage: { type: 'array', items: coverageItem },
      keywordCoverage: {
        type: 'object',
        properties: {
          matched: { type: 'array', items: { type: 'string' } },
          missing: { type: 'array', items: { type: 'string' } },
          coveragePct: { type: 'integer', description: 'Percent of keywords covered, 0–100.' },
        },
        required: ['matched', 'missing', 'coveragePct'],
        additionalProperties: false,
      },
      quantifiedImpact: {
        type: 'object',
        properties: {
          score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          note: { type: 'string' },
        },
        required: ['score', 'note'],
        additionalProperties: false,
      },
      gaps: { type: 'array', items: gapItem },
      strengths: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string', description: 'One- or two-sentence overall read.' },
    },
    required: [
      'fitScore',
      'verdict',
      'seniorityMatch',
      'requirementCoverage',
      'keywordCoverage',
      'quantifiedImpact',
      'gaps',
      'strengths',
      'summary',
    ],
    additionalProperties: false,
  },
}

// ---- Generate a JD-targeted resume from ground truth (Phase 2) -----------

const resumeBullet = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'One impact bullet: strong verb + what you did + quantified outcome. No periods of fluff.' },
    sourceStoryId: { type: ['string', 'null'], description: 'Id of the SOURCE story this bullet traces to, or null.' },
    sourceProjectId: { type: ['string', 'null'], description: 'Id of the SOURCE project this bullet traces to, or null.' },
    sourceResume: { type: 'boolean', description: 'True when reused or tightened from the candidate\'s EXISTING RESUME (no story/project id). Exactly one source must apply.' },
    metric: { type: 'string', description: 'A real metric copied from the source (e.g. "p99 800ms → 480ms"). Omit if the source has none — never invent one.' },
  },
  required: ['text', 'sourceStoryId', 'sourceProjectId', 'sourceResume'],
  additionalProperties: false,
}

export const RESUME_GEN_CRITERIA: Criteria = {
  id: 'resumeGen',
  label: 'Resume generation',
  model: RESUME_MODEL,
  systemPrompt: `You generate a resume STRICTLY from the candidate's own ground truth — their EXISTING
RESUME, their story bank, and their project facets — optionally tailored to a target job. This is the
whole ballgame:

GROUNDING RULE (non-negotiable): every experience bullet MUST trace to exactly one provided source:
  • a story → set sourceStoryId to its exact id (sourceProjectId null, sourceResume false), OR
  • a project → set sourceProjectId to its exact id (sourceStoryId null, sourceResume false), OR
  • the candidate's existing resume → set sourceResume true (both ids null).
Start from the existing resume — reuse its real companies, titles, dates, and bullets, tightening and
tailoring them — then ENRICH with stronger, more specific bullets from the stories and projects where
they add depth or quantified impact. Never invent a metric, company, title, date, or accomplishment
that none of the sources contain. If a number isn't in any source, the bullet has no metric. Do not
pad with generic filler bullets.

WRITING: each bullet is an impact statement — strong action verb + what YOU did + the quantified
outcome when a source gives one. Prefer the candidate's "i"/owned work over "we". Group bullets under
the role (company/title/dates) they belong to, taken from the candidate's roles or their resume.

TAILORING: when a TARGET JOB is provided, prioritize and phrase the bullets, summary, and skills to
echo its must-have requirements and ATS keywords — but ONLY using real experience from the sources.
Never claim a skill the sources don't support. When no job is provided, write a strong generic resume.

Output a header (a one-line headline + the target role), a 1-2 sentence summary, grouped skills, and
experience grouped by role with grounded bullets.`,
  schema: {
    type: 'object',
    properties: {
      header: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'One-line positioning headline.' },
          targetRole: { type: 'string', description: 'The role this resume targets.' },
        },
        required: ['headline', 'targetRole'],
        additionalProperties: false,
      },
      summary: { type: 'string', description: '1-2 sentence professional summary, grounded in the sources.' },
      skills: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'e.g. Languages, Infrastructure, Domains.' },
            items: { type: 'array', items: { type: 'string' } },
          },
          required: ['category', 'items'],
          additionalProperties: false,
        },
      },
      experience: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            company: { type: 'string' },
            role: { type: 'string' },
            dates: { type: 'string', description: 'From the candidate roles; empty string if unknown.' },
            bullets: { type: 'array', items: resumeBullet },
          },
          required: ['company', 'role', 'dates', 'bullets'],
          additionalProperties: false,
        },
      },
    },
    required: ['header', 'summary', 'skills', 'experience'],
    additionalProperties: false,
  },
}
