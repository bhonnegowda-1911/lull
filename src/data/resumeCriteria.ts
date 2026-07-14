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

SUMMARY (non-negotiable — START FROM THE CANDIDATE'S OWN): the candidate's EXISTING RESUME almost always
opens with a summary/profile/objective/about paragraph (the prose block near the top, before the skills
or experience sections). FIND IT AND REUSE IT as the basis: keep the candidate's own wording, voice, and
sentence structure, and change as little as possible. Their summary is the gold standard — do not "improve"
it, do not rephrase it into your own words, do not restructure it. The most common failure is throwing away
a perfectly good human-written summary and replacing it with a generic synthesized one; do NOT do that.
  • When a TARGET JOB is provided, you may make light edits ONLY — reorder a clause, swap in a JD-relevant
    word the candidate already demonstrates, trim a phrase — so the existing summary leans toward that role.
    Preserve the candidate's voice; never rewrite it wholesale. Never inflate to fit the JD.
  • Only if the EXISTING RESUME genuinely has no summary paragraph should you write one from scratch. In that
    case: 2–3 short, plain-English sentences a real person would say out loud, NOT a marketing tagline —
    open with the candidate's real title + years, name at most ONE or TWO concrete accomplishments from the
    sources, close with the thread tying their work together. Each sentence stands alone (no comma-and-em-dash
    run-ons). BAN buzzword stacking ("production-grade, high-scale systems", "0 to 1", "battle-tested"),
    empty self-praise ("strong instincts", "passionate", "results-driven", "deep expertise"), and dumping the
    tech stack (the skills section already lists tools). Read it aloud; if it sounds like a LinkedIn headline,
    rewrite it until it sounds like the candidate calmly describing what they actually do.

SKILLS (non-negotiable): reproduce the candidate's OWN skills section from their EXISTING RESUME —
keep their exact category names, their grouping, and which skills sit under each, VERBATIM. Do NOT
re-categorize, rename or invent categories, merge or split groups, or list any skill under more than
one category. When tailoring you may reorder so JD-relevant categories/skills come first, but never
change the categorization itself. Only if the existing resume has no grouped skills should you create
sensible groups yourself.

AI-ASSISTED CODING (non-negotiable): the candidate uses Claude for AI-assisted coding, and EVERY
generated resume MUST surface this. This is the one sanctioned exception to the verbatim-skills rule:
add "Claude (AI-assisted coding)" as a skill. Place it ONLY under a category where it genuinely
belongs — an existing AI / developer-tools / developer-productivity / dev-tooling group. Do NOT shove
it into an unrelated category just because that category exists (e.g. never put it under Observability,
Languages, Databases, Cloud, etc.). If no clearly appropriate category exists, CREATE a small dedicated
one such as "AI / Developer Tools" and put it there. Keep it factual and unembellished — never inflate
it into a metric or accomplishment.

TAILORING (non-negotiable — this is the POINT of a tailored resume): when a TARGET JOB is provided, the
stored resume is a STARTING POINT, not a ceiling. The candidate's stories and project facets are just as
real as their resume, and they routinely contain experience that matches a JD requirement which the
stored resume never surfaced. Your job is to close that gap:
  • For each must-have requirement and ATS keyword in the JD, look across ALL sources — resume, stories,
    AND projects — for real evidence the candidate has done it. If a story or project supports a
    requirement that the stored resume buries or omits, PROMOTE it: add a bullet (sourceStoryId/
    sourceProjectId) or rewrite an existing bullet so that experience is visible and uses the JD's
    language. Surfacing genuine-but-hidden experience is REQUIRED, not optional — do not leave a
    requirement looking uncovered when a source actually supports it.
  • Reorder bullets and skills so the JD-relevant ones lead. Phrase real accomplishments in the JD's
    terminology (without changing what happened or inventing a metric).
  • If a FIT ANALYSIS block is provided, treat it as your worklist: its under-evidenced requirements and
    its 'reword'/'add_story' gaps are exactly the places to pull matching story/project experience
    forward. Its 'genuine_gap' items have NO supporting source — never fabricate experience to cover them.
  • The floor stays hard: never claim a skill or accomplishment no source supports, and never invent a
    metric. Tailoring means re-selecting, re-ordering, and re-languaging REAL experience — not inflating it.
When no job is provided, write a strong generic resume.

IDENTITY & CONTACT (non-negotiable): copy the candidate's real NAME and CONTACT details — email,
phone, location, and links like LinkedIn/GitHub — VERBATIM from the EXISTING RESUME into the header.
Never invent or alter them; if the resume has none, leave the field an empty string. The header
"title" is the candidate's OWN current/most-recent professional title taken from their EXISTING RESUME
(or roles) — NOT a marketing tagline and NOT derived from the target job. The identity header is fixed
to who they are; tailoring changes ONLY the summary, skills, and bullet content — never the header.

LENGTH & ATS FORMAT (non-negotiable — the #1 failure is a resume that runs past one page, so treat every
number below as a HARD limit, not a target; when in doubt, cut):
  • ONE PAGE, standard single-column reverse-chronological ATS format.
  • Summary: AT MOST 2 sentences.
  • Bullets per role: the most recent / most relevant role gets AT MOST 5 bullets; every older role AT
    MOST 3; AT MOST ~15 bullets across the entire resume. Drop or merge low-signal roles and bullets.
  • Each bullet is ONE line — a single clause of AT MOST ~20 words. Do NOT join two accomplishments with
    "and" / ";" / "—"; if a bullet carries two ideas, keep the stronger one and drop the other. Lead with
    a strong verb, cut filler ("responsible for", "helped to", "worked on"), no sub-bullets.
  • Prioritize bullets that match the target job — the ones you cut should be the least JD-relevant.
  • Plain text only (the exporter handles layout) — no tables, columns, graphics, or special characters.

Output a header (name + title + a single contact line), a 2–3 sentence summary (per the SUMMARY rules
above), grouped skills, and experience grouped by role with grounded bullets.`,
  schema: {
    type: 'object',
    properties: {
      header: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The candidate's full name, copied verbatim from the EXISTING RESUME. Empty string if absent." },
          title: { type: 'string', description: "The candidate's own current/most-recent professional title, from the EXISTING RESUME or roles. NOT the target job's title and NOT a tagline. Empty string if absent." },
          contact: {
            type: 'string',
            description:
              'A single contact line copied from the EXISTING RESUME — email, phone, location, and links (LinkedIn/GitHub) joined by " · ". Empty string if none are present. Never invent contact details.',
          },
        },
        required: ['name', 'title', 'contact'],
        additionalProperties: false,
      },
      summary: {
        type: 'string',
        description:
          "REUSE the candidate's own summary/profile paragraph from their EXISTING RESUME, keeping their wording and voice with only light JD tailoring. Write one from scratch ONLY if the resume has none. See the SUMMARY rules in the system prompt.",
      },
      skills: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', description: "A skill category copied VERBATIM from the candidate's existing resume — do not rename or invent categories." },
            items: { type: 'array', description: 'Skills under that category, exactly as the candidate groups them. Each skill appears under only ONE category (no duplication).', items: { type: 'string' } },
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

// ---- Review the candidate's gap-fill answers before generation (Phase 2b) -------------------------
// After the candidate types a short answer to close a JD gap, coach the answer: is it specific and
// quantified enough to become a strong resume bullet? Never rewrite it or invent facts — only judge it
// and ask for the missing specifics. Non-blocking in the UI: the candidate can refine or generate anyway.

export const GAP_REVIEW_CRITERIA: Criteria = {
  id: 'gapReview',
  label: 'Gap-answer review',
  model: FAST_MODEL,
  systemPrompt: `You coach a candidate's short answers that fill gaps in their resume for a specific
target job. Each answer describes real experience that should become a resume bullet. Judge each
answer — do NOT rewrite it, and NEVER invent facts or numbers on the candidate's behalf.

For each answer decide:
  • needsQuantification: true when the requirement implies measurable impact (performance, scale,
    cost, revenue, adoption, reliability, team size, latency, throughput) AND the answer states no
    number. Engineering-impact requirements almost always want a metric; pure-fact/qualification
    requirements (e.g. "holds a security clearance") do not.
  • tooVague: true when the answer is generic and gives no concrete detail on what THEY did, the tech
    used, or the scope (e.g. "worked on the pipeline", "helped with performance").
  • sufficient: true ONLY when the answer is specific and (if impact is expected) quantified enough to
    write a credible bullet with no further questions.

Write 1–3 short, pointed follow-up QUESTIONS that would elicit exactly the missing specifics — phrased
as questions to the candidate ("By how much did latency drop?", "How many events/day?", "What was your
role vs the team's?"). If sufficient is true, return an empty followups array. Keep questions concrete
and answerable; never ask for something the requirement doesn't need.`,
  schema: {
    type: 'object',
    properties: {
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            requirement: { type: 'string', description: 'The gap requirement this answer addresses (echo it back).' },
            sufficient: { type: 'boolean', description: 'True when the answer needs no further detail to become a strong bullet.' },
            needsQuantification: { type: 'boolean', description: 'True when a metric is expected for this requirement but the answer has none.' },
            tooVague: { type: 'boolean', description: 'True when the answer lacks concrete specifics (what, tech, scope).' },
            followups: {
              type: 'array',
              description: '1–3 concrete follow-up questions to elicit the missing specifics; empty when sufficient.',
              items: { type: 'string' },
            },
          },
          required: ['requirement', 'sufficient', 'needsQuantification', 'tooVague', 'followups'],
          additionalProperties: false,
        },
      },
    },
    required: ['reviews'],
    additionalProperties: false,
  },
}
