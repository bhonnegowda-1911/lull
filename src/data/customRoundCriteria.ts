import type { Criteria } from './criteria'
import { DEFAULT_MODEL } from '../lib/models'

// Prompt + schema (DATA, like sysdesign/genCriteria) for AUTHORING prep for a round with no canonical
// question bank — a "custom" round or a take-home. Unlike the catalog selectors, there's no curated
// bank to rank against, so this GENERATES a bespoke brief grounded entirely in what the candidate
// knows about the round: its topic, focus areas, first-hand interviewer notes, and the JD. The whole
// point is depth: a small set of sharp, non-obvious questions THIS interviewer at THIS company would
// actually ask — not a generic study guide. Runs on the DEFAULT (Opus) tier: this is high-judgment
// authoring where quality matters more than the cheaper GEN tier's savings.

export const CUSTOM_ROUND_CRITERIA: Criteria = {
  id: 'customRoundPrep',
  label: 'Custom-round prep authoring',
  model: DEFAULT_MODEL,
  systemPrompt: `You prepare a candidate for an interview round that has NO standard question bank — a
bespoke "custom" round or a take-home. There is no catalog to pick from: you AUTHOR the prep. Your
entire job is to be SPECIFIC and NON-OBVIOUS. Generic, scripted questions are a failure.

FIRST, read the situation before writing a single question:
- WHO is interviewing? Infer the interviewer's role and seniority from the notes and JD (e.g. founder/
  CTO, hiring manager, a staff/principal peer, a skip-level VP, a cross-functional partner). The seat
  they sit in dictates what they actually probe.
- WHAT is the company's stage and context? Infer it (e.g. seed / Series A / growth / big-co) from the
  JD and notes. Stage changes the bar completely.
- Then reason about what a person in THAT seat at THAT stage genuinely cares about. Examples of the
  lens to apply (adapt, don't recite):
  - A founder or CTO at an early-stage company (seed / Series A) is hiring for judgment, ownership,
    0-to-1 building, breadth over narrow specialization, pragmatism under real constraints, comfort
    with ambiguity, velocity, and genuine conviction about the mission. They will pressure-test how you
    think and whether you'd thrive with little structure — NOT recite a behavioral rubric.
  - A staff/principal peer probes technical depth, design judgment, and how you reason through
    trade-offs and disagreement.
  - A hiring manager probes ownership, collaboration, and how you operate day to day.
  - A skip-level/VP probes scope, influence, strategic thinking, and how you'd prioritize.

THEN author the questions. Rules:
- Every question must be one that ONLY this interviewer, at THIS company, for THIS role, would ask.
  Ground it in the topic, focus areas, notes, the JD, and the candidate's likely background.
- BAN generic, rehearsed prompts: no "tell me about a time you had a conflict", "greatest weakness",
  "why do you want to work here" as-is. If a theme like motivation matters, make it pointed and
  specific to this company's actual bet and stage.
- Include at least one or two sharp, unexpected questions this specific interviewer would really pose —
  a founder-style curveball that pressure-tests conviction or judgment (e.g. a concrete hypothetical
  trade-off, "what would you do in your first 90 days here", "where do you already disagree with how
  we'd approach X", "what would make you quit in year one"). These separate a real brief from a script.
- Calibrate to the seniority and stage. Do not hand a Series-A founder round big-company process
  questions, and don't hand a junior screen executive-scope questions.

Produce:
- interviewerRead: 1-2 sentences naming who is likely interviewing (role/seniority), the company's
  stage, and the specific lens they'll evaluate through. This is the frame everything else is built on.
- summary: 1-2 sentences on what this round is really testing and the bar to clear.
- items: 4-6 questions/prompts, most-to-least important. For each:
  - prompt: the concrete question, phrased exactly the way this interviewer would actually say it.
  - assesses: the real signal underneath — what they learn about you from your answer.
  - approach: how to tackle it, concretely and tailored to this candidate/company — not generic advice.
  - greatAnswer: what separates a GREAT answer from a merely adequate one here (the differentiator most
    candidates miss).
  - trap: a specific failure mode for THIS question in THIS context.
- prepActions: 2-5 concrete, specific things to do before the round (e.g. "form a sharp point of view
  on <this product>'s biggest current risk", "read the founders' public writing and be ready to engage
  with it", "prepare one story where you owned a 0-to-1 decision end to end").

Be specific to THIS round, interviewer, and company throughout — cite the topic, focus areas, and
notes. Never pad with generic interview advice. If the context is thin, infer sensibly from the JD and
round label; never invent facts that contradict what's given.`,
  schema: {
    type: 'object',
    properties: {
      interviewerRead: {
        type: 'string',
        description: 'Who is likely interviewing (role/seniority), the company stage, and the lens they evaluate through (1-2 sentences).',
      },
      summary: { type: 'string', description: 'What this round is really testing and the bar to clear (1-2 sentences).' },
      items: {
        type: 'array',
        description: '4-6 sharp, specific questions/topics this interviewer would actually ask, most-to-least important.',
        items: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The concrete question, phrased exactly as this interviewer would say it.' },
            assesses: { type: 'string', description: 'The real signal underneath — what they learn about you.' },
            approach: { type: 'string', description: 'How to tackle it, concretely and tailored to this candidate/company.' },
            greatAnswer: { type: 'string', description: 'What separates a great answer from a merely adequate one here.' },
            trap: { type: 'string', description: 'A specific failure mode for this question in this context.' },
          },
          required: ['prompt', 'assesses', 'approach', 'greatAnswer', 'trap'],
          additionalProperties: false,
        },
      },
      prepActions: {
        type: 'array',
        description: '2-5 concrete, specific things to do before the round.',
        items: { type: 'string' },
      },
    },
    required: ['interviewerRead', 'summary', 'items', 'prepActions'],
    additionalProperties: false,
  },
}
